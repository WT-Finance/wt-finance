import 'server-only'
import { cache } from 'react'
import type { ZodType } from 'zod'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { parseRpc } from '@/lib/schemas-rpc'
import * as S from './schemas'

// Leituras do módulo (consumidas pelas pages RSC). Cliente de SESSÃO (authenticated)
// → o banco filtra por auth.uid()/área (visibilidade §2.3). parseRpc valida o shape.

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

async function call<T>(fn: string, args: Record<string, unknown>, schema: ZodType<T>): Promise<T | null> {
  const sb = await getServerClient()
  const res = await (sb.rpc as unknown as BoundRpc).bind(sb)(fn, args)
  return parseRpc(schema, res, fn)
}

export const getMinhas         = () => call('solic_minhas', {}, S.solicitacoesListaSchema)
export const getCaixa          = (escopo: 'mim_e_role' | 'so_mim' | 'todas') => call('solic_caixa', { p_escopo: escopo }, S.solicitacoesListaSchema)
export const getDetalhe        = (id: number) => call('solic_detalhe', { p_id: id }, S.solicitacaoSchema)
export const getTiposAbertura  = () => call('solic_tipos_abertura', {}, S.tiposAberturaSchema)
export const getDestinatarios  = () => call('solic_destinatarios', {}, S.destinatariosSchema)
export const getTiposAdmin     = () => call('admin_solic_listar_tipos', {}, S.tiposAdminSchema)
// cache() deduplica chamadas no mesmo request (layout + page chamam em paralelo)
export const getPendencias     = cache(() => call('solic_minhas_pendencias', {}, z.number()))
// v4.19.1 — auditoria de movimentações (gestão-only; o banco valida 'solicitacoes' via exigir_acesso).
export const getMovimentacoes  = () => call('solic_movimentacoes', {}, S.movimentacoesSchema)
// v4.25.0 — e-mails dos envolvidos (autor + destinatário/membros ativos da role) p/
// notificar uma movimentação. Gated por pode_ver_solic na RPC; null se o caller não vê.
export const getEmailsEnvolvidos = (id: number) => call('solic_emails_envolvidos', { p_id: id }, S.emailsEnvolvidosSchema)
