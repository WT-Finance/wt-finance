'use server'

// IMPORTANTE: este módulo NÃO importa @e965/xlsx nem parser.ts (PEND-001).
// A importação de planilha (parse + diff + commit) vive 100% na API Route
// src/app/api/gerencial/import/route.ts (runtime Node, isolado do RSC).
// Aqui ficam apenas as Server Actions de CRUD manual, que não tocam Excel.

import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAreaAction } from '@/lib/auth/sessao'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>

function rpc(fn: string, args?: Record<string, unknown>) {
  const db = getAdminClient()
  return (db.rpc as unknown as Rpc)(fn, args)
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
  // Guard ANTES do try: negação de permissão deve lançar, não virar erro amigável.
  await requireAreaAction('financeiro/gerencial')
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
  await requireAreaAction('financeiro/gerencial')
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
  await requireAreaAction('financeiro/gerencial')
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
  await requireAreaAction('financeiro/gerencial')
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
