import { z, type ZodType } from 'zod'
import type { RpcLike } from './rpc'

// Validação de SHAPE das respostas de RPCs críticas (F7, v4.12). Complementa o
// unwrapRpc (F5): além de logar erro de RPC, valida o formato do retorno com Zod
// e loga drift (RPC mudou e o tipo não) — falha degrada para null (não quebra a
// tela; alimenta o mesmo "estado de erro" do F5). RPCs novas devem nascer tipadas.
//
// A SEMENTE foi get_mix_produto (v4.12). v4.12.1/M2 estendeu o padrão às 8 RPCs
// críticas: get_mix_produto, get_executiva_kpis, get_tendencia_margem,
// get_ranking_vendedores_range, get_vendas_em_aberto, get_vendas_receita_negativa,
// get_operacoes_weddings e get_carteira_weddings. Cada schema ESPELHA o tipo TS
// correspondente (z.infer estruturalmente compatível); o objeto raiz usa
// .passthrough() para tolerar colunas extras vindas do banco sem falsear o drift.

export function parseRpc<T>(schema: ZodType<T>, res: RpcLike, contexto: string): T | null {
  if (res.error) {
    console.error(`[RPC ${contexto}] ${res.error.message ?? 'erro desconhecido'}`)
    return null
  }
  const parsed = schema.safeParse(res.data)
  if (!parsed.success) {
    console.error(`[RPC ${contexto}] shape inesperado (contrato divergiu?): ${parsed.error.message}`)
    return null
  }
  return parsed.data
}

// ── Schemas das RPCs críticas ────────────────────────────────────────────────

const mixProdutoItem = z.object({
  produto_nome:    z.string(),
  faturamento:     z.number(),
  receita:         z.number(),
  margem_pct:      z.number().nullable(),
  pct_faturamento: z.number(),
})

/** get_mix_produto → { produtos[], outros } */
export const mixProdutoSchema = z.object({
  produtos: z.array(mixProdutoItem),
  outros:   mixProdutoItem.extend({ quantidade_produtos: z.number() }),
})

// ── get_executiva_kpis → ExecutivaKpis ───────────────────────────────────────

const periodoRef = z.object({
  from: z.string(),
  to:   z.string(),
})

const kpiMetrica = z.object({
  valor:             z.number().nullable(),
  variacao_anterior: z.number().nullable(),
  variacao_yoy:      z.number().nullable(),
  is_pp:             z.boolean().optional(),
})

/** get_executiva_kpis → { periodo, periodo_anterior, periodo_yoy, 6× KpiMetrica } */
export const executivaKpisSchema = z.object({
  periodo:          periodoRef,
  periodo_anterior: periodoRef,
  periodo_yoy:      periodoRef,
  faturamento:      kpiMetrica,
  receita:          kpiMetrica,
  margem_pct:       kpiMetrica,
  vendas:           kpiMetrica,
  ticket_medio:     kpiMetrica,
  receita_media:    kpiMetrica,
}).passthrough()

// ── get_tendencia_margem → TendenciaMargem ───────────────────────────────────

const tendenciaMargemPonto = z.object({
  label:       z.string(),
  data_inicio: z.string(),
  faturamento: z.number(),
  receita:     z.number(),
  margem_pct:  z.number().nullable(),
})

/** get_tendencia_margem → { granularidade, pontos[] } */
export const tendenciaMargemSchema = z.object({
  granularidade: z.enum(['diaria', 'semanal', 'mensal']),
  pontos:        z.array(tendenciaMargemPonto),
}).passthrough()

// ── get_ranking_vendedores_range → RankingVendedorItem[] ─────────────────────

const rankingVendedorItem = z.object({
  vendedor_id: z.number(),
  nome:        z.string(),
  valor_total: z.number(),
  receitas:    z.number(),
  vendas_count: z.number(),
}).passthrough()

/** get_ranking_vendedores_range → RankingVendedorItem[] (array) */
export const rankingVendedoresRangeSchema = z.array(rankingVendedorItem)

// ── get_vendas_em_aberto → VendasEmAberto ────────────────────────────────────

const vendaEmAberto = z.object({
  venda_no:    z.string(),
  data_venda:  z.string(),
  valor_total: z.number(),
  vendedor:    z.string(),
  idade_dias:  z.number(),
}).passthrough()

/** get_vendas_em_aberto → { total, vendas[] } */
export const vendasEmAbertoSchema = z.object({
  total:  z.number(),
  vendas: z.array(vendaEmAberto),
}).passthrough()

// ── get_vendas_receita_negativa → VendasReceitaNegativa ──────────────────────

const vendaReceitaNegativaItem = z.object({
  venda_no:    z.string(),
  data_venda:  z.string(),
  valor_total: z.number(),
  receita:     z.number(),
  vendedor:    z.string(),
}).passthrough()

/** get_vendas_receita_negativa → { total, vendas[] } */
export const vendasReceitaNegativaSchema = z.object({
  total:  z.number(),
  vendas: z.array(vendaReceitaNegativaItem),
}).passthrough()

// ── get_operacoes_weddings → ListaOperacoes ──────────────────────────────────

const operacaoFlag = z.enum(['margem_negativa', 'ncg_alto', 'outlier'])

const operacaoItem = z.object({
  operacao:            z.string(),
  nome_casal:          z.string().nullable(),
  data_evento:         z.string().nullable(),
  situacao:            z.enum(['passado', 'futuro', 'sem_data']),
  faturamento:         z.number(),
  receita:             z.number(),
  margem_pct:          z.number(),
  entradas_total:      z.number(),
  saidas_total:        z.number(),
  resultado_caixa:     z.number(),
  ncg:                 z.number(),
  flags:               z.array(operacaoFlag),
  hotel:               z.string().nullable(),
  custos_internos:     z.number(),
  margem_liquida_pct:  z.number(),
  data_venda_contrato: z.string().nullable(),
  tipo_contrato:       z.string().nullable(),
  // get_operacoes_weddings NÃO emite passageiros_raw (o tipo TS o declarava, mas a
  // RPC nunca o retornou; o componente também não o lê). `.optional()` reflete o
  // contrato real — sem ele, `.nullable()` rejeita o campo ausente (undefined) e a
  // Lista de Operações retornava HTTP 500. (v4.12.1, fix pós-M2.)
  passageiros_raw:     z.string().nullable().optional(),
  convidados:          z.number().nullable(),
}).passthrough()

/** get_operacoes_weddings → { total, pagina, por_pagina, operacoes[] } (ListaOperacoes) */
export const operacoesWeddingsSchema = z.object({
  total:      z.number(),
  pagina:     z.number(),
  por_pagina: z.number(),
  operacoes:  z.array(operacaoItem),
}).passthrough()

// ── get_carteira_weddings → CarteiraWeddings ─────────────────────────────────

const carteiraLinha = z.object({
  ano_venda: z.string(),
  valores:   z.record(z.string(), z.number()),  // CarteiraValores: { [ano]: number }
  total:     z.number(),
}).passthrough()

/** get_carteira_weddings → { metrica, anos_casamento[], linhas[] } */
export const carteiraWeddingsSchema = z.object({
  metrica:        z.string(),
  anos_casamento: z.array(z.string()),
  linhas:         z.array(carteiraLinha),
}).passthrough()
