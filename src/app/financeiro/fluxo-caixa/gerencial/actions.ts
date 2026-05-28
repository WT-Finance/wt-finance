'use server'

import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import { parseGerencialExcel, chaveDuplicata } from '@/lib/gerencial/parser'
import type { LancamentoPlanilha }             from '@/lib/gerencial/parser'

export type { LancamentoPlanilha }

export interface ImportDiff {
  aAdicionar: LancamentoPlanilha[]
  aRemover:   Array<{ id: number; tipo: string; pessoa: string; valor_final: number; vencimento: string }>
  aManter:    number
  aAtualizar: Array<{ id: number; atual: Record<string, unknown>; novo: LancamentoPlanilha; camposDivergentes: string[] }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>

function rpc(fn: string, args?: Record<string, unknown>) {
  const db = getAdminClient()
  return (db.rpc as unknown as Rpc)(fn, args)
}

// ─── Importação ───────────────────────────────────────────────────────────────

export async function parseImport(formData: FormData): Promise<
  | { success: true;  lancamentos: LancamentoPlanilha[]; warnings: string[] }
  | { success: false; error: string }
> {
  try {
    const file = formData.get('file') as File | null
    if (!file) return { success: false, error: 'Nenhum arquivo enviado' }
    if (file.size > 10 * 1024 * 1024) return { success: false, error: 'Arquivo maior que 10MB' }
    const buffer = await file.arrayBuffer()
    const result = parseGerencialExcel(buffer)
    if (!result.success) return { success: false, error: result.error }
    return { success: true, lancamentos: result.lancamentos, warnings: result.warnings }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao processar arquivo' }
  }
}

export async function computeImportDiff(planilha: LancamentoPlanilha[]): Promise<
  | { success: true;  diff: ImportDiff }
  | { success: false; error: string }
> {
  try {
    const { data: atuais, error } = await rpc('get_gerencial_lancamentos_planilha')
    if (error) return { success: false, error: `Falha ao carregar dados: ${error.message}` }

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

    return { success: true, diff }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao calcular diff' }
  }
}

export async function commitImport(planilha: LancamentoPlanilha[]): Promise<
  | { success: true;  loteId: string; resumo: { adicionados: number; removidos: number; atualizados: number } }
  | { success: false; error: string }
> {
  try {
    const diffRes = await computeImportDiff(planilha)
    if (!diffRes.success) return diffRes
    const diff = diffRes.diff

    const loteId = crypto.randomUUID()
    const agora  = new Date().toISOString()

    const { data, error } = await rpc('batch_gerencial_import', {
      p_adicionar:    diff.aAdicionar,
      p_remover_ids:  diff.aRemover.map(r => r.id),
      p_atualizar:    diff.aAtualizar.map(u => ({
        id:            u.id,
        descricao:     u.novo.descricao,
        conta_previsao: u.novo.conta_previsao,
      })),
      p_lote_id:      loteId,
      p_importado_em: agora,
    })

    if (error) return { success: false, error: error.message }

    revalidatePath('/financeiro/fluxo-caixa')
    return {
      success: true,
      loteId,
      resumo: {
        adicionados: data?.adicionados ?? diff.aAdicionar.length,
        removidos:   data?.removidos   ?? diff.aRemover.length,
        atualizados: data?.atualizados ?? diff.aAtualizar.length,
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro na importação' }
  }
}

// ─── CRUD manual ─────────────────────────────────────────────────────────────

export async function createLancamento(input: {
  tipo: 'A pagar' | 'A receber'
  pessoa: string
  valor_final: number
  descricao?: string | null
  conta_previsao?: string | null
  vencimento: string
}): Promise<
  | { success: true;  lancamento: Record<string, unknown> }
  | { success: false; error: string }
> {
  try {
    const { data, error } = await rpc('create_gerencial_lancamento', {
      p_tipo:           input.tipo,
      p_pessoa:         input.pessoa,
      p_valor_final:    input.valor_final,
      p_vencimento:     input.vencimento,
      p_origem:         'manual',
      p_descricao:      input.descricao      ?? null,
      p_conta_previsao: input.conta_previsao ?? null,
    })
    if (error) return { success: false, error: error.message }
    revalidatePath('/financeiro/fluxo-caixa')
    return { success: true, lancamento: data as Record<string, unknown> }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao criar lançamento' }
  }
}

export async function updateLancamento(id: number, campo: string, valor: unknown): Promise<
  | { success: true }
  | { success: false; error: string }
> {
  const CAMPOS_PERMITIDOS = ['tipo', 'pessoa', 'valor_final', 'descricao', 'conta_previsao', 'vencimento']
  if (!CAMPOS_PERMITIDOS.includes(campo))
    return { success: false, error: 'Campo não permitido' }

  try {
    const { error } = await rpc('update_gerencial_lancamento', {
      p_id:      id,
      p_updates: { [campo]: valor },
    })
    if (error) return { success: false, error: error.message }
    revalidatePath('/financeiro/fluxo-caixa')
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao atualizar' }
  }
}

export async function deleteLancamento(id: number): Promise<
  | { success: true }
  | { success: false; error: string }
> {
  try {
    const { error } = await rpc('delete_gerencial_lancamento', { p_id: id })
    if (error) return { success: false, error: error.message }
    revalidatePath('/financeiro/fluxo-caixa')
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao excluir' }
  }
}

export async function updateSaldo(conta: string, novoSaldo: number): Promise<
  | { success: true }
  | { success: false; error: string }
> {
  try {
    const { error } = await rpc('update_gerencial_saldo', {
      p_conta: conta,
      p_saldo: novoSaldo,
    })
    if (error) return { success: false, error: error.message }
    revalidatePath('/financeiro/fluxo-caixa')
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao atualizar saldo' }
  }
}
