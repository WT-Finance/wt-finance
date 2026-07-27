'use server'

// Server Actions da ESTRUTURA VIVA da DRE (v5.3.0 · M5). Mesmo padrão das actions do
// Gerencial (fluxo-caixa/gerencial/actions.ts): requireAreaAction (guard de superfície;
// o banco também checa app.exigir_acesso dentro de cada RPC) + getServerClient (sessão,
// NÃO service role) + rpcDre (helper de tipagem frouxa — estas RPCs, 0204-0208, não estão
// no database.ts gerado) + parseRpc (valida o shape antes de a UI confiar nos campos).
//
// dre_estrutura_salvar EXIGE token (trava otimista da estrutura GLOBAL — sem overload
// retrocompatível como o Gerencial: toda edição de estrutura viaja com trava, 0208). Erros
// da RPC chegam como message com um prefixo (DRE_CONFLITO|DRE_BLOCO_INVALIDO|DRE_ESTADO_
// INVALIDO|DRE_CATEGORIA_INVALIDA|DRE_PAYLOAD_INVALIDO) — traduzidos para mensagem amigável.

import { revalidatePath } from 'next/cache'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaAction } from '@/lib/auth/sessao'
import { rpcDre } from '@/lib/dre/rpc-dre'
import { parseRpc } from '@/lib/schemas-rpc'
import {
  salvarEstruturaResultSchema, historicoLotesSchema, historicoEntradasSchema,
  type SalvarMapItem, type HistoricoLote, type HistoricoEntrada,
} from '@/lib/dre/schemas'

function revalidar() {
  revalidatePath('/financeiro/dre/estrutura')
  revalidatePath('/financeiro/dre')
}

function traduzirSalvarErro(msg: string): string {
  if (msg.includes('DRE_CONFLITO'))
    return 'A estrutura mudou desde o carregamento — recarregue a página e refaça.'
  if (msg.includes('DRE_BLOCO_INVALIDO'))
    return 'Bloco de destino inválido — recarregue a página e tente novamente.'
  if (msg.includes('DRE_ESTADO_INVALIDO'))
    return 'Estado inconsistente ao salvar — recarregue a página e tente novamente.'
  if (msg.includes('DRE_CATEGORIA_INVALIDA'))
    return 'Categoria inválida — recarregue a página e tente novamente.'
  if (msg.includes('DRE_PAYLOAD_INVALIDO'))
    return 'Dados inválidos ao salvar — recarregue a página e tente novamente.'
  return 'Não foi possível salvar as alterações. Tente novamente.'
}

/** Mensagens do desfazer em linguagem de usuário (mesma convenção do Gerencial/0200/0206). */
function traduzirDesfazerErro(msg: string): string {
  if (msg.includes('PERMISSAO_NEGADA'))
    return 'Você não tem permissão para desfazer esta ação. Reverter a ação de outra pessoa exige perfil de administrador.'
  return msg
}

export async function salvarEstrutura(itens: SalvarMapItem[], token: string | null): Promise<
  { ok: boolean; gravadas?: number; token?: string | null; erro?: string }
> {
  await requireAreaAction('financeiro/dre')
  try {
    const db = await getServerClient()
    const res = await rpcDre(db, 'dre_estrutura_salvar', { p_maps: itens, p_token: token })
    if (res.error) return { ok: false, erro: traduzirSalvarErro(res.error.message) }
    const parsed = parseRpc(salvarEstruturaResultSchema, res, 'dre_estrutura_salvar')
    if (!parsed) return { ok: false, erro: 'Não foi possível confirmar o salvamento — tente novamente.' }
    revalidar()
    return { ok: true, gravadas: parsed.gravadas, token: parsed.token }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro ao salvar a estrutura.' }
  }
}

export async function estruturaHistoricoLotes(limit = 50, offset = 0): Promise<HistoricoLote[] | null> {
  await requireAreaAction('financeiro/dre')
  try {
    const db = await getServerClient()
    const res = await rpcDre(db, 'dre_estrutura_historico_lotes', { p_limit: limit, p_offset: offset })
    return parseRpc(historicoLotesSchema, res, 'dre_estrutura_historico_lotes')
  } catch {
    return null
  }
}

export async function estruturaHistoricoLote(loteId: string): Promise<HistoricoEntrada[] | null> {
  await requireAreaAction('financeiro/dre')
  try {
    const db = await getServerClient()
    // lote_id é bigint serializado como STRING (pode passar de 2^53 — Number() perderia
    // precisão); o PostgREST casta a string para bigint no servidor sem perda.
    const res = await rpcDre(db, 'dre_estrutura_historico_lote', { p_lote: loteId })
    return parseRpc(historicoEntradasSchema, res, 'dre_estrutura_historico_lote')
  } catch {
    return null
  }
}

export async function estruturaDesfazerLote(loteId: string): Promise<{ ok: boolean; erro?: string }> {
  await requireAreaAction('financeiro/dre')
  try {
    const db = await getServerClient()
    const { error } = await rpcDre(db, 'dre_estrutura_desfazer_lote', { p_lote: loteId })
    if (error) return { ok: false, erro: traduzirDesfazerErro(error.message) }
    revalidar()
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro ao desfazer.' }
  }
}

export async function estruturaDesfazerLinha(id: number): Promise<{ ok: boolean; erro?: string }> {
  await requireAreaAction('financeiro/dre')
  try {
    const db = await getServerClient()
    const { error } = await rpcDre(db, 'dre_estrutura_desfazer_linha', { p_diario_id: id })
    if (error) return { ok: false, erro: traduzirDesfazerErro(error.message) }
    revalidar()
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro ao desfazer.' }
  }
}
