import { z } from 'zod'

// ── Schema Zod da RPC `get_marketing_proporcao_receita` (v6.3.0 · migration 0293) ─────────────
// Regra do projeto: o schema reflete o retorno REAL da RPC, não o tipo TS. O retorno é `json`
// (database.ts tipa como `Json`), então o `tsc` não protege nada aqui — é este schema, via
// `parseRpc`, que impede um campo ausente de chegar à UI. O caso contra a RPC viva está em
// `src/lib/rpc-contrato.test.ts` (bloco "Gastos de Marketing — proporção sobre a Receita Bruta").
//
// A RPC devolve o PERCENTUAL de Marketing sobre a Receita Bruta por COMPETÊNCIA — o mesmo número
// da grade "Proporção sobre a Receita Bruta" da DRE (a conta de `avPercentual(mkt / 100,
// baseAv(rb / 100))`, `@/lib/dre/av`, feita no banco). Só o % sai: os centavos de Marketing e de
// Receita Bruta ficariam expostos a quem só tem a área de Marketing (achado do revisor-db).
//
// `json_build_object` não omite chave: todas vêm SEMPRE, com `null` quando for o caso — por isso
// `.nullable()` e não `.optional()` (uma chave que SUMA é drift e tem de reprovar). Com
// `mesesCobertos = 0`, ou Receita Bruta ≤ 0, o `pct` vem null (o ano não tem ponto).

/** 'YYYY-MM-DD' (date puro, sem fuso). */
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const proporcaoReceitaMarketingSchema = z.object({
  ano: z.number().int(),
  /** Meses do ano que entram na proporção (0..12). 12 em ano fechado; no ano corrente, a
   *  cobertura da base de competência. 0 = o ano não tem ponto. */
  mesesCobertos: z.number().int().min(0).max(12),
  /** O ano pedido é o corrente (SP) e ainda não está inteiro na base (`mesesCobertos < 12`). */
  parcial: z.boolean(),
  /** Última competência da base (GLOBAL, não do ano pedido); null com a base vazia. */
  coberturaAte: dataIso.nullable(),
  /** Marketing ÷ Receita Bruta × 100 na janela, com o sinal da DRE (despesa → negativo). */
  pct: z.number().nullable(),
})

export type ProporcaoReceitaMarketing = z.infer<typeof proporcaoReceitaMarketingSchema>
