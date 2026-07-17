import { z } from 'zod'
import type { ServerClient } from '@/lib/supabase/server'
import type { RpcLike } from '@/lib/rpc'

// RPCs do Fluxo de Caixa v5.2.0/Onda 1 (M4) — não estão em src/types/database.ts (mesma
// convenção de acervo/faturamento/solicitações/metas: helper de tipagem frouxa em vez de
// regenerar/editar o database.ts congelado). O SHAPE do retorno é validado por parseRpc
// (@/lib/schemas-rpc) no call-site, com os schemas Zod abaixo.
export function rpcFluxo(
  db: ServerClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RpcLike> {
  const call = db.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<RpcLike>
  return call.call(db, fn, args)
}

// ── get_repasse_mensal(p_ano) → RepasseMensalRow[] ───────────────────────────
// sal = repasse BRUTO (Entrada Clientes − Pagto Fornecedor). pct/pct_ant podem ser
// null (mês sem base comparável ou sem entrada no denominador).

export const repasseMensalRowSchema = z.object({
  mes:     z.number(),
  ent:     z.number(),
  sal:     z.number(),
  pct:     z.number().nullable(),
  pct_ant: z.number().nullable(),
}).passthrough()

export const repasseMensalSchema = z.array(repasseMensalRowSchema)

export type RepasseMensalRow = z.infer<typeof repasseMensalRowSchema>

// ── get_fluxo_horizonte() → HorizonteBloco[] ─────────────────────────────────
// Buckets: "Resto de <ano> (lançado)", anos seguintes, "Pós-2028 · isolado do horizonte".

export const horizonteBlocoSchema = z.object({
  l:   z.string(),
  liq: z.number(),
  e:   z.number(),
  s:   z.number(),
  n:   z.number(),
}).passthrough()

export const horizonteSchema = z.array(horizonteBlocoSchema)

export type HorizonteBloco = z.infer<typeof horizonteBlocoSchema>

// ── get_fluxo_runway_semanal() → RunwaySemanal ───────────────────────────────
// 13 semanas; acc = saldo projetado acumulado (saldo_operacional + Σ liq até a semana).

export const runwaySemanaSchema = z.object({
  ini: z.string(),
  fim: z.string(),
  rec: z.number(),
  pag: z.number(),
  liq: z.number(),
  acc: z.number(),
}).passthrough()

export const runwaySemanalSchema = z.object({
  saldo_operacional: z.number(),
  semanas:           z.array(runwaySemanaSchema),
}).passthrough()

export type RunwaySemana  = z.infer<typeof runwaySemanaSchema>
export type RunwaySemanal = z.infer<typeof runwaySemanalSchema>

// ── get_fluxo_ranking(p_limite) → RankingCaixa ───────────────────────────────
// YTD × YTD ano anterior por categoria. pct null quando t25 (ano anterior) = 0
// (sem base comparável).

export const rankingItemSchema = z.object({
  c:   z.string(),
  t25: z.number(),
  t26: z.number(),
  d:   z.number(),
  pct: z.number().nullable(),
  nat: z.enum(['desp', 'rec']),
}).passthrough()

export const rankingCaixaSchema = z.object({
  pioraram:   z.array(rankingItemSchema),
  melhoraram: z.array(rankingItemSchema),
}).passthrough()

export type RankingItem  = z.infer<typeof rankingItemSchema>
export type RankingCaixa = z.infer<typeof rankingCaixaSchema>
