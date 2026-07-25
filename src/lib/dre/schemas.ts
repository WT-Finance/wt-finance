import { z } from 'zod'

// ── Schemas Zod das RPCs da DRE (v5.3.0 · Onda 2) ─────────────────────────────
// Regra do projeto: o schema reflete o retorno REAL da RPC (não o tipo TS) — campo
// que a RPC às vezes não emite é .optional(); objetos raiz toleram chaves extras
// (.passthrough()) para o drift não falsear. Casos vivos em rpc-contrato.test.ts.
//
// Números: as RPCs devolvem json (numeric → number no JSON). `meses` tem SEMPRE 12
// posições (a RPC monta por generate_series(1,12)); `prev_corrente` só existe (não
// nulo) quando o ano pedido é o corrente — a 2ª coluna do mês híbrido.

/** Uma linha do demonstrativo (bloco, sub, totalizador ou categoria-folha). */
export const dreLinhaSchema = z.object({
  t:             z.enum(['blocoH', 'sub', 'tot', 'cat']),
  rotulo:        z.string(),
  estrela:       z.boolean(),
  meses:         z.array(z.number()).length(12),
  prev_corrente: z.number().nullable().optional(),
  // `venc` (vencidos em aberto) viaja no payload mas a UI ainda NÃO o exibe/soma — decisão
  // ADIADA pelo Yan ao refino final ("refinamos melhor ao final"); com o dado já na resposta,
  // o refino é só front, sem nova migration. NÃO é pendência esquecida.
  venc:          z.number(),
  total:         z.number(),
  // blocos têm `chave`; categorias têm `g` (bloco pai) + `categoria_id`
  chave:         z.string().optional(),
  g:             z.string().optional(),
  categoria_id:  z.number().optional(),
}).passthrough()

/** Linha da bandeja "Não classificadas" (órfã do de-para). */
export const dreBandejaSchema = z.object({
  categoria_id:  z.number(),
  rotulo:        z.string(),
  grupo_monde:   z.string(),
  meses:         z.array(z.number()).length(12),
  prev_corrente: z.number().nullable().optional(),
  venc:          z.number(),
  total:         z.number(),
}).passthrough()

export const dreMensalSchema = z.object({
  ano:             z.number(),
  hoje:            z.string(),                                   // date → 'AAAA-MM-DD'
  relacao:         z.enum(['fechado', 'corrente', 'futuro']),
  mes_corrente:    z.number().nullable(),
  token_estrutura: z.string().nullable(),                        // timestamptz ISO (trava otimista)
  linhas:          z.array(dreLinhaSchema),
  bandeja:         z.array(dreBandejaSchema),
}).passthrough()

export type DreMensal  = z.infer<typeof dreMensalSchema>
export type DreLinha   = z.infer<typeof dreLinhaSchema>
export type DreBandeja = z.infer<typeof dreBandejaSchema>

// ── Estrutura viva (editor) ───────────────────────────────────────────────────

export const estruturaBlocoSchema = z.object({
  chave:        z.string(),
  rotulo:       z.string(),
  tipo:         z.enum(['blocoH', 'sub', 'tot']),
  ordem:        z.number(),
  formula:      z.array(z.string()).nullable(),
  nota_estrela: z.boolean(),
}).passthrough()

export const estruturaMapSchema = z.object({
  categoria_id: z.number(),
  nome:         z.string(),
  rotulo:       z.string(),
  bloco_chave:  z.string().nullable(),
  ordem:        z.number(),
  nota_estrela: z.boolean(),
  excluida:     z.boolean(),
}).passthrough()

export const estruturaBandejaSchema = z.object({
  categoria_id: z.number(),
  nome:         z.string(),
  grupo_monde:  z.string(),
}).passthrough()

export const dreEstruturaSchema = z.object({
  token:   z.string().nullable(),
  blocos:  z.array(estruturaBlocoSchema),
  maps:    z.array(estruturaMapSchema),
  bandeja: z.array(estruturaBandejaSchema),
}).passthrough()

export type DreEstrutura        = z.infer<typeof dreEstruturaSchema>
export type EstruturaBloco      = z.infer<typeof estruturaBlocoSchema>
export type EstruturaMap        = z.infer<typeof estruturaMapSchema>
export type EstruturaBandeja    = z.infer<typeof estruturaBandejaSchema>

export const salvarEstruturaResultSchema = z.object({
  ok:       z.boolean(),
  gravadas: z.number(),
  token:    z.string().nullable(),
}).passthrough()

/** Item do lote de dre_estrutura_salvar (INPUT — espelha a validação da RPC). */
export interface SalvarMapItem {
  categoria_id: number
  bloco_chave:  string | null
  ordem:        number
  excluida:     boolean
}

// ── Histórico (mesmo shape do Gerencial — 0200/0206) ──────────────────────────

export const historicoLoteSchema = z.object({
  lote_id:      z.string(),
  criado_em:    z.string(),
  usuario_id:   z.string().nullable(),
  usuario_nome: z.string().nullable(),
  n_linhas:     z.number(),
  operacoes:    z.array(z.string()),
  is_undo:      z.boolean(),
}).passthrough()

export const historicoLotesSchema = z.array(historicoLoteSchema)

export const historicoEntradaSchema = z.object({
  id:           z.number(),
  tabela_alvo:  z.string().optional(),   // presente nas RPCs da estrutura (duas tabelas)
  operacao:     z.string(),
  registro_id:  z.string(),
  dados_antes:  z.record(z.string(), z.unknown()).nullable(),
  dados_depois: z.record(z.string(), z.unknown()).nullable(),
  usuario_nome: z.string().nullable(),
  criado_em:    z.string(),
  origem_undo:  z.string().nullable(),
}).passthrough()

export const historicoEntradasSchema = z.array(historicoEntradaSchema)

export type HistoricoLote    = z.infer<typeof historicoLoteSchema>
export type HistoricoEntrada = z.infer<typeof historicoEntradaSchema>
