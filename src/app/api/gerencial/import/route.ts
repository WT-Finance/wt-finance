// API Route de importação Gerencial (ADR-0091).
// Roda em runtime Node ISOLADO do React Server Components — é o que resolve
// PEND-001: @e965/xlsx falhava quando o parser convivia com Server Actions na
// fronteira RSC. Aqui o parsing acontece fora do contexto RSC, eliminando a
// classe inteira de problemas de SSR/serialização.
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { parseGerencialExcel } from '@/lib/gerencial/parser'
import { chaveDuplicata, type LancamentoPlanilha, type ImportDiff } from '@/lib/gerencial/import-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>

function rpc(fn: string, args?: Record<string, unknown>) {
  const db = getAdminClient()
  return (db.rpc as unknown as Rpc)(fn, args)
}

// Calcula o diff entre a planilha parseada e os lançamentos origem='planilha' do banco
async function computeImportDiff(planilha: LancamentoPlanilha[]): Promise<ImportDiff> {
  const { data: atuais, error } = await rpc('get_gerencial_lancamentos_planilha')
  if (error) throw new Error(`Falha ao carregar dados: ${error.message}`)

  const mapAtuais   = new Map<string, Record<string, unknown>>()
  const mapPlanilha = new Map<string, LancamentoPlanilha>()

  ;(atuais as Record<string, unknown>[] ?? []).forEach(a =>
    mapAtuais.set(chaveDuplicata(a as Parameters<typeof chaveDuplicata>[0]), a))
  planilha.forEach(l => mapPlanilha.set(chaveDuplicata(l), l))

  const diff: ImportDiff = { aAdicionar: [], aRemover: [], aManter: 0, aAtualizar: [] }

  for (const [key, l] of mapPlanilha) {
    if (!mapAtuais.has(key)) {
      diff.aAdicionar.push(l)
    } else {
      const atual = mapAtuais.get(key)!
      const divergentes: string[] = []
      if ((atual.descricao ?? null)      !== (l.descricao ?? null))      divergentes.push('descricao')
      if ((atual.conta_previsao ?? null) !== (l.conta_previsao ?? null)) divergentes.push('conta_previsao')
      divergentes.length > 0
        ? diff.aAtualizar.push({ id: atual.id as number, atual, novo: l, camposDivergentes: divergentes })
        : diff.aManter++
    }
  }
  for (const [key, atual] of mapAtuais) {
    if (!mapPlanilha.has(key))
      diff.aRemover.push(atual as { id: number; tipo: string; pessoa: string; valor_final: number; vencimento: string })
  }

  return diff
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file   = formData.get('file') as File | null
    const action = String(formData.get('action') ?? 'preview')

    if (!file)                          return NextResponse.json({ error: 'Nenhum arquivo enviado' },  { status: 400 })
    if (file.size > 10 * 1024 * 1024)   return NextResponse.json({ error: 'Arquivo maior que 10MB' },  { status: 400 })

    const buffer    = await file.arrayBuffer()
    const parseRes  = parseGerencialExcel(buffer)
    if (!parseRes.success) return NextResponse.json({ error: parseRes.error }, { status: 422 })

    const { lancamentos, warnings } = parseRes
    const diff = await computeImportDiff(lancamentos)

    if (action === 'preview') {
      return NextResponse.json({ diff, warnings })
    }

    if (action === 'commit') {
      const loteId = crypto.randomUUID()
      const agora  = new Date().toISOString()

      const { data, error } = await rpc('batch_gerencial_import', {
        p_adicionar:   diff.aAdicionar,
        p_remover_ids: diff.aRemover.map(r => r.id),
        p_atualizar:   diff.aAtualizar.map(u => ({
          id:             u.id,
          descricao:      u.novo.descricao,
          conta_previsao: u.novo.conta_previsao,
        })),
        p_lote_id:      loteId,
        p_importado_em: agora,
      })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({
        resumo: {
          adicionados: data?.adicionados ?? diff.aAdicionar.length,
          removidos:   data?.removidos   ?? diff.aRemover.length,
          atualizados: data?.atualizados ?? diff.aAtualizar.length,
        },
      })
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
