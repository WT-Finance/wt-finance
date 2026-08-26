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

// ── Bandeja "Não classificadas" (órfã do de-para) ────────────────────────────
// Os dois regimes têm bandeja, e a IDENTIDADE de uma órfã é diferente em cada um: o
// caixa chaveia por `dim_categoria.id` (inteiro do banco); a competência chaveia pelo
// par de TEXTO (Grupo, Descrição) que vem no arquivo, porque é só isso que existe numa
// linha que ninguém mapeou.
//
// ⚠️ Por que schemas SEPARADOS e não um só com `categoria_id` opcional: exigir
// `categoria_id` da competência criaria um apagão silencioso no pior momento possível.
// `bandeja` é campo OBRIGATÓRIO do envelope, então um item que falhe o parse derruba o
// `safeParse` do objeto RAIZ, `parseRpc` devolve `null` e a seção inteira desaparece
// deixando só um `console.error` — e isso aconteceria no PRIMEIRO export com um par não
// mapeado, ou seja, exatamente quando a bandeja precisava aparecer. (Achado ALTO do
// `revisor-db` na v5.8.0, corrigido antes de existir call-site.)
// Afrouxar o schema do CAIXA seria a outra saída, e é pior: perderia a guarda que hoje
// pega uma regressão que pare de emitir `categoria_id` lá.

const bandejaComum = z.object({
  rotulo:        z.string(),
  grupo_monde:   z.string(),
  meses:         z.array(z.number()).length(12),
  prev_corrente: z.number().nullable().optional(),
  venc:          z.number(),
  total:         z.number(),
})

/** Bandeja do regime de CAIXA — identidade é `categoria_id` (segue obrigatória). */
export const dreBandejaSchema = bandejaComum.extend({
  categoria_id: z.number(),
  chave:        z.string().optional(),
}).passthrough()

/** Bandeja do regime de COMPETÊNCIA — identidade é `chave` (`grupo · descrição`). */
export const dreCompBandejaSchema = bandejaComum.extend({
  chave:        z.string(),
  categoria_id: z.number().optional(),
}).passthrough()

/** O que a TABELA precisa de uma linha de bandeja, servindo aos DOIS regimes. Interface
 *  explícita (sem o índice `unknown` que `.passthrough()` arrasta) e com as duas
 *  identidades opcionais — quem renderiza usa `categoria_id ?? chave`. */
export interface DreBandejaLinha {
  categoria_id?:  number
  chave?:         string
  rotulo:         string
  grupo_monde:    string
  meses:          number[]
  prev_corrente?: number | null
  venc:           number
  total:          number
}

const envelopeComum = z.object({
  ano:             z.number(),
  hoje:            z.string(),                                   // date → 'AAAA-MM-DD'
  relacao:         z.enum(['fechado', 'corrente', 'futuro']),
  mes_corrente:    z.number().nullable(),
  token_estrutura: z.string().nullable(),                        // timestamptz ISO (trava otimista)
  linhas:          z.array(dreLinhaSchema),
})

export const dreMensalSchema = envelopeComum.extend({
  bandeja: z.array(dreBandejaSchema),
}).passthrough()

/** `get_dre_competencia_mensal` (0257) — MESMO envelope do caixa, com a bandeja própria
 *  e os extras do regime DECLARADOS. Declarar em vez de deixar passar pelo
 *  `.passthrough()` é o que faz um contrato quebrado aparecer no parse em vez de virar
 *  `undefined` silencioso três camadas depois. */
export const dreCompMensalSchema = envelopeComum.extend({
  bandeja:       z.array(dreCompBandejaSchema),
  /** Anos que EXISTEM na base — a fonte das pills de ano deste regime (o caixa deriva
   *  os anos de uma janela em torno de hoje; aqui quem manda é a cobertura do upload). */
  anos:          z.array(z.number()),
  cobertura_de:  z.string().nullable(),
  cobertura_ate: z.string().nullable(),
  carregado_em:  z.string().nullable(),
  /** Completude do ano em centavos inteiros: base = linhas + bandeja + excluídas. */
  reconciliacao: z.object({
    base_centavos:      z.number(),
    linhas_centavos:    z.number(),
    bandeja_centavos:   z.number(),
    excluidas_centavos: z.number(),
    fecha:              z.boolean(),
  }).passthrough(),
}).passthrough()

export type DreMensal      = z.infer<typeof dreMensalSchema>
export type DreCompMensal  = z.infer<typeof dreCompMensalSchema>
export type DreLinha       = z.infer<typeof dreLinhaSchema>
export type DreBandeja     = z.infer<typeof dreBandejaSchema>
export type DreCompBandeja = z.infer<typeof dreCompBandejaSchema>

/** O que a TABELA densa precisa do envelope, servindo aos DOIS regimes. Interface
 *  explícita para o componente não ficar amarrado ao `z.infer` de um regime só —
 *  `DreMensal` e `DreCompMensal` são ambos atribuíveis a ela. */
export interface DreMensalLike {
  ano:             number
  hoje:            string
  relacao:         'fechado' | 'corrente' | 'futuro'
  mes_corrente:    number | null
  token_estrutura: string | null
  linhas:          DreLinha[]
  bandeja:         DreBandejaLinha[]
}

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

/** `dre_comp_estrutura(ano)` (0260) — o MESMO contrato do editor, mais os totais do ano.
 *
 *  Por que os totais viajam AQUI e não numa segunda chamada: no regime de caixa a página do
 *  editor pede `get_dre_mensal` só para alimentar os efeitos dos modais, e casa os valores
 *  por `categoria_id` (que aquele payload traz). O payload de competência não expõe o id da
 *  linha do de-para — a identidade dele é textual —, então casar por fora exigiria refazer o
 *  de-para no cliente. Um `Record<id, total>` calculado no banco é mais curto e não pode
 *  divergir. `ano_totais` diz de QUE ano são os números (default: o último coberto pela base). */
export const dreCompEstruturaSchema = dreEstruturaSchema.extend({
  ano_totais: z.number().nullable(),
  totais:     z.record(z.string(), z.number()),
}).passthrough()

export type DreCompEstrutura = z.infer<typeof dreCompEstruturaSchema>

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
