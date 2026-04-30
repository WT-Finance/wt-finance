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
