// API Route de importação Gerencial (ADR-0091).
// Roda em runtime Node ISOLADO do React Server Components — é o que resolve
// PEND-001: @e965/xlsx falhava quando o parser convivia com Server Actions na
// fronteira RSC. Aqui o parsing acontece fora do contexto RSC, eliminando a
// classe inteira de problemas de SSR/serialização.
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { parseGerencialExcel } from '@/lib/gerencial/parser'
import { computeDiffPorFatia, type LancamentoPlanilha, type LinhaFatia, type ImportDiff } from '@/lib/gerencial/import-types'
import { canonizarConta } from '@/lib/gerencial/normalizar-conta'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>

// v4.21.0 (M2): cliente de SESSÃO (não service role). batch_gerencial_import /
// get_gerencial_lancamentos_planilha exigem app.exigir_acesso(['financeiro/gerencial']).
async function rpc(fn: string, args?: Record<string, unknown>) {
  const db = await getServerClient()
  return (db.rpc as unknown as Rpc)(fn, args)
}

// v4.23.0 (M2/M3, ADR-0126): SINCRONIZAÇÃO POR FATIA. O diff sincroniza APENAS as linhas
// origem='planilha' do PRÓPRIO importador (originador = ele) — a fatia do colega NUNCA entra
// no cálculo (isolamento na origem; o DELETE da RPC reforça com `AND originador_id = eu`).
// Linhas antigas sem originador (NULL) não pertencem à fatia de ninguém → nunca removidas.
async function computeImportDiff(
  planilha: LancamentoPlanilha[],
  originadorId: string,
  manterDuplicadas: boolean,
): Promise<ImportDiff> {
  const { data: atuais, error } = await rpc('get_gerencial_lancamentos_planilha')
  if (error) throw new Error(`Falha ao carregar dados: ${error.message}`)

  // v4.22 (M6): import TOLERANTE — canoniza conta_previsao da planilha contra as contas reais
  // (lower/unaccent/trim + aliases: "Banco Itau"→Itaú, "ASAAS"→Asaas; nulos/órfãos→"Outras").
  // A fatia do banco já está canonizada; canonizar só a planilha realinha as duas pontas.
  const { data: saldos } = await rpc('get_gerencial_saldos')
  const contasReais = ((saldos as { conta: string }[] | null) ?? []).map(s => s.conta)
  const planilhaCanon = planilha.map(l => ({ ...l, conta_previsao: canonizarConta(l.conta_previsao, contasReais) }))

  // FATIA = só as linhas DELE. O filtro por originador_id é a 1ª barreira de isolamento.
  const fatia: LinhaFatia[] = (atuais as Array<Record<string, unknown>> ?? [])
    .filter(a => a.originador_id === originadorId)
    .map(a => ({
      id:             a.id as number,
      tipo:           a.tipo as string,
      pessoa:         a.pessoa as string,
      valor_final:    Number(a.valor_final),
      descricao:      (a.descricao as string | null) ?? null,
      conta_previsao: (a.conta_previsao as string | null) ?? null,
      vencimento:     a.vencimento as string,
    }))

  return computeDiffPorFatia(planilhaCanon, fatia, manterDuplicadas)
}

export async function POST(req: NextRequest) {
  // Guard v4.13: importação do Gerencial. v4.23.0: a sessão identifica o ORIGINADOR da fatia.
  const sessao = await requireAreaApi('financeiro/gerencial')
  if (sessao instanceof Response) return sessao
  if (!sessao.userId) return NextResponse.json({ error: 'Sessão sem usuário' }, { status: 403 })

  try {
    const formData = await req.formData()
    const file   = formData.get('file') as File | null
    const action = String(formData.get('action') ?? 'preview')
    const manterDuplicadas = String(formData.get('manterDuplicadas') ?? 'false') === 'true'

    if (!file)                          return NextResponse.json({ error: 'Nenhum arquivo enviado' },  { status: 400 })
    if (file.size > 10 * 1024 * 1024)   return NextResponse.json({ error: 'Arquivo maior que 10MB' },  { status: 400 })

    const buffer    = await file.arrayBuffer()
    const parseRes  = parseGerencialExcel(buffer)
    if (!parseRes.success) return NextResponse.json({ error: parseRes.error }, { status: 422 })

    const { lancamentos, warnings } = parseRes
    const diff = await computeImportDiff(lancamentos, sessao.userId, manterDuplicadas)

    if (action === 'preview') {
      return NextResponse.json({ diff, warnings })
    }

    if (action === 'commit') {
      // Proteção pontual (M4): ids desmarcados em "a remover" — NÃO removidos neste commit
      // (reaparecem na próxima importação; não viram manual). Só filtram a lista de remoção.
      const protegidos = new Set<number>(
        (() => { try { return JSON.parse(String(formData.get('protegidos') ?? '[]')) as number[] } catch { return [] } })(),
      )
      const removerIds = diff.aRemover.map(r => r.id).filter(id => !protegidos.has(id))

      const loteId = crypto.randomUUID()
      const agora  = new Date().toISOString()

      const { data, error } = await rpc('batch_gerencial_import', {
        p_adicionar:     diff.aAdicionar,
        p_remover_ids:   removerIds,
        p_atualizar:     diff.aAtualizar.map(u => ({
          id:             u.id,
          descricao:      u.novo.descricao,
          conta_previsao: u.novo.conta_previsao,
        })),
        p_lote_id:        loteId,
        p_importado_em:   agora,
        p_originador_id:   sessao.userId,
        p_originador_nome: sessao.nome ?? sessao.email ?? 'Usuário',
      })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({
        resumo: {
          adicionados: data?.adicionados ?? diff.aAdicionar.length,
          removidos:   data?.removidos   ?? removerIds.length,
          atualizados: data?.atualizados ?? diff.aAtualizar.length,
        },
      })
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
