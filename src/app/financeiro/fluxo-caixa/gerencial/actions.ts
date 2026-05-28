'use server'

import { revalidatePath }                    from 'next/cache'
import { getAdminClient }                    from '@/lib/supabase/admin'
import { parseGerencialExcel, chaveDuplicata, type LancamentoPlanilha } from '@/lib/gerencial/parser'
export type { LancamentoPlanilha }
import { randomUUID }                        from 'crypto'

export interface ImportDiff {
  aAdicionar: LancamentoPlanilha[]
  aRemover:   Array<{ id: number; tipo: string; pessoa: string; valor_final: number; vencimento: string }>
  aManter:    number
  aAtualizar: Array<{ id: number; atual: Record<string, unknown>; novo: LancamentoPlanilha; camposDivergentes: string[] }>
}

// Etapa 1: parsear o arquivo enviado
export async function parseImport(formData: FormData): Promise<
  | { success: true;  lancamentos: LancamentoPlanilha[]; warnings: string[] }
  | { success: false; error: string }
> {
  const file = formData.get('file') as File | null
  if (!file) return { success: false, error: 'Nenhum arquivo enviado' }
  if (file.size > 10 * 1024 * 1024) return { success: false, error: 'Arquivo maior que 10MB' }

  const buffer = await file.arrayBuffer()
  const result = parseGerencialExcel(buffer)
  if (!result.success) return { success: false, error: result.error }
  return { success: true, lancamentos: result.lancamentos, warnings: result.warnings }
}

// Etapa 2: calcular diff entre planilha e banco
export async function computeImportDiff(planilha: LancamentoPlanilha[]): Promise<ImportDiff> {
  const db = getAdminClient()

  const { data: atuais, error } = await db
    .schema('analytics')
    .from('gerencial_lancamentos')
    .select('id, tipo, pessoa, valor_final, descricao, conta_previsao, vencimento')
    .eq('origem', 'planilha')

  if (error) throw new Error(`Falha ao carregar dados: ${error.message}`)

  const mapAtuais   = new Map<string, Record<string, unknown>>()
  const mapPlanilha = new Map<string, LancamentoPlanilha>()

  ;(atuais ?? []).forEach(a => mapAtuais.set(chaveDuplicata(a as Parameters<typeof chaveDuplicata>[0]), a as Record<string, unknown>))
  planilha.forEach(l => mapPlanilha.set(chaveDuplicata(l), l))

  const diff: ImportDiff = { aAdicionar: [], aRemover: [], aManter: 0, aAtualizar: [] }

  for (const [key, l] of mapPlanilha) {
    if (!mapAtuais.has(key)) {
      diff.aAdicionar.push(l)
    } else {
      const atual = mapAtuais.get(key)!
      const divergentes: string[] = []
      if ((atual.descricao ?? null) !== (l.descricao ?? null))           divergentes.push('descricao')
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

// ─── CRUD manual ─────────────────────────────────────────────────────────────

export async function createLancamento(input: {
  tipo: 'A pagar' | 'A receber'
  pessoa: string
  valor_final: number
  descricao?: string | null
  conta_previsao?: string | null
  vencimento: string
}) {
  const db = getAdminClient()
  const { data, error } = await db
    .schema('analytics')
    .from('gerencial_lancamentos')
    .insert({
      tipo:           input.tipo,
      pessoa:         input.pessoa,
      valor_final:    input.valor_final,
      descricao:      input.descricao ?? null,
      conta_previsao: input.conta_previsao ?? null,
      vencimento:     input.vencimento,
      origem:         'manual',
    })
    .select()
    .single()

  if (error) return { success: false as const, error: error.message }
  revalidatePath('/financeiro/fluxo-caixa')
  return { success: true as const, lancamento: data }
}

export async function updateLancamento(id: number, campo: string, valor: unknown) {
  const CAMPOS_PERMITIDOS = ['tipo', 'pessoa', 'valor_final', 'descricao', 'conta_previsao', 'vencimento']
  if (!CAMPOS_PERMITIDOS.includes(campo))
    return { success: false as const, error: 'Campo não permitido' }

  const db = getAdminClient()
  const { error } = await db
    .schema('analytics')
    .from('gerencial_lancamentos')
    .update({ [campo]: valor })
    .eq('id', id)

  if (error) return { success: false as const, error: error.message }
  revalidatePath('/financeiro/fluxo-caixa')
  return { success: true as const }
}

export async function deleteLancamento(id: number) {
  const db = getAdminClient()
  const { error } = await db
    .schema('analytics')
    .from('gerencial_lancamentos')
    .delete()
    .eq('id', id)

  if (error) return { success: false as const, error: error.message }
  revalidatePath('/financeiro/fluxo-caixa')
  return { success: true as const }
}

export async function updateSaldo(conta: string, novoSaldo: number) {
  const db = getAdminClient()
  const { error } = await db
    .schema('analytics')
    .from('gerencial_saldos')
    .update({ saldo: novoSaldo, atualizado_em: new Date().toISOString() })
    .eq('conta', conta)

  if (error) return { success: false as const, error: error.message }
  revalidatePath('/financeiro/fluxo-caixa')
  return { success: true as const }
}

// ─── Importação (planilha) ────────────────────────────────────────────────────

// Etapa 3: confirmar importação em transação
export async function commitImport(planilha: LancamentoPlanilha[]): Promise<
  | { success: true; loteId: string; resumo: { adicionados: number; removidos: number; atualizados: number } }
  | { success: false; error: string }
> {
  try {
    const diff   = await computeImportDiff(planilha)
    const db     = getAdminClient()
    const loteId = randomUUID()
    const agora  = new Date().toISOString()

    if (diff.aRemover.length > 0) {
      const { error } = await db
        .schema('analytics')
        .from('gerencial_lancamentos')
        .delete()
        .in('id', diff.aRemover.map(r => r.id))
      if (error) throw new Error(`Erro ao remover: ${error.message}`)
    }

    if (diff.aAdicionar.length > 0) {
      const { error } = await db
        .schema('analytics')
        .from('gerencial_lancamentos')
        .insert(diff.aAdicionar.map(l => ({
          ...l, origem: 'planilha' as const, importado_em: agora, importado_lote_id: loteId,
        })))
      if (error) throw new Error(`Erro ao adicionar: ${error.message}`)
    }

    for (const upd of diff.aAtualizar) {
      const { error } = await db
        .schema('analytics')
        .from('gerencial_lancamentos')
        .update({ descricao: upd.novo.descricao, conta_previsao: upd.novo.conta_previsao, importado_em: agora, importado_lote_id: loteId })
        .eq('id', upd.id)
      if (error) throw new Error(`Erro ao atualizar: ${error.message}`)
    }

    revalidatePath('/financeiro/fluxo-caixa')
    return { success: true, loteId, resumo: { adicionados: diff.aAdicionar.length, removidos: diff.aRemover.length, atualizados: diff.aAtualizar.length } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
