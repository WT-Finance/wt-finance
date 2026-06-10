-- ---------------------------------------------------------------------------
-- 0122 — feat(v4.13/M1): revogação dura de EXECUTE em funções public (ADR-0108).
--
-- ACHADO CRÍTICO (recon v4.13): TODAS as 72 funções public tinham EXECUTE para
-- anon no banco vivo — incluindo truncate_dynamic_tables() e promover_carga_vendas().
-- Os "REVOKE ... FROM PUBLIC" das migrations nunca cobriram o grant automático dos
-- DEFAULT PRIVILEGES do Supabase para anon/authenticated. Qualquer pessoa com a
-- anon key (pública por design) podia apagar a base via PostgREST.
--
-- Esta migration:
--  1. CATCH-ALL: revoga anon/authenticated de TODA função public que não esteja
--     na allowlist explícita (wrappers guardados da 0121 + RPCs de auth/admin da
--     0119). Mutações, internas, __nucleo e qualquer função esquecida ficam
--     service_role-only. Idempotente; main não usa anon em nenhuma delas
--     (verificado: todas as escritas do app usam getAdminClient/service role).
--  2. Corrige os DEFAULT PRIVILEGES do role postgres no schema public: funções
--     FUTURAS não nascem mais executáveis por anon/authenticated — todo grant
--     passa a ser explícito (convenção registrada no CLAUDE.md).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  -- Funções que PERMANECEM chamáveis por anon (wrappers da 0121 — guard interno
  -- decide pela flag de enforcement) + o verificador de guard (não lê dados).
  allow_anon text[] := ARRAY[
    'rbac_verificar_guard',
    -- wrappers de leitura (0121):
    'get_acumulado_weddings', 'get_cagr', 'get_calendario_liquidez',
    'get_carteira_weddings', 'get_dashboard_config', 'get_decomposicao_categoria',
    'get_decomposicao_grupo', 'get_decomposicao_variacao', 'get_executiva_kpis',
    'get_fluxo_caixa_acumulado_v1', 'get_fluxo_caixa_kpis_b',
    'get_fluxo_caixa_kpis_diario', 'get_fluxo_caixa_mensal_v3',
    'get_gerencial_lancamentos', 'get_gerencial_lancamentos_planilha',
    'get_gerencial_projecao_diaria', 'get_gerencial_saldos',
    'get_historico_12m_setores', 'get_historico_mensal', 'get_kpis',
    'get_lancamentos_do_dia', 'get_mix_produto', 'get_mix_setor',
    'get_operacao_weddings', 'get_operacoes_lista_weddings', 'get_operacoes_weddings',
    'get_pipeline_weddings', 'get_posicao_por_conta', 'get_prejuizos',
    'get_proximos_casamentos', 'get_proximos_lancamentos', 'get_ranking_produtos',
    'get_ranking_vendedores', 'get_ranking_vendedores_range', 'get_ritmo_diario',
    'get_setores_macro', 'get_sumario_subsetor', 'get_tendencia_margem',
    'get_vendas_em_aberto', 'get_vendas_em_aberto_weddings',
    'get_vendas_prejuizo_weddings', 'get_vendas_receita_negativa',
    'get_weddings_historico_subsetor'
  ];
  -- Funções de usuário logado / administração (0119): authenticated, nunca anon.
  allow_authenticated_extra text[] := ARRAY[
    'get_minhas_permissoes',
    'admin_listar_areas', 'admin_listar_roles', 'admin_listar_usuarios',
    'admin_criar_role', 'admin_atualizar_role', 'admin_excluir_role',
    'admin_atribuir_role', 'admin_definir_usuario_ativo',
    'admin_registrar_usuario', 'admin_set_enforcement'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS fn, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.fn);
    IF NOT (r.proname = ANY (allow_anon)) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.fn);
    END IF;
    IF NOT (r.proname = ANY (allow_anon) OR r.proname = ANY (allow_authenticated_extra)) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.fn);
    END IF;
  END LOOP;
END;
$$;

-- Causa-raiz: funções futuras criadas pelo role postgres (migrations) deixam de
-- nascer executáveis por anon/authenticated. Grants passam a ser SEMPRE explícitos.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
