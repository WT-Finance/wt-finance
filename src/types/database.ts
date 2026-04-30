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
        Args: { p_from: string; p_to: string; p_setor?: string }
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
