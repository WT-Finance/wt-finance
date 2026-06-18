'use server'

// IMPORTANTE: este módulo NÃO importa @e965/xlsx nem parser.ts (PEND-001).
// A importação de planilha (parse + diff + commit) vive 100% na API Route
// src/app/api/gerencial/import/route.ts (runtime Node, isolado do RSC).
// Aqui ficam as Server Actions de CRUD manual (linhas) + CRUD de contas.
//
// v4.21.0 (M2): cliente de SESSÃO (getServerClient), NÃO mais service role. As RPCs do
// gerencial exigem app.exigir_acesso(['financeiro/gerencial']) no nível do banco — defesa
// em profundidade real. O guard de superfície (requireAreaAction) continua antes, por UX.

import { revalidatePath } from 'next/cache'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaAction } from '@/lib/auth/sessao'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>

async function rpc(fn: string, args?: Record<string, unknown>) {
  const db = await getServerClient()
  return (db.rpc as unknown as Rpc)(fn, args)
}

function revalidar() {
  revalidatePath('/financeiro/fluxo-caixa')
  revalidatePath('/financeiro/fluxo-caixa/gerencial')
}

// ─── CRUD de lançamentos (manual) ────────────────────────────────────────────

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
    revalidar()
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
  const CAMPOS_PERMITIDOS = ['tipo', 'pessoa', 'valor_final', 'descricao', 'conta_previsao', 'vencimento', 'destacado']
  if (!CAMPOS_PERMITIDOS.includes(campo))
    return { success: false, error: 'Campo não permitido' }
  try {
    const { error } = await rpc('update_gerencial_lancamento', { p_id: id, p_updates: { [campo]: valor } })
    if (error) return { success: false, error: error.message }
    revalidar()
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
    revalidar()
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao excluir' }
  }
}

/** v4.21.0 (M5): exclusão em massa. Devolve a contagem realmente apagada. */
export async function deleteLancamentosBulk(ids: number[]): Promise<
  | { success: true; removidos: number }
  | { success: false; error: string }
> {
  await requireAreaAction('financeiro/gerencial')
  if (!Array.isArray(ids) || ids.length === 0) return { success: false, error: 'Nenhuma linha selecionada' }
  try {
    const { data, error } = await rpc('delete_gerencial_lancamentos_bulk', { p_ids: ids })
    if (error) return { success: false, error: error.message }
    revalidar()
    return { success: true, removidos: typeof data === 'number' ? data : ids.length }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao excluir em massa' }
  }
}

// ─── CRUD de contas (v4.21.0 / M1) ────────────────────────────────────────────

export type PapelConta = 'isolada' | 'reserva' | null

export async function updateSaldo(conta: string, novoSaldo: number): Promise<
  | { success: true }
  | { success: false; error: string }
> {
  await requireAreaAction('financeiro/gerencial')
  try {
    const { error } = await rpc('update_gerencial_saldo', { p_conta: conta, p_saldo: novoSaldo })
    if (error) return { success: false, error: error.message }
    revalidar()
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao atualizar saldo' }
  }
}

export async function createConta(input: {
  conta: string
  saldo?: number
  limite?: number | null
  consolidado?: boolean
  papel?: PapelConta
}): Promise<{ success: true; conta: Record<string, unknown> } | { success: false; error: string }> {
  await requireAreaAction('financeiro/gerencial')
  const nome = input.conta.trim()
  if (!nome) return { success: false, error: 'Informe o nome da conta.' }
  try {
    const { data, error } = await rpc('create_gerencial_conta', {
      p_conta:       nome,
      p_saldo:       input.saldo ?? 0,
      p_limite:      input.limite ?? null,
      p_consolidado: input.consolidado ?? false,
      p_papel:       input.papel ?? null,
    })
    if (error) return { success: false, error: traduzirContaErro(error.message) }
    revalidar()
    return { success: true, conta: data as Record<string, unknown> }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao criar conta' }
  }
}

export async function updateConta(conta: string, updates: {
  nome?: string
  saldo?: number
  limite?: number | null
  consolidado?: boolean
  papel?: PapelConta
}): Promise<{ success: true } | { success: false; error: string }> {
  await requireAreaAction('financeiro/gerencial')
  // Monta só as chaves presentes (o banco aplica CASE WHEN p_updates ? 'x').
  const p: Record<string, unknown> = {}
  if (updates.nome !== undefined)        p.nome        = updates.nome.trim()
  if (updates.saldo !== undefined)       p.saldo       = updates.saldo
  if (updates.limite !== undefined)      p.limite      = updates.limite == null ? '' : updates.limite
  if (updates.consolidado !== undefined) p.consolidado = updates.consolidado
  if (updates.papel !== undefined)       p.papel       = updates.papel == null ? '' : updates.papel
  if (Object.keys(p).length === 0) return { success: true }
  try {
    const { error } = await rpc('update_gerencial_conta', { p_conta: conta, p_updates: p })
    if (error) return { success: false, error: traduzirContaErro(error.message) }
    revalidar()
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao atualizar conta' }
  }
}

export async function deleteConta(conta: string): Promise<{ success: true } | { success: false; error: string }> {
  await requireAreaAction('financeiro/gerencial')
  try {
    const { error } = await rpc('delete_gerencial_conta', { p_conta: conta })
    if (error) return { success: false, error: traduzirContaErro(error.message) }
    revalidar()
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao remover conta' }
  }
}

/** v4.22.4: reordena as contas (define a `ordem` = posição no array). Atômico no banco. */
export async function reordenarContas(ordem: string[]): Promise<{ success: true } | { success: false; error: string }> {
  await requireAreaAction('financeiro/gerencial')
  if (!Array.isArray(ordem) || ordem.length === 0) return { success: false, error: 'Ordem vazia' }
  try {
    const { error } = await rpc('reordenar_gerencial_contas', { p_contas: ordem })
    if (error) return { success: false, error: traduzirContaErro(error.message) }
    revalidar()
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao reordenar contas' }
  }
}

function traduzirContaErro(msg: string): string {
  if (msg.includes('CONTA_VAZIA'))      return 'Informe o nome da conta.'
  if (msg.includes('CONTA_DUPLICADA'))  return 'Já existe uma conta com esse nome.'
  if (msg.includes('PAPEL_INVALIDO'))   return 'Papel inválido.'
  if (msg.includes('PERMISSAO_NEGADA')) return 'Você não tem permissão para gerenciar o Fluxo de Caixa Gerencial.'
  return msg
}
