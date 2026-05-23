// Tipos gerados manualmente com base nas migrations da M1.
// Quando a Supabase CLI estiver disponível, substituir por:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  raw: {
    Tables: {
      vendas_excel: {
        Row: {
          id: number
          arquivo_origem: string
          linha_origem: number
          carregado_em: string
          venda_numero: string | null
          data_venda: string | null
          vendedor: string | null
          pagante: string | null
          setor: string | null
          produto: string | null
          receitas: number | null
          valor_total: number | null
          semana: number | null
          setor_macro: string | null
          mes: string | null
          setor_micro: string | null
          contrato: boolean | null
          taxa_servico: boolean | null
        }
        Insert: {
          id?: number
          arquivo_origem: string
          linha_origem: number
          carregado_em?: string
          venda_numero?: string | null
          data_venda?: string | null
          vendedor?: string | null
          pagante?: string | null
          setor?: string | null
          produto?: string | null
          receitas?: number | null
          valor_total?: number | null
          semana?: number | null
          setor_macro?: string | null
          mes?: string | null
          setor_micro?: string | null
          contrato?: boolean | null
          taxa_servico?: boolean | null
        }
        Update: Partial<Database['raw']['Tables']['vendas_excel']['Insert']>
      }
      lancamentos: {
        Row: {
          id: number; arquivo_origem: string; carregado_em: string
          numero: string | null; venda_no: number | null
          emissao: string | null; vencimento: string | null; liquidacao: string | null
          pessoa: string | null; descricao: string | null
          descricao_categoria: string | null
          valor: number
          categoria: string | null; grupo_categoria: string | null; conta: string | null
        }
        Insert: Omit<Database['raw']['Tables']['lancamentos']['Row'], 'id' | 'carregado_em'>
        Update: Partial<Database['raw']['Tables']['lancamentos']['Insert']>
      }
      vendas_pagamento: {
        Row: {
          id: number; arquivo_origem: string; carregado_em: string
          venda_no: number | null; data_venda: string | null
          forma_pagamento: string | null; conta: string | null
          valor: number | null
        }
        Insert: Omit<Database['raw']['Tables']['vendas_pagamento']['Row'], 'id' | 'carregado_em'>
        Update: Partial<Database['raw']['Tables']['vendas_pagamento']['Insert']>
      }
      contas_pagar_receber: {
        Row: {
          id: number; arquivo_origem: string; carregado_em: string
          tipo_movimento: 'A_RECEBER' | 'A_PAGAR'
          vencimento: string | null; liquidacao: string | null
          pessoa: string | null; descricao: string | null
          valor: number | null; valor_final: number | null
          conferido: boolean | null
        }
        Insert: Omit<Database['raw']['Tables']['contas_pagar_receber']['Row'], 'id' | 'carregado_em'>
        Update: Partial<Database['raw']['Tables']['contas_pagar_receber']['Insert']>
      }
    }
  }
  analytics: {
    Tables: {
      dim_setor_macro: {
        Row: {
          id: number
          nome: string
          display_nome: string
          cor_hex: string
          ordem: number
        }
        Insert: {
          id?: number
          nome: string
          display_nome: string
          cor_hex: string
          ordem: number
        }
        Update: Partial<Database['analytics']['Tables']['dim_setor_macro']['Insert']>
      }
      dim_setor: {
        Row: {
          id: number
          nome: string
          setor_macro_id: number
        }
        Insert: {
          id?: number
          nome: string
          setor_macro_id: number
        }
        Update: Partial<Database['analytics']['Tables']['dim_setor']['Insert']>
      }
      dim_setor_micro: {
        Row: {
          id: number
          nome: string
          setor_id: number
        }
        Insert: {
          id?: number
          nome: string
          setor_id: number
        }
        Update: Partial<Database['analytics']['Tables']['dim_setor_micro']['Insert']>
      }
      dim_vendedor: {
        Row: {
          id: number
          nome: string
          ativo: boolean
          criado_em: string
        }
        Insert: {
          id?: number
          nome: string
          ativo?: boolean
          criado_em?: string
        }
        Update: Partial<Database['analytics']['Tables']['dim_vendedor']['Insert']>
      }
      dim_pagante: {
        Row: {
          id: number
          nome: string
          criado_em: string
        }
        Insert: {
          id?: number
          nome: string
          criado_em?: string
        }
        Update: Partial<Database['analytics']['Tables']['dim_pagante']['Insert']>
      }
      dim_produto: {
        Row: {
          id: number
          nome: string
          categoria: string | null
          criado_em: string
        }
        Insert: {
          id?: number
          nome: string
          categoria?: string | null
          criado_em?: string
        }
        Update: Partial<Database['analytics']['Tables']['dim_produto']['Insert']>
      }
      dim_data: {
        Row: {
          data: string
          ano: number
          mes: number
          mes_nome: string
          mes_abrev: string
          dia: number
          dia_semana: number
          dia_semana_nome: string
          semana_iso: number
          dia_util: boolean
          dia_util_mes: number | null
          dias_uteis_no_mes: number | null
          trimestre: number
        }
        Insert: {
          data: string
          ano: number
          mes: number
          mes_nome: string
          mes_abrev: string
          dia: number
          dia_semana: number
          dia_semana_nome: string
          semana_iso: number
          dia_util: boolean
          dia_util_mes?: number | null
          dias_uteis_no_mes?: number | null
          trimestre: number
        }
        Update: Partial<Database['analytics']['Tables']['dim_data']['Insert']>
      }
      fato_venda: {
        Row: {
          id: number
          venda_numero: string
          data_venda: string
          vendedor_id: number
          pagante_id: number | null
          contrato: boolean
          taxa_servico: boolean
          criado_em: string
        }
        Insert: {
          id?: number
          venda_numero: string
          data_venda: string
          vendedor_id: number
          pagante_id?: number | null
          contrato?: boolean
          taxa_servico?: boolean
          criado_em?: string
        }
        Update: Partial<Database['analytics']['Tables']['fato_venda']['Insert']>
      }
      fato_venda_item: {
        Row: {
          id: number
          fato_venda_id: number
          produto_id: number
          setor_id: number
          setor_micro_id: number
          valor_total: number
          receitas: number
        }
        Insert: {
          id?: number
          fato_venda_id: number
          produto_id: number
          setor_id: number
          setor_micro_id: number
          valor_total: number
          receitas: number
        }
        Update: Partial<Database['analytics']['Tables']['fato_venda_item']['Insert']>
      }
    }
    Views: {
      mv_vendas_diarias: {
        Row: {
          data_venda: string
          setor_macro_id: number
          valor_total: number
          receitas: number
          vendas_count: number
        }
      }
      mv_vendas_mensais: {
        Row: {
          ano: number
          mes: number
          setor_macro_id: number
          valor_total: number
          receitas: number
          vendas_count: number
        }
      }
      mv_ranking_vendedores_mensal: {
        Row: {
          ano: number
          mes: number
          vendedor_id: number
          setor_macro_id: number
          valor_total: number
          receitas: number
          vendas_count: number
        }
      }
      mv_ranking_produtos_mensal: {
        Row: {
          ano: number
          mes: number
          produto_id: number
          setor_macro_id: number
          valor_total: number
          receitas: number
          vendas_count: number
        }
      }
    }
  }
  app: {
    Tables: {
      meta_setor: {
        Row: {
          id: number
          setor_macro_id: number
          ano: number
          mes: number
          valor_meta: number
          fonte: 'real' | 'ficticia'
          criado_em: string
        }
        Insert: {
          id?: number
          setor_macro_id: number
          ano: number
          mes: number
          valor_meta: number
          fonte: 'real' | 'ficticia'
          criado_em?: string
        }
        Update: Partial<Database['app']['Tables']['meta_setor']['Insert']>
      }
      meta_setor_historico: {
        Row: {
          id: number
          setor_macro_id: number
          ano: number
          mes: number
          valor_meta: number
          fonte: 'real' | 'ficticia'
          criado_em: string
          alterado_em: string
          alterado_por: string | null
          valor_anterior: number | null
          motivo_alteracao: string | null
        }
        Insert: {
          id?: number
          setor_macro_id: number
          ano: number
          mes: number
          valor_meta: number
          fonte: 'real' | 'ficticia'
          criado_em?: string
          alterado_em?: string
          alterado_por?: string | null
          valor_anterior?: number | null
          motivo_alteracao?: string | null
        }
        Update: Partial<Database['app']['Tables']['meta_setor_historico']['Insert']>
      }
    }
  }
  audit: {
    Tables: {
      ingestao_log: {
        Row: {
          id: number
          fonte: string
          iniciado_em: string
          finalizado_em: string | null
          status: 'sucesso' | 'falha' | 'em_progresso'
          registros_processados: number | null
          erro_mensagem: string | null
        }
        Insert: {
          id?: number
          fonte: string
          iniciado_em: string
          finalizado_em?: string | null
          status: 'sucesso' | 'falha' | 'em_progresso'
          registros_processados?: number | null
          erro_mensagem?: string | null
        }
        Update: Partial<Database['audit']['Tables']['ingestao_log']['Insert']>
      }
    }
  }
  // Schema public: apenas as funções RPC do seed — tabelas ficam nos schemas nomeados acima
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: {
      truncate_dynamic_tables: { Args: Record<string, never>; Returns: void }
      inserir_lote_raw: { Args: { p_linhas: unknown }; Returns: void }
      transform_raw_to_analytics: {
        Args: Record<string, never>
        Returns: { vendas_count: number; fato_venda_item_count: number }
      }
      refresh_all_materialized_views: { Args: Record<string, never>; Returns: void }
      registrar_ingestao_log: {
        Args: { p_fonte: string; p_status: string; p_registros?: number; p_erro?: string }
        Returns: void
      }
      inserir_metas: { Args: { p_metas: unknown }; Returns: void }
      get_setores_macro: { Args: Record<string, never>; Returns: Json }
      get_kpis: {
        Args: { p_ano: number; p_mes: number; p_setor?: string }
        Returns: Json
      }
      get_ritmo_diario: {
        Args: { p_ano: number; p_mes: number; p_setor?: string }
        Returns: Json
      }
      get_historico_mensal: {
        Args: { p_setor?: string }
        Returns: Json
      }
      get_ranking_vendedores: {
        Args: { p_ano: number; p_mes: number; p_setor?: string; p_limite?: number }
        Returns: Json
      }
      get_ranking_produtos: {
        Args: { p_ano: number; p_mes: number; p_setor?: string; p_limite?: number }
        Returns: Json
      }
      get_executiva_kpis: {
        Args: {
          p_from: string; p_to: string; p_setor?: string
          p_ant_from?: string; p_ant_to?: string
          p_yoy_from?: string; p_yoy_to?: string
        }
        Returns: Json
      }
      get_mix_setor: {
        Args: { p_from: string; p_to: string; p_setor?: string }
        Returns: Json
      }
      get_prejuizos: {
        Args: { p_from: string; p_to: string; p_setor?: string; p_summary?: boolean }
        Returns: Json
      }
      get_tendencia_margem: {
        Args: { p_from: string; p_to: string; p_setor?: string }
        Returns: Json
      }
      get_mix_produto: {
        Args: { p_from: string; p_to: string; p_setor?: string; p_limite?: number }
        Returns: Json
      }
      get_cagr: {
        Args: Record<string, never>
        Returns: Json
      }
      get_dashboard_config: {
        Args: Record<string, never>
        Returns: Json
      }
      get_decomposicao_variacao: {
        Args: {
          p_from: string; p_to: string
          p_ant_from: string; p_ant_to: string
          p_setor?: string
        }
        Returns: Json
      }
      get_historico_12m: {
        Args: { p_setor?: string }
        Returns: Json
      }
      get_historico_12m_setores: {
        Args: { p_setor?: string }
        Returns: Json
      }
      get_sumario_subsetor: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_operacoes_weddings: {
        Args: {
          p_status?:         string
          p_periodo_inicio?: string | null
          p_periodo_fim?:    string | null
          p_subsetor?:       string
          p_busca?:          string | null
          p_ordenar_por?:    string
          p_direcao?:        string
          p_pagina?:         number
          p_por_pagina?:     number
        }
        Returns: Json
      }
      get_operacao_weddings: {
        Args: { p_operacao: string }
        Returns: Json
      }
      get_pipeline_weddings: {
        Args: { p_horizonte_meses?: number }
        Returns: Json
      }
      get_carteira_weddings: {
        Args: { p_metric?: string }
        Returns: Json
      }
      get_proximos_casamentos: {
        Args: { p_horizonte_meses?: number }
        Returns: Json
      }
      get_acumulado_weddings: {
        Args: { p_meses_passados?: number; p_meses_futuros?: number; p_operacao?: string | null }
        Returns: Json
      }
      get_vendas_em_aberto_weddings: {
        Args: { p_limite?: number; p_offset?: number }
        Returns: Json
      }
      get_operacoes_lista_weddings: {
        Args: Record<string, never>
        Returns: Json
      }
      get_vendas_prejuizo_weddings: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      // Lancamentos (uploads admin)
      get_upload_status:             { Args: Record<string, never>; Returns: Json }
      truncar_lancamentos:           { Args: Record<string, never>; Returns: void }
      inserir_lote_lancamentos:      { Args: { p_linhas: unknown }; Returns: void }
      regenerar_dim_operacao_weddings: { Args: Record<string, never>; Returns: void }
      // Financeiro RPCs (v4.0)
      regenerar_financeiro_lancamentos: { Args: Record<string, never>; Returns: void }
      get_fluxo_caixa_mensal:  { Args: { p_from: string; p_to: string }; Returns: Json }
      get_proximos_vencimentos: { Args: { p_limite?: number; p_offset?: number }; Returns: Json }
      get_posicao_por_conta:   { Args: Record<string, never>; Returns: Json }
      get_decomposicao_grupo:  { Args: { p_from: string; p_to: string }; Returns: Json }
    }
  }
  financeiro: {
    Tables: {
      dim_categoria: {
        Row:    { id: number; categoria: string; grupo_categoria: string }
        Insert: { id?: number; categoria: string; grupo_categoria: string }
        Update: Partial<{ categoria: string; grupo_categoria: string }>
      }
      dim_conta_bancaria: {
        Row:    { id: number; conta: string; tipo: string }
        Insert: { id?: number; conta: string; tipo: string }
        Update: Partial<{ conta: string; tipo: string }>
      }
      fato_lancamentos: {
        Row: {
          id: number; arquivo_origem: string; carregado_em: string
          numero: string | null; venda_no: number | null
          emissao: string | null; vencimento: string | null; liquidacao: string | null
          pessoa: string | null; descricao: string | null
          descricao_categoria: string | null
          valor: number
          categoria_id: number | null; conta_bancaria_id: number | null
        }
        Insert: Omit<Database['financeiro']['Tables']['fato_lancamentos']['Row'], 'id' | 'carregado_em'>
        Update: Partial<Database['financeiro']['Tables']['fato_lancamentos']['Insert']>
      }
    }
    Views: {
      vw_fluxo_caixa_mensal:    { Row: { mes: string; grupo_categoria: string; tipo: string; valor_total: number } }
      vw_proximos_vencimentos:  { Row: { aging: string; tipo_movimento: string; count: number; valor_total: number } }
      vw_posicao_por_conta:     { Row: { conta: string; tipo: string; saldo: number } }
      vw_decomposicao_grupo:    { Row: { grupo_categoria: string; sinal: string; valor_total: number } }
    }
  }
}

// Tipos auxiliares para uso conveniente nos componentes e APIs
export type SetorMacro = Database['analytics']['Tables']['dim_setor_macro']['Row']
export type SetorMacroNome = 'Lazer' | 'Weddings' | 'Corporativo'
export type FiltroSetorMacro = SetorMacroNome | 'todos'

export type MetaSetor = Database['app']['Tables']['meta_setor']['Row']
export type IngestaoLog = Database['audit']['Tables']['ingestao_log']['Row']

export type VendasDiarias = Database['analytics']['Views']['mv_vendas_diarias']['Row']
export type VendasMensais = Database['analytics']['Views']['mv_vendas_mensais']['Row']
export type RankingVendedor = Database['analytics']['Views']['mv_ranking_vendedores_mensal']['Row']
export type RankingProduto = Database['analytics']['Views']['mv_ranking_produtos_mensal']['Row']
