'use server'

// Server Actions da ESTRUTURA de COMPETÊNCIA (v5.8.0 · M5) — espelho das actions do regime
// de caixa (`../estrutura/actions.ts`), apontando para as RPCs da `0260`:
// `dre_comp_estrutura_salvar` / `dre_comp_estrutura_historico_*` / `dre_comp_estrutura_desfazer_*`.
//
// Mesmo padrão da casa: `requireAreaAction` (guard de superfície; o banco também checa
// `app.exigir_acesso` dentro de cada RPC) + `getServerClient` (SESSÃO, nunca service role —
// o diário precisa saber QUEM alterou) + `rpcDre` (helper de tipagem frouxa; estas RPCs não
// estão no `database.ts` congelado) + `parseRpc` (valida o shape antes de a UI confiar).
//
// Os prefixos de erro da RPC são os MESMOS do caixa (DRE_CONFLITO, DRE_BLOCO_INVALIDO,
// DRE_ESTADO_INVALIDO, DRE_CATEGORIA_INVALIDA, DRE_PAYLOAD_INVALIDO) — de propósito: o
// editor é o mesmo componente, e uma segunda convenção de erro só criaria dois caminhos de
// tradução para a mesma mensagem de usuário.

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
  revalidatePath('/financeiro/dre/estrutura-competencia')
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
    return 'Linha inválida — recarregue a página e tente novamente.'
  if (msg.includes('DRE_PAYLOAD_INVALIDO'))
    return 'Dados inválidos ao salvar — recarregue a página e tente novamente.'
  return 'Não foi possível salvar as alterações. Tente novamente.'
}

function traduzirDesfazerErro(msg: string): string {
  if (msg.includes('PERMISSAO_NEGADA'))
    return 'Você não tem permissão para desfazer esta ação. Reverter a ação de outra pessoa exige perfil de administrador.'
  return msg
}

export async function salvarEstruturaCompetencia(itens: SalvarMapItem[], token: string | null): Promise<
  { ok: boolean; gravadas?: number; token?: string | null; erro?: string }
> {
  await requireAreaAction('financeiro/dre')
  try {
    const db = await getServerClient()
    const res = await rpcDre(db, 'dre_comp_estrutura_salvar', { p_maps: itens, p_token: token })
    if (res.error) return { ok: false, erro: traduzirSalvarErro(res.error.message) }
    const parsed = parseRpc(salvarEstruturaResultSchema, res, 'dre_comp_estrutura_salvar')
    if (!parsed) return { ok: false, erro: 'Não foi possível confirmar o salvamento — tente novamente.' }
    revalidar()
    return { ok: true, gravadas: parsed.gravadas, token: parsed.token }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro ao salvar a estrutura.' }
  }
}

export async function compHistoricoLotes(limit = 50, offset = 0): Promise<HistoricoLote[] | null> {
  await requireAreaAction('financeiro/dre')
  try {
    const db = await getServerClient()
    const res = await rpcDre(db, 'dre_comp_estrutura_historico_lotes', { p_limit: limit, p_offset: offset })
    return parseRpc(historicoLotesSchema, res, 'dre_comp_estrutura_historico_lotes')
  } catch {
    return null
  }
}

export async function compHistoricoLote(loteId: string): Promise<HistoricoEntrada[] | null> {
  await requireAreaAction('financeiro/dre')
  try {
    const db = await getServerClient()
    // lote_id é bigint serializado como STRING (pode passar de 2^53 — Number() perderia
    // precisão); o PostgREST casta a string para bigint no servidor sem perda.
    const res = await rpcDre(db, 'dre_comp_estrutura_historico_lote', { p_lote: loteId })
    return parseRpc(historicoEntradasSchema, res, 'dre_comp_estrutura_historico_lote')
  } catch {
    return null
  }
}

export async function compDesfazerLote(loteId: string): Promise<{ ok: boolean; erro?: string }> {
  await requireAreaAction('financeiro/dre')
  try {
    const db = await getServerClient()
    const { error } = await rpcDre(db, 'dre_comp_estrutura_desfazer_lote', { p_lote: loteId })
    if (error) return { ok: false, erro: traduzirDesfazerErro(error.message) }
    revalidar()
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro ao desfazer.' }
  }
}

export async function compDesfazerLinha(id: number): Promise<{ ok: boolean; erro?: string }> {
  await requireAreaAction('financeiro/dre')
  try {
    const db = await getServerClient()
    const { error } = await rpcDre(db, 'dre_comp_estrutura_desfazer_linha', { p_diario_id: id })
    if (error) return { ok: false, erro: traduzirDesfazerErro(error.message) }
    revalidar()
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro ao desfazer.' }
  }
}
