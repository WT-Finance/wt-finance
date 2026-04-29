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
