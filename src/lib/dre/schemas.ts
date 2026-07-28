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

// ── Comparação ano-a-ano (visão Consolidado E Resumo Executivo) ───────────────
// Vivem aqui, e não no componente da tabela, porque a v5.3.1 passou a ter DOIS
// consumidores do mesmo payload (a visão Consolidado e o Resumo Executivo). Tipo
// estruturalmente duplicado entre componentes é a receita do drift silencioso.

/** Os três números que uma comparação precisa de UMA linha em UM ano — já resolvidos
 *  pela página (o `ytd` sai da MESMA janela `mesJanela` em todos os anos, que é o que
 *  torna a comparação honesta). */
export interface RegistroAnoLinha {
  total: number
  ytd:   number
  venc:  number
}

/** Um ano da comparação — um item por ano da janela navegável que a página conseguiu
 *  carregar (ano cuja RPC falhou simplesmente não vem). `porLinha` é indexado por
 *  `b:<chave>` (blocos) / `c:<categoria_id>` (categorias) — casar por CHAVE, e não por
 *  posição, é o que impede a coluna de escorregar de linha quando a estrutura muda de
 *  um ano para o outro. */
export interface ConsolidadoAno {
  ano: number
  /** true = ano CORRENTE (tem previsto em aberto). Vem do payload, NUNCA é inferido:
   *  num ano fechado `total − ytd` é realizado de ago..dez, não projeção. */
  corrente: boolean
  porLinha: Record<string, RegistroAnoLinha>
}

// ── Decomposição por BLOCO da estrutura viva (0209 · v5.3.1) ───────────────────
// `valor` é o net SIGNADO (+ entrada / − saída), não ABS: é o que reconcilia com as
// colunas da tabela e o que deixa o LADO (Entradas | Saídas) ser derivado do dado.
// `bloco_chave: null` numa categoria = NÃO CLASSIFICADA (sem linha no de-para).

export const decBlocoSchema = z.object({
  chave:  z.string(),
  rotulo: z.string(),
  ordem:  z.number(),
  valor:  z.number(),
  n:      z.number(),
}).passthrough()

export const decCategoriaSchema = z.object({
  categoria_id: z.number(),
  bloco_chave:  z.string().nullable(),
  rotulo:       z.string(),
  valor:        z.number(),
  n:            z.number(),
}).passthrough()

export const decomposicaoBlocoSchema = z.object({
  de:         z.string(),                                        // date → 'AAAA-MM-DD'
  ate:        z.string(),
  blocos:     z.array(decBlocoSchema),
  categorias: z.array(decCategoriaSchema),
}).passthrough()

export type DecBloco          = z.infer<typeof decBlocoSchema>
export type DecCategoria      = z.infer<typeof decCategoriaSchema>
export type DecomposicaoBloco = z.infer<typeof decomposicaoBlocoSchema>

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
