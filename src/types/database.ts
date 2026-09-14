export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acervo_criar: {
        Args: {
          p_descricao: string
          p_mime: string
          p_nome_arquivo: string
          p_storage_path: string
          p_tamanho_bytes: number
          p_titulo: string
        }
        Returns: Json
      }
      acervo_doc_path: { Args: { p_doc_id: number }; Returns: Json }
      acervo_excluir: { Args: { p_doc_id: number }; Returns: Json }
      acervo_listar: { Args: never; Returns: Json }
      admin_acesso_solicitacoes_pendentes: { Args: never; Returns: number }
      admin_atribuir_role: {
        Args: { p_role_id: number; p_user_id: string }
        Returns: Json
      }
      admin_atualizar_nome: {
        Args: { p_nome: string; p_user_id: string }
        Returns: Json
      }
      admin_atualizar_role: {
        Args: {
          p_descricao: string
          p_nome: string
          p_permissoes: string[]
          p_role_id: number
        }
        Returns: Json
      }
      admin_criar_role: {
        Args: { p_descricao: string; p_nome: string; p_permissoes: string[] }
        Returns: Json
      }
      admin_decidir_solicitacao: {
        Args: { p_aprovar: boolean; p_id: number; p_obs?: string }
        Returns: Json
      }
      admin_excluir_role: { Args: { p_role_id: number }; Returns: Json }
      admin_listar_areas: { Args: never; Returns: Json }
      admin_listar_roles: { Args: never; Returns: Json }
      admin_listar_solicitacoes: { Args: never; Returns: Json }
      admin_listar_usuarios: { Args: never; Returns: Json }
      admin_marcar_trocar_senha: { Args: { p_user_id: string }; Returns: Json }
      admin_registrar_usuario: {
        Args: {
          p_email: string
          p_nome: string
          p_role_id: number
          p_user_id: string
        }
        Returns: Json
      }
      admin_set_enforcement: { Args: { p_ativo: boolean }; Returns: Json }
      admin_solic_arquivar_tipo: {
        Args: { p_arquivar: boolean; p_id: number }
        Returns: Json
      }
      admin_solic_excluir_tipo: { Args: { p_id: number }; Returns: Json }
      admin_solic_listar_tipos: { Args: never; Returns: Json }
      admin_solic_salvar_tipo: {
        Args: { p_campos: Json; p_config?: Json; p_id: number; p_nome: string }
        Returns: Json
      }
      admin_solic_tipo_api_config: {
        Args: { p_exposto: boolean; p_tipo_id: number }
        Returns: Json
      }
      apagar_clientes_corp: { Args: { p_ids: number[] }; Returns: Json }
      api_chamada_registrar: {
        Args: {
          p_chave_id: number
          p_detalhe: string
          p_rota: string
          p_status: number
        }
        Returns: Json
      }
      api_chave_listar: { Args: never; Returns: Json }
      api_chave_registrar: {
        Args: {
          p_plataforma: string
          p_robo_user_id: string
          p_segredo_hash: string
        }
        Returns: Json
      }
      api_chave_resolver: { Args: { p_segredo_hash: string }; Returns: Json }
      api_chave_revogar: { Args: { p_id: number }; Returns: Json }
      api_log_listar: {
        Args: { p_chave_id: number; p_limit?: number }
        Returns: Json
      }
      api_retrofit_contratos: { Args: never; Returns: Json }
      api_robo_registrar: {
        Args: { p_email: string; p_nome: string; p_user_id: string }
        Returns: Json
      }
      atualizar_cliente_corp: {
        Args: { p_campo: string; p_id: number; p_valor: string }
        Returns: Json
      }
      atualizar_saldo_caixa: {
        Args: { p_conta: string; p_data_saldo: string; p_saldo: number }
        Returns: boolean
      }
      atualizar_status_nota: { Args: { p_dados: Json }; Returns: Json }
      batch_gerencial_import: {
        Args: {
          p_adicionar: Json
          p_atualizar: Json
          p_importado_em: string
          p_lote_id: string
          p_originador_id: string
          p_originador_nome: string
          p_remover_ids: number[]
        }
        Returns: Json
      }
      buscar_cliente_corporativo: { Args: { p_nomes: string[] }; Returns: Json }
      buscar_docs_fatura: { Args: { p_refs: string[] }; Returns: Json }
      buscar_pessoas: { Args: { p_nomes: string[] }; Returns: Json }
      cancelar_solicitacao_externa: {
        Args: { p_chave_id: number; p_solicitacao_id: number }
        Returns: Json
      }
      cdi_ingest_upsert: { Args: { p_taxas: Json }; Returns: Json }
      consultar_solicitacoes_externas: {
        Args: {
          p_chave_id: number
          p_referencia_origem?: string
          p_solicitacao_id?: number
        }
        Returns: Json
      }
      contar_convidados_operacao: {
        Args: { p_operacao: string }
        Returns: number
      }
      create_gerencial_conta: {
        Args: {
          p_consolidado?: boolean
          p_conta: string
          p_limite?: number
          p_papel?: string
          p_saldo?: number
        }
        Returns: Json
      }
      create_gerencial_lancamento: {
        Args: {
          p_conta_previsao?: string
          p_descricao?: string
          p_importado_em?: string
          p_lote_id?: string
          p_origem?: string
          p_originador_id?: string
          p_originador_nome?: string
          p_pessoa: string
          p_tipo: string
          p_valor_final: number
          p_vencimento: string
        }
        Returns: Json
      }
      criar_solicitacao: {
        Args: {
          p_anexos: Json
          p_data_limite: string
          p_descricao: string
          p_destinatario_role_id: number
          p_destinatario_user_id: string
          p_respostas: Json
          p_tipo_id: number
        }
        Returns: Json
      }
      criar_solicitacao_externa: {
        Args: {
          p_campos: Json
          p_chave_id: number
          p_chave_idempotencia: string
          p_data_limite: string
          p_destinatario: string
          p_referencia_origem?: string
          p_solicitante_email?: string
          p_tipo_slug: string
          p_titulo: string
        }
        Returns: Json
      }
      cruzar_vendas_setor: { Args: { p_vendas: string[] }; Returns: Json }
      delete_gerencial_conta: { Args: { p_conta: string }; Returns: boolean }
      delete_gerencial_lancamento:
        | { Args: { p_id: number }; Returns: boolean }
        | {
            Args: { p_esperado_atualizado_em: string; p_id: number }
            Returns: boolean
          }
      delete_gerencial_lancamentos_bulk:
        | { Args: { p_ids: number[] }; Returns: number }
        | { Args: { p_esperados: Json; p_ids: number[] }; Returns: number }
      dre_comp_estrutura: { Args: { p_ano?: number }; Returns: Json }
      dre_comp_estrutura_desfazer_linha: {
        Args: { p_diario_id: number }
        Returns: Json
      }
      dre_comp_estrutura_desfazer_lote: {
        Args: { p_lote: number }
        Returns: Json
      }
      dre_comp_estrutura_historico_lote: {
        Args: { p_lote: number }
        Returns: Json
      }
      dre_comp_estrutura_historico_lotes: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      dre_comp_estrutura_salvar: {
        Args: { p_maps: Json; p_token: string }
        Returns: Json
      }
      dre_estrutura: { Args: never; Returns: Json }
      dre_estrutura_desfazer_linha: {
        Args: { p_diario_id: number }
        Returns: Json
      }
      dre_estrutura_desfazer_lote: { Args: { p_lote: number }; Returns: Json }
      dre_estrutura_historico_lote: { Args: { p_lote: number }; Returns: Json }
      dre_estrutura_historico_lotes: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      dre_estrutura_salvar: {
        Args: { p_maps: Json; p_token: string }
        Returns: Json
      }
      email_existentes: {
        Args: { p_modo: string; p_refs: string[] }
        Returns: Json
      }
      excluir_cliente_corp: { Args: { p_id: number }; Returns: Json }
      fatura_emissao_existentes: { Args: { p_refs: string[] }; Returns: Json }
      gerencial_desfazer_linha: { Args: { p_diario_id: number }; Returns: Json }
      gerencial_desfazer_lote: { Args: { p_lote: number }; Returns: Json }
      gerencial_historico_lote: { Args: { p_lote: number }; Returns: Json }
      gerencial_historico_lotes: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      get_acumulado_weddings:
        | {
            Args: { p_meses_futuros?: number; p_meses_passados?: number }
            Returns: Json
          }
        | {
            Args: {
              p_meses_futuros?: number
              p_meses_passados?: number
              p_operacoes?: string[]
            }
            Returns: Json
          }
      get_acumulado_weddings__nucleo:
        | {
            Args: { p_meses_futuros?: number; p_meses_passados?: number }
            Returns: Json
          }
        | {
            Args: {
              p_meses_futuros?: number
              p_meses_passados?: number
              p_operacoes?: string[]
            }
            Returns: Json
          }
      get_cagr: { Args: never; Returns: Json }
      get_cagr__nucleo: { Args: never; Returns: Json }
      get_calendario_liquidez: {
        Args: { p_mes_referencia: string }
        Returns: Json
      }
      get_calendario_liquidez__nucleo: {
        Args: { p_mes_referencia: string }
        Returns: Json
      }
      get_carteira_weddings: { Args: { p_metric?: string }; Returns: Json }
      get_carteira_weddings__nucleo: {
        Args: { p_metric?: string }
        Returns: Json
      }
      get_contratos_casamento_mes: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_dashboard_config: { Args: never; Returns: Json }
      get_dashboard_config__nucleo: { Args: never; Returns: Json }
      get_decomposicao_bloco: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_decomposicao_categoria: {
        Args: { p_from: string; p_grupo?: string; p_to: string }
        Returns: Json
      }
      get_decomposicao_categoria__nucleo: {
        Args: { p_from: string; p_grupo?: string; p_to: string }
        Returns: Json
      }
      get_decomposicao_grupo: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_decomposicao_grupo__nucleo: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_decomposicao_variacao: {
        Args: {
          p_ant_from: string
          p_ant_to: string
          p_from: string
          p_setor?: string
          p_to: string
        }
        Returns: Json
      }
      get_decomposicao_variacao__nucleo: {
        Args: {
          p_ant_from: string
          p_ant_to: string
          p_from: string
          p_setor?: string
          p_to: string
        }
        Returns: Json
      }
      get_dre_competencia_mensal: { Args: { p_ano: number }; Returns: Json }
      get_dre_mensal: { Args: { p_ano: number }; Returns: Json }
      get_executiva_kpis: {
        Args: {
          p_ant_from?: string
          p_ant_to?: string
          p_from: string
          p_setor?: string
          p_to: string
          p_yoy_from?: string
          p_yoy_to?: string
        }
        Returns: Json
      }
      get_executiva_kpis__nucleo: {
        Args: {
          p_ant_from?: string
          p_ant_to?: string
          p_from: string
          p_setor?: string
          p_to: string
          p_yoy_from?: string
          p_yoy_to?: string
        }
        Returns: Json
      }
      get_fluxo_caixa_acumulado_v1: { Args: never; Returns: Json }
      get_fluxo_caixa_acumulado_v1__nucleo: { Args: never; Returns: Json }
      get_fluxo_caixa_kpis_b: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_fluxo_caixa_kpis_b__nucleo: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_fluxo_caixa_mensal_v3: { Args: never; Returns: Json }
      get_fluxo_caixa_mensal_v3__nucleo: { Args: never; Returns: Json }
      get_fluxo_cobertura: { Args: never; Returns: Json }
      get_fluxo_horizonte: { Args: never; Returns: Json }
      get_fluxo_previsto_diario: { Args: never; Returns: Json }
      get_fluxo_ranking: { Args: { p_limite?: number }; Returns: Json }
      get_fluxo_runway_semanal: { Args: never; Returns: Json }
      get_gerencial_lancamentos: { Args: { p_limit?: number }; Returns: Json }
      get_gerencial_lancamentos_planilha: { Args: never; Returns: Json }
      get_gerencial_projecao_diaria: {
        Args: { p_dias?: number }
        Returns: Json
      }
      get_gerencial_saldos: { Args: never; Returns: Json }
      get_historico_12m_setores: { Args: { p_setor?: string }; Returns: Json }
      get_historico_12m_setores__nucleo: {
        Args: { p_setor?: string }
        Returns: Json
      }
      get_historico_mensal: { Args: { p_setor?: string }; Returns: Json }
      get_historico_mensal__nucleo: {
        Args: { p_setor?: string }
        Returns: Json
      }
      get_lancamentos_do_dia: { Args: { p_data: string }; Returns: Json }
      get_lancamentos_do_dia__nucleo: {
        Args: { p_data: string }
        Returns: Json
      }
      get_minhas_permissoes: { Args: never; Returns: Json }
      get_mix_produto: {
        Args: {
          p_from: string
          p_limite?: number
          p_setor?: string
          p_to: string
        }
        Returns: Json
      }
      get_mix_produto__nucleo: {
        Args: {
          p_from: string
          p_limite?: number
          p_setor?: string
          p_to: string
        }
        Returns: Json
      }
      get_mix_setor: {
        Args: { p_from: string; p_setor?: string; p_to: string }
        Returns: Json
      }
      get_mix_setor__nucleo: {
        Args: { p_from: string; p_setor?: string; p_to: string }
        Returns: Json
      }
      get_operacao_weddings: { Args: { p_operacao: string }; Returns: Json }
      get_operacao_weddings__nucleo: {
        Args: { p_operacao: string }
        Returns: Json
      }
      get_operacoes_lista_weddings: { Args: never; Returns: Json }
      get_operacoes_lista_weddings__nucleo: { Args: never; Returns: Json }
      get_operacoes_weddings: {
        Args: {
          p_busca?: string
          p_direcao?: string
          p_ordenar_por?: string
          p_pagina?: number
          p_periodo_fim?: string
          p_periodo_inicio?: string
          p_por_pagina?: number
          p_status?: string
          p_subsetor?: string
        }
        Returns: Json
      }
      get_operacoes_weddings__nucleo: {
        Args: {
          p_busca?: string
          p_direcao?: string
          p_ordenar_por?: string
          p_pagina?: number
          p_periodo_fim?: string
          p_periodo_inicio?: string
          p_por_pagina?: number
          p_status?: string
          p_subsetor?: string
        }
        Returns: Json
      }
      get_pipeline_weddings: {
        Args: { p_horizonte_meses?: number }
        Returns: Json
      }
      get_pipeline_weddings__nucleo: {
        Args: { p_horizonte_meses?: number }
        Returns: Json
      }
      get_posicao_por_conta: { Args: never; Returns: Json }
      get_posicao_por_conta__nucleo: { Args: never; Returns: Json }
      get_prejuizos: {
        Args: {
          p_from: string
          p_setor?: string
          p_summary?: boolean
          p_to: string
        }
        Returns: Json
      }
      get_prejuizos__nucleo: {
        Args: {
          p_from: string
          p_setor?: string
          p_summary?: boolean
          p_to: string
        }
        Returns: Json
      }
      get_proximos_casamentos: {
        Args: { p_horizonte_meses?: number }
        Returns: Json
      }
      get_proximos_casamentos__nucleo: {
        Args: { p_horizonte_meses?: number }
        Returns: Json
      }
      get_proximos_lancamentos: {
        Args: { p_dias?: number; p_tipo?: string }
        Returns: Json
      }
      get_proximos_lancamentos__nucleo: {
        Args: { p_dias?: number; p_tipo?: string }
        Returns: Json
      }
      get_ranking_vendedores_range: {
        Args: {
          p_from: string
          p_limite?: number
          p_setor?: string
          p_to: string
        }
        Returns: Json
      }
      get_ranking_vendedores_range__nucleo: {
        Args: {
          p_from: string
          p_limite?: number
          p_setor?: string
          p_to: string
        }
        Returns: Json
      }
      get_rendimento_float: { Args: { p_operacao?: string }; Returns: Json }
      get_repasse_mensal: { Args: { p_ano: number }; Returns: Json }
      get_saldo_caixa: { Args: never; Returns: Json }
      get_saldo_repasse: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_setores_macro: { Args: never; Returns: Json }
      get_setores_macro__nucleo: { Args: never; Returns: Json }
      get_sumario_subsetor: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_sumario_subsetor__nucleo: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_taxas_cdi: {
        Args: { p_meses_futuros?: number; p_meses_passados?: number }
        Returns: Json
      }
      get_tendencia_margem: {
        Args: { p_from: string; p_setor?: string; p_to: string }
        Returns: Json
      }
      get_tendencia_margem__nucleo: {
        Args: { p_from: string; p_setor?: string; p_to: string }
        Returns: Json
      }
      get_upload_status: { Args: never; Returns: Json }
      get_vendas_em_aberto: {
        Args: { p_limite?: number; p_offset?: number; p_setor?: string }
        Returns: Json
      }
      get_vendas_em_aberto__nucleo: {
        Args: { p_limite?: number; p_offset?: number; p_setor?: string }
        Returns: Json
      }
      get_vendas_em_aberto_weddings: {
        Args: { p_limite?: number; p_offset?: number }
        Returns: Json
      }
      get_vendas_em_aberto_weddings__nucleo: {
        Args: { p_limite?: number; p_offset?: number }
        Returns: Json
      }
      get_vendas_prejuizo_weddings: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_vendas_prejuizo_weddings__nucleo: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_vendas_receita_negativa: {
        Args: { p_from?: string; p_setor?: string; p_to?: string }
        Returns: Json
      }
      get_vendas_receita_negativa__nucleo: {
        Args: { p_from?: string; p_setor?: string; p_to?: string }
        Returns: Json
      }
      get_weddings_historico_subsetor: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_weddings_historico_subsetor__nucleo: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      importar_clientes_corp: { Args: { p_linhas: Json }; Returns: Json }
      inserir_cliente_corp: { Args: { p_dados: Json }; Returns: Json }
      inserir_lote_demonstrativo_competencia: {
        Args: { p_linhas: Json }
        Returns: undefined
      }
      inserir_lote_lancamentos: { Args: { p_linhas: Json }; Returns: number }
      inserir_lote_lancamentos_movimentacao: {
        Args: { p_linhas: Json }
        Returns: undefined
      }
      inserir_lote_raw: { Args: { p_linhas: Json }; Returns: undefined }
      inserir_lote_staging: { Args: { p_linhas: Json }; Returns: undefined }
      inserir_lote_staging_pessoas: {
        Args: { p_linhas: Json }
        Returns: undefined
      }
      inserir_lote_titulos_em_aberto: {
        Args: { p_linhas: Json }
        Returns: undefined
      }
      inserir_metas: { Args: { p_metas: Json }; Returns: undefined }
      limpar_staging_pessoas: { Args: never; Returns: undefined }
      limpar_staging_vendas: { Args: never; Returns: undefined }
      listar_clientes_corp: { Args: never; Returns: Json }
      marcar_onboarding_visto: { Args: never; Returns: undefined }
      marcar_senha_trocada: { Args: never; Returns: undefined }
      metas_listar: { Args: { p_ano: number }; Returns: Json }
      metas_ritmo_diario: {
        Args: { p_from: string; p_setor?: string; p_to: string }
        Returns: Json
      }
      metas_upsert: { Args: { p_metas: Json }; Returns: Json }
      monde_comparacao_mensal: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      monde_ingest_claim: {
        Args: { p_dono?: string; p_ttl_segundos?: number }
        Returns: boolean
      }
      monde_ingest_control_get: { Args: { p_chave: string }; Returns: string }
      monde_ingest_control_set: {
        Args: { p_chave: string; p_valor: string }
        Returns: undefined
      }
      monde_ingest_limpar_staging: { Args: never; Returns: undefined }
      monde_ingest_lote: { Args: { p_vendas: Json }; Returns: undefined }
      monde_ingest_promover: { Args: never; Returns: Json }
      monde_ingest_release: { Args: { p_dono: string }; Returns: boolean }
      monde_ingest_remover_vendas: {
        Args: {
          p_espelhaveis_ids: string[]
          p_from: string
          p_teto: number
          p_to: string
        }
        Returns: Json
      }
      monde_ingest_status: { Args: never; Returns: Json }
      monde_refresh_mv: { Args: never; Returns: undefined }
      monde_vendas_ausentes: {
        Args: { p_from: string; p_numeros: string[]; p_to: string }
        Returns: Json
      }
      nota_existentes: { Args: { p_refs: string[] }; Returns: Json }
      onboarding_visto: { Args: never; Returns: boolean }
      patrimonio_atualizar_ativo: {
        Args: {
          p_area_destino_id?: number
          p_categoria_id: number
          p_codigo?: string
          p_data_aquisicao?: string
          p_descricao: string
          p_detentor_destino_id?: number
          p_estado_conservacao?: string
          p_fornecedor?: string
          p_id: number
          p_nota_fiscal?: string
          p_numero_serie?: string
          p_obs?: string
          p_valor_aquisicao?: number
        }
        Returns: Json
      }
      patrimonio_atualizar_obs_movimentacao: {
        Args: { p_id: number; p_obs: string }
        Returns: Json
      }
      patrimonio_catalogos: { Args: never; Returns: Json }
      patrimonio_criar_ativo: {
        Args: {
          p_area_destino_id: number
          p_categoria_id: number
          p_codigo?: string
          p_data_aquisicao?: string
          p_data_movimentacao?: string
          p_descricao: string
          p_detentor_destino_id?: number
          p_estado_conservacao?: string
          p_fornecedor?: string
          p_nota_fiscal?: string
          p_numero_serie?: string
          p_obs?: string
          p_obs_movimentacao?: string
          p_valor_aquisicao?: number
        }
        Returns: Json
      }
      patrimonio_detalhe_ativo: { Args: { p_ativo_id: number }; Returns: Json }
      patrimonio_listar_ativos: {
        Args: {
          p_area_id?: number
          p_busca?: string
          p_categoria_id?: number
          p_status?: string
        }
        Returns: Json
      }
      patrimonio_listar_movimentacoes: {
        Args: { p_busca?: string; p_limite?: number; p_tipo?: string }
        Returns: Json
      }
      patrimonio_registrar_movimentacao: {
        Args: {
          p_area_destino_id?: number
          p_ativo_id: number
          p_data_movimentacao?: string
          p_destino_texto?: string
          p_detentor_destino_id?: number
          p_motivo_baixa?: string
          p_obs?: string
          p_tipo: string
        }
        Returns: Json
      }
      patrimonio_resumo: { Args: never; Returns: Json }
      patrimonio_upsert_detentor: { Args: { p_nome: string }; Returns: Json }
      promover_carga_pessoas: { Args: never; Returns: Json }
      promover_carga_vendas: { Args: never; Returns: Json }
      provisionar_dre_comp_par: { Args: never; Returns: Json }
      rbac_verificar_guard: { Args: { p_area?: string }; Returns: string }
      refresh_all_materialized_views: { Args: never; Returns: undefined }
      regenerar_dim_operacao_weddings: { Args: never; Returns: number }
      regenerar_fluxo_caixa: { Args: never; Returns: Json }
      registrar_email: { Args: { p_dados: Json }; Returns: Json }
      registrar_emissao: { Args: { p_dados: Json }; Returns: Json }
      registrar_ingestao_log: {
        Args: {
          p_erro?: string
          p_fonte: string
          p_registros?: number
          p_status: string
        }
        Returns: undefined
      }
      registrar_nota: { Args: { p_dados: Json }; Returns: Json }
      reordenar_gerencial_contas: {
        Args: { p_contas: string[] }
        Returns: boolean
      }
      resultado_boletos: { Args: { p_refs: string[] }; Returns: Json }
      resultado_notas: { Args: { p_refs: string[] }; Returns: Json }
      solic_anexar: { Args: { p_anexos: Json; p_id: number }; Returns: Json }
      solic_anexo_excluir: { Args: { p_anexo_id: number }; Returns: Json }
      solic_anexo_path: { Args: { p_anexo_id: number }; Returns: Json }
      solic_aprovar: { Args: { p_id: number }; Returns: Json }
      solic_caixa: { Args: { p_escopo?: string }; Returns: Json }
      solic_cancelar: { Args: { p_id: number }; Returns: Json }
      solic_concluir: { Args: { p_id: number }; Returns: Json }
      solic_destinatarios: { Args: never; Returns: Json }
      solic_detalhe: { Args: { p_id: number }; Returns: Json }
      solic_emails_envolvidos: { Args: { p_id: number }; Returns: Json }
      solic_emails_envolvidos_svc: { Args: { p_id: number }; Returns: Json }
      solic_minhas: { Args: never; Returns: Json }
      solic_minhas_pendencias: { Args: never; Returns: number }
      solic_movimentacoes: { Args: never; Returns: Json }
      solic_promover_anexos: {
        Args: { p_de_para: Json; p_solicitacao_id: number }
        Returns: number
      }
      solic_rejeitar: {
        Args: { p_id: number; p_justificativa: string }
        Returns: Json
      }
      solic_tipos_abertura: { Args: never; Returns: Json }
      solic_tipos_api: { Args: { p_chave_id: number }; Returns: Json }
      solic_tipos_documentacao: { Args: never; Returns: Json }
      solicitar_acesso: {
        Args: { p_email: string; p_nome?: string }
        Returns: Json
      }
      solicitar_acesso_admin: {
        Args: { p_email: string; p_nome?: string }
        Returns: Json
      }
      status_demonstrativo_competencia: { Args: never; Returns: Json }
      status_lancamentos_movimentacao: { Args: never; Returns: Json }
      status_pessoas: { Args: never; Returns: Json }
      status_titulos_em_aberto: { Args: never; Returns: Json }
      transform_raw_to_analytics: { Args: never; Returns: Json }
      truncar_demonstrativo_competencia: { Args: never; Returns: undefined }
      truncar_lancamentos: { Args: never; Returns: undefined }
      truncar_lancamentos_movimentacao: { Args: never; Returns: undefined }
      truncar_titulos_em_aberto: { Args: never; Returns: undefined }
      truncate_dynamic_tables: { Args: never; Returns: undefined }
      update_gerencial_conta: {
        Args: { p_conta: string; p_updates: Json }
        Returns: boolean
      }
      update_gerencial_lancamento:
        | { Args: { p_id: number; p_updates: Json }; Returns: boolean }
        | {
            Args: {
              p_esperado_atualizado_em: string
              p_id: number
              p_updates: Json
            }
            Returns: boolean
          }
      update_gerencial_saldo:
        | { Args: { p_conta: string; p_saldo: number }; Returns: boolean }
        | {
            Args: { p_conta: string; p_data_saldo: string; p_saldo: number }
            Returns: boolean
          }
      validar_carga_pessoas: { Args: never; Returns: Json }
      validar_carga_staging: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
