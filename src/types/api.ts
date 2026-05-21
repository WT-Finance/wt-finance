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

export interface Sparklines {
  labels:        string[]
  faturamento:   number[]
  receita:       number[]
  margem_pct:    (number | null)[]
  vendas:        number[]
  ticket_medio:  (number | null)[]
  receita_media: (number | null)[]
}

// ── V3.4: Aba Weddings — Parte 2 ───────────────────────────────────────────

export interface SumarioSubsetorItem {
  subsetor:        string
  n_vendas:        number
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
  operacao:           string
  nome_casal:         string | null
  data_evento:        string | null
  situacao:           'passado' | 'futuro' | 'sem_data'
  faturamento:        number
  receita:            number
  margem_pct:         number
  resultado_caixa:    number
  ncg:                number
  flags:              OperacaoFlag[]
  hotel:              string | null
  custos_internos:    number
  margem_liquida_pct: number
}

export interface ListaOperacoes {
  total:      number
  pagina:     number
  por_pagina: number
  operacoes:  OperacaoItem[]
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

export interface DecomposicaoSubsetorItem {
  subsetor: string
  receita:  number
  pct:      number
}

export interface AcumuladoMensalItem {
  mes:          string
  entrada_acum: number
  saida_acum:   number
}

export interface LancamentoRecente {
  data:      string | null
  tipo:      'Entrada' | 'Saída'
  descricao: string | null
  valor:     number
  status:    string | null
}

export interface DrilldownOperacao {
  operacao:                string
  nome_casal:              string | null
  data_evento:             string | null
  situacao:                'passado' | 'futuro' | 'sem_data'
  hotel:                   string | null
  visao_financeira:        VisaoFinanceira
  decomposicao_subsetor:   DecomposicaoSubsetorItem[]
  acumulado_mensal:        AcumuladoMensalItem[]
  lancamentos_recentes:    LancamentoRecente[]
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
