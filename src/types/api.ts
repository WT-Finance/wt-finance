export interface SetorMacroInfo {
  id: number
  nome: string
  display_nome: string
  cor_hex: string
  ordem: number
}

export interface KpisMes {
  valor_realizado: number
  receitas_realizadas: number
  vendas_count: number
  valor_meta: number
  pct_atingimento: number | null
  projecao_fim_mes: number | null
  valor_ano_anterior: number
}

export interface RitmoDiarioItem {
  data: string
  dia: number
  dia_util: boolean
  valor_dia: number
  receitas_dia: number
  valor_acumulado: number
  meta_acumulada: number
}

export interface HistoricoMensalItem {
  ano: number
  mes: number
  valor_total: number
  receitas: number
  vendas_count: number
  valor_meta: number
}

export interface RankingVendedorItem {
  vendedor_id: number
  nome: string
  valor_total: number
  receitas: number
  vendas_count: number
}

export interface RankingProdutoItem {
  produto_id: number
  nome: string
  valor_total: number
  receitas: number
  vendas_count: number
}

// ── V2: Aba Executiva / Performance ────────────────────────────────────────

export interface PeriodoRef {
  from: string
  to: string
}

export interface KpiMetrica {
  valor: number | null
  variacao_anterior: number | null
  variacao_yoy: number | null
  is_pp?: boolean  // true para margem_pct (exibir em p.p., não %)
}

export interface ExecutivaKpis {
  periodo: PeriodoRef
  periodo_anterior: PeriodoRef
  periodo_yoy: PeriodoRef
  faturamento: KpiMetrica
  receita: KpiMetrica
  margem_pct: KpiMetrica
  vendas: KpiMetrica
  ticket_medio: KpiMetrica
  receita_media: KpiMetrica
}

export interface MixSetorItem {
  setor_macro: string
  display_nome: string
  cor_hex: string
  faturamento: number
  receita: number
  margem_pct: number | null
  pct_faturamento: number
  pct_receita: number
}

export interface MixSetor {
  total: {
    faturamento: number
    receita: number
    margem_pct: number | null
  }
  setores: MixSetorItem[]
}

export interface PrejuizosSummary {
  quantidade: number
  valor_prejuizo_total: number
}

export interface PrejuizoVendaItem {
  data_venda: string
  vendedor_nome: string
  pagante_nome: string
  produto_nome: string
  valor_total: number
  receitas: number
}

export interface PrejuizosDetalhe {
  total: PrejuizosSummary
  vendas: PrejuizoVendaItem[]
  total_no_periodo: number
}

export interface TendenciaMargemPonto {
  label: string
  data_inicio: string
  faturamento: number
  receita: number
  margem_pct: number | null
}

export interface TendenciaMargem {
  granularidade: 'diaria' | 'semanal' | 'mensal'
  pontos: TendenciaMargemPonto[]
}

export interface MixProdutoItem {
  produto_nome: string
  faturamento: number
  receita: number
  margem_pct: number | null
  pct_faturamento: number
}

export interface MixProdutoOutros extends MixProdutoItem {
  quantidade_produtos: number
}

export interface MixProduto {
  produtos: MixProdutoItem[]
  outros: MixProdutoOutros
}

export interface CagrData {
  ano_inicial: number
  ano_final: number
  faturamento_inicial: number
  faturamento_final: number
  receita_inicial: number
  receita_final: number
  cagr_faturamento_pct: number | null
  cagr_receita_pct: number | null
  erro?: string
}

// ── V3-3: Linha temporal + Sparklines ─────────────────────────────────────

export interface Historico12mItem {
  ano: number
  mes: number
  faturamento: number
  receita: number
  margem_pct: number | null
  eh_atual: boolean
}

export interface Historico12m {
  meses: Historico12mItem[]
}

export interface Historico12mSetoresItem {
  ano:         number
  mes:         number
  eh_atual:    boolean
  total:       number
  receita:     number
  margem_pct:  number | null
  Lazer:       number
  Weddings:    number
  Corporativo: number
}

export interface Historico12mSetores {
  meses: Historico12mSetoresItem[]
}

// ── V3-4: Decomposição de variação ────────────────────────────────────────

export interface DecomposicaoSetor {
  nome:             string
  display_nome:     string
  cor_hex:          string
  atual:            number
  anterior:         number
  variacao:         number
  variacao_pct:     number | null
  contribuicao_pct: number | null
}

export interface DecomposicaoVariacao {
  variacao_total:     number
  variacao_total_pct: number | null
  tem_dados_anterior: boolean
  periodo_atual:      PeriodoRef
  periodo_anterior:   PeriodoRef
  setores:            DecomposicaoSetor[]
}

// ── V3.4: Aba Weddings — Parte 2 ───────────────────────────────────────────

export interface SumarioSubsetorItem {
  subsetor:        string
  n_vendas:        number
  n_contratos?:    number   // contagem de "Contrato de Casamento" (relevante p/ COMERCIAL)
  faturamento:     number
  receita:         number
  margem_pct:      number
  pct_faturamento: number
}

export interface SumarioSubsetor {
  periodo:    { inicio: string; fim: string }
  subsetores: SumarioSubsetorItem[]
  total:      { n_vendas: number; faturamento: number; receita: number; margem_pct: number }
}

export type OperacaoFlag = 'margem_negativa' | 'ncg_alto' | 'outlier'

export interface OperacaoItem {
  operacao:              string
  nome_casal:            string | null
  data_evento:           string | null
  situacao:              'passado' | 'futuro' | 'sem_data'
  faturamento:           number
  receita:               number
  margem_pct:            number
  entradas_total:        number
  saidas_total:          number
  resultado_caixa:       number
  ncg:                   number
  flags:                 OperacaoFlag[]
  hotel:                 string | null
  custos_internos:       number
  margem_liquida_pct:    number
  data_venda_contrato:   string | null
  tipo_contrato:         string | null
  passageiros_raw:       string | null
  convidados:            number | null
  /**
   * v5.5.0 — Rendimento potencial do float, em R$. Valor TEÓRICO (100% do CDI):
   * nunca soma com resultado, margem ou faturamento.
   *
   * `null` quando a operação não tem nenhum lançamento, ou quando não há taxa
   * fechada na série — travessão na tela, nunca zero. Zero é uma afirmação
   * ("rendeu nada") que seria falsa nos dois casos.
   *
   * Opcional no tipo porque só existe depois da migration 0241: a RPC antiga não
   * o emitia, e o `parseRpc` é tolerante.
   */
  rend_float?:           number | null
}

export interface ListaOperacoes {
  total:      number
  pagina:     number
  por_pagina: number
  operacoes:  OperacaoItem[]
  /**
   * v5.5.0 — 1º dia do último mês FECHADO da série do CDI (ISO). Viaja no envelope
   * porque é o mesmo para todas as linhas; é o que o tooltip da coluna mostra como
   * "taxa de referência de MMM/AA" quando a ingestão está atrasada.
   */
  taxa_vigente_mes?: string | null
}

export interface VisaoFinanceira {
  faturamento:        number
  receita_bruta:      number
  margem_pct:         number
  custos_internos:    number
  margem_liquida_pct: number
  entradas_total:     number
  recebido:           number
  a_receber:          number
  saidas_total:       number
  pago:               number
  a_pagar:            number
  resultado_caixa:    number
  resultado_pct:      number
  ncg:                number
}

// v4.8/M6: decomposição no MESMO formato de SumarioSubsetorItem, para reuso
// direto em <SumarioSubsetorCard/> (faturamento, receita, margem_pct, pct_faturamento).
export interface DecomposicaoSubsetorItem {
  subsetor:        string
  faturamento:     number
  receita:         number
  margem_pct:      number
  pct_faturamento: number
}

// v4.8.1/A5: curva CONTÍNUA de caixa acumulado, ENTRADAS e SAÍDAS separadas.
// Efetivo (só liquidado, por liquidacao_dt) é null nos meses futuros;
// projetado por COALESCE(liquidacao_dt, vencimento_dt) inclui o futuro.
export interface AcumuladoMensalItem {
  mes:               string         // 'YYYY-MM'
  entrada_efetiva:   number | null
  entrada_projetada: number
  saida_efetiva:     number | null
  saida_projetada:   number
  eh_futuro:         boolean
}

export interface DrilldownOperacao {
  operacao:                string
  nome_casal:              string | null
  data_evento:             string | null
  situacao:                'passado' | 'futuro' | 'sem_data'
  hotel:                   string | null
  tipo_contrato:           string | null
  convidados:              number | null
  data_venda_contrato:     string | null   // 'YYYY-MM-DD'
  visao_financeira:        VisaoFinanceira
  decomposicao_subsetor:   DecomposicaoSubsetorItem[]
  acumulado_mensal:        AcumuladoMensalItem[]
  /**
   * v5.5.0 — bloco do Rendimento potencial do float. `null` quando a operação não
   * tem lançamento OU quando a série do CDI não tem nenhum mês fechado: nos dois
   * casos o bloco não é exibido, em vez de mostrar zeros que seriam falsos.
   */
  rendimento_float?:       RendimentoFloatOperacao | null
  /** v5.5.0 — último mês FECHADO do CDI (ISO), para a nota de referência. */
  taxa_vigente_mes?:       string | null
}

/**
 * Abertura do Rendimento potencial do float de UMA operação.
 *
 * `rendimento = rendimento_positivo + custo_negativo` por construção: como a
 * diferença entre o saldo virtual e o real acumula exatamente os termos de juro, o
 * total já É a soma das duas parcelas — não são três medidas independentes que
 * precisam ser reconciliadas.
 */
export interface RendimentoFloatOperacao {
  /** Indicador: saldo virtual final − saldo real final, em R$. */
  rendimento:          number | null
  /** Soma só dos meses em que o saldo rendeu (saldo positivo). */
  rendimento_positivo: number | null
  /** Soma só dos meses de custo teórico (saldo negativo). Já vem negativo. */
  custo_negativo:      number | null
  /** Média do saldo REAL (contábil) ao longo dos meses da operação. */
  saldo_medio:         number | null
  meses_positivos:     number
  meses_total:         number
  mes_inicio:          string | null
  mes_fim:             string | null
}

export interface PipelineMesItem {
  ano_mes:            string
  n_casamentos:       number
  receita_total:      number
  margem_pct_media:   number
  resultado_esperado: number
  cor:                'verde' | 'amarelo' | 'vermelho'
}

export interface PipelineWeddings {
  horizonte: number
  meses:     PipelineMesItem[]
  total:     { n_casamentos: number; receita_total: number; resultado_esperado: number }
}

export interface CarteiraValores {
  [ano: string]: number
}

export interface CarteiraLinha {
  ano_venda: string
  valores:   CarteiraValores
  total:     number
}

export interface CarteiraWeddings {
  metrica:         string
  anos_casamento:  string[]
  linhas:          CarteiraLinha[]
}

export interface ProximoCasamento {
  data_casamento:           string
  casal:                    string | null
  hotel:                    string | null
  faturamento:              number
  receita_bruta:            number
  margem_pct:               number
  receita_liquida_prevista: number
  resultado_previsto:       number
}

export interface ProximosCasamentos {
  horizonte_meses:      number
  margem_historica_pct: number | null
  casamentos:           ProximoCasamento[]
}

export interface AcumuladoMensalWeddingsItem {
  mes:          string   // 'YYYY-MM-DD' (primeiro dia do mês)
  eh_futuro:    boolean
  entrada_acum: number
  saida_acum:   number
}

export interface AcumuladoWeddings {
  total_saidas: number
  meses:        AcumuladoMensalWeddingsItem[]
  // v4.9/M5: totais NÃO liquidados (status pendente), independentes de vencimento.
  // A RPC OS EMITE desde a 0106 (o comentário anterior, "ainda NÃO os emite", ficou
  // obsoleto e foi corrigido na v5.4.2 — medido via REST). Seguem `?` de propósito:
  // são o contrato tolerante do parseRpc, e o card de totais degrada sem eles.
  total_a_receber?: number   // entradas não liquidadas ('A Receber Futuro')
  total_a_pagar?:   number   // saídas não liquidadas ('A Pagar Futuro')
}

export interface VendaEmAberto {
  venda_no:    string
  data_venda:  string   // ISO date
  valor_total: number
  vendedor:    string
  idade_dias:  number
}

export interface VendasEmAberto {
  total:  number
  vendas: VendaEmAberto[]
}

export interface VendaReceitaNegativaItem {
  venda_no:    string
  data_venda:  string
  valor_total: number
  receita:     number
  vendedor:    string
}

export interface VendasReceitaNegativa {
  total:  number
  vendas: VendaReceitaNegativaItem[]
}

export interface OperacaoListaItem {
  operacao: string
  label:    string
}
export type OperacoesLista = OperacaoListaItem[]

// ── V4.4: Drawer rico KPI principal Weddings (ADR-0086) ────────────────────

export interface WeddingsDrawerSerie {
  mes:         string        // 'YYYY-MM'
  faturamento: number
  receita:     number
  margem_pct:  number
  n_vendas:    number
}

export interface WeddingsDrawerYoySerie {
  mes:         string
  faturamento: number
  receita:     number
}

export interface WeddingsDrawerTotais {
  faturamento:  number
  receita:      number
  margem_pct:   number
  n_vendas:     number
  ticket_medio: number
  receita_media: number
}

export interface WeddingsDrawerData {
  series:     WeddingsDrawerSerie[]
  yoy_series: WeddingsDrawerYoySerie[]
  totais:     WeddingsDrawerTotais
  subsetores: SumarioSubsetorItem[]
}

// ── v4.6: Fluxo de Caixa Gerencial ──────────────────────────────────────────

export interface GerencialLancamento {
  id:                number
  tipo:              'A pagar' | 'A receber'
  pessoa:            string
  valor_final:       number
  descricao:         string | null
  conta_previsao:    string | null
  vencimento:        string  // YYYY-MM-DD
  origem:            'planilha' | 'manual'
  importado_em:      string | null
  importado_lote_id: string | null
  criado_em:         string
  atualizado_em:     string
}

export interface GerencialSaldo {
  conta:        string
  saldo:        number
  ordem:        number
  ativo:        boolean
  atualizado_em: string
}

export interface GerencialProjecaoDia {
  data:       string  // YYYY-MM-DD
  a_receber:  number
  a_pagar:    number
  resultado:  number
}
