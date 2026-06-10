-- ---------------------------------------------------------------------------
-- 0121 — feat(v4.13/M1): guards de área nas RPCs de LEITURA (ADR-0108, camada 3).
--
-- Padrão por função: a original é RENOMEADA para <fn>__nucleo (EXECUTE apenas
-- service_role) e o nome público vira um wrapper SECURITY DEFINER de MESMA
-- assinatura (args, defaults e retorno idênticos — a main e o app continuam
-- chamando o mesmo nome) que executa app.exigir_acesso(<áreas>) e delega.
--
-- Comportamento (ADR-0108): service_role/postgres → passa; anon → passa com
-- enforcement OFF (janela de compatibilidade da main, S5) e leva 42501 com ON;
-- usuário autenticado → SEMPRE validado (ativo + permissão de área).
--
-- Arquivo GERADO a partir das assinaturas vivas (pg_get_function_arguments) +
-- mapa de áreas; revisado manualmente. Não toca no corpo de nenhuma função.
-- ---------------------------------------------------------------------------

-- get_acumulado_weddings → ARRAY['performance/weddings']
ALTER FUNCTION public.get_acumulado_weddings(integer, integer) RENAME TO get_acumulado_weddings__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_acumulado_weddings__nucleo(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_acumulado_weddings__nucleo(integer, integer) TO service_role;
CREATE FUNCTION public.get_acumulado_weddings(p_meses_passados integer DEFAULT 24, p_meses_futuros integer DEFAULT 18)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);
  RETURN public.get_acumulado_weddings__nucleo(p_meses_passados, p_meses_futuros);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_acumulado_weddings(integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_acumulado_weddings(integer, integer) TO anon, authenticated, service_role;

-- get_acumulado_weddings → ARRAY['performance/weddings']
ALTER FUNCTION public.get_acumulado_weddings(integer, integer, text) RENAME TO get_acumulado_weddings__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_acumulado_weddings__nucleo(integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_acumulado_weddings__nucleo(integer, integer, text) TO service_role;
CREATE FUNCTION public.get_acumulado_weddings(p_meses_passados integer DEFAULT 24, p_meses_futuros integer DEFAULT 18, p_operacao text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);
  RETURN public.get_acumulado_weddings__nucleo(p_meses_passados, p_meses_futuros, p_operacao);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_acumulado_weddings(integer, integer, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_acumulado_weddings(integer, integer, text) TO anon, authenticated, service_role;

-- get_cagr → ARRAY['executiva','performance']
ALTER FUNCTION public.get_cagr() RENAME TO get_cagr__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_cagr__nucleo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_cagr__nucleo() TO service_role;
CREATE FUNCTION public.get_cagr()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['executiva','performance']);
  RETURN public.get_cagr__nucleo();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_cagr() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_cagr() TO anon, authenticated, service_role;

-- get_calendario_liquidez → ARRAY['financeiro/fluxo-caixa']
ALTER FUNCTION public.get_calendario_liquidez(date) RENAME TO get_calendario_liquidez__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_calendario_liquidez__nucleo(date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_calendario_liquidez__nucleo(date) TO service_role;
CREATE FUNCTION public.get_calendario_liquidez(p_mes_referencia date)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa']);
  RETURN public.get_calendario_liquidez__nucleo(p_mes_referencia);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_calendario_liquidez(date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_calendario_liquidez(date) TO anon, authenticated, service_role;

-- get_carteira_weddings → ARRAY['performance/weddings']
ALTER FUNCTION public.get_carteira_weddings(text) RENAME TO get_carteira_weddings__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_carteira_weddings__nucleo(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_carteira_weddings__nucleo(text) TO service_role;
CREATE FUNCTION public.get_carteira_weddings(p_metric text DEFAULT 'casamentos'::text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);
  RETURN public.get_carteira_weddings__nucleo(p_metric);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_carteira_weddings(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_carteira_weddings(text) TO anon, authenticated, service_role;

-- get_dashboard_config → qualquer usuário logado
ALTER FUNCTION public.get_dashboard_config() RENAME TO get_dashboard_config__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_config__nucleo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_dashboard_config__nucleo() TO service_role;
CREATE FUNCTION public.get_dashboard_config()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso();
  RETURN public.get_dashboard_config__nucleo();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_config() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_dashboard_config() TO anon, authenticated, service_role;

-- get_decomposicao_categoria → ARRAY['executiva']
ALTER FUNCTION public.get_decomposicao_categoria(text, text, text) RENAME TO get_decomposicao_categoria__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_decomposicao_categoria__nucleo(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_decomposicao_categoria__nucleo(text, text, text) TO service_role;
CREATE FUNCTION public.get_decomposicao_categoria(p_from text, p_to text, p_grupo text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['executiva']);
  RETURN public.get_decomposicao_categoria__nucleo(p_from, p_to, p_grupo);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_decomposicao_categoria(text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_decomposicao_categoria(text, text, text) TO anon, authenticated, service_role;

-- get_decomposicao_grupo → ARRAY['executiva']
ALTER FUNCTION public.get_decomposicao_grupo(text, text) RENAME TO get_decomposicao_grupo__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_decomposicao_grupo__nucleo(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_decomposicao_grupo__nucleo(text, text) TO service_role;
CREATE FUNCTION public.get_decomposicao_grupo(p_from text, p_to text)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['executiva']);
  RETURN public.get_decomposicao_grupo__nucleo(p_from, p_to);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_decomposicao_grupo(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_decomposicao_grupo(text, text) TO anon, authenticated, service_role;

-- get_decomposicao_variacao → ARRAY['executiva'] || app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_decomposicao_variacao(date, date, date, date, text) RENAME TO get_decomposicao_variacao__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_decomposicao_variacao__nucleo(date, date, date, date, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_decomposicao_variacao__nucleo(date, date, date, date, text) TO service_role;
CREATE FUNCTION public.get_decomposicao_variacao(p_from date, p_to date, p_ant_from date, p_ant_to date, p_setor text DEFAULT 'todos'::text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['executiva'] || app.areas_do_setor(p_setor));
  RETURN public.get_decomposicao_variacao__nucleo(p_from, p_to, p_ant_from, p_ant_to, p_setor);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_decomposicao_variacao(date, date, date, date, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_decomposicao_variacao(date, date, date, date, text) TO anon, authenticated, service_role;

-- get_executiva_kpis → app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_executiva_kpis(date, date, text, date, date, date, date) RENAME TO get_executiva_kpis__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_executiva_kpis__nucleo(date, date, text, date, date, date, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_executiva_kpis__nucleo(date, date, text, date, date, date, date) TO service_role;
CREATE FUNCTION public.get_executiva_kpis(p_from date, p_to date, p_setor text DEFAULT 'todos'::text, p_ant_from date DEFAULT NULL::date, p_ant_to date DEFAULT NULL::date, p_yoy_from date DEFAULT NULL::date, p_yoy_to date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(app.areas_do_setor(p_setor));
  RETURN public.get_executiva_kpis__nucleo(p_from, p_to, p_setor, p_ant_from, p_ant_to, p_yoy_from, p_yoy_to);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_executiva_kpis(date, date, text, date, date, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_executiva_kpis(date, date, text, date, date, date, date) TO anon, authenticated, service_role;

-- get_fluxo_caixa_acumulado_v1 → ARRAY['financeiro/fluxo-caixa']
ALTER FUNCTION public.get_fluxo_caixa_acumulado_v1() RENAME TO get_fluxo_caixa_acumulado_v1__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_acumulado_v1__nucleo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_acumulado_v1__nucleo() TO service_role;
CREATE FUNCTION public.get_fluxo_caixa_acumulado_v1()
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa']);
  RETURN public.get_fluxo_caixa_acumulado_v1__nucleo();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_acumulado_v1() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_acumulado_v1() TO anon, authenticated, service_role;

-- get_fluxo_caixa_kpis_b → ARRAY['financeiro/fluxo-caixa']
ALTER FUNCTION public.get_fluxo_caixa_kpis_b(text, text) RENAME TO get_fluxo_caixa_kpis_b__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_kpis_b__nucleo(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_kpis_b__nucleo(text, text) TO service_role;
CREATE FUNCTION public.get_fluxo_caixa_kpis_b(p_from text, p_to text)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa']);
  RETURN public.get_fluxo_caixa_kpis_b__nucleo(p_from, p_to);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_kpis_b(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_kpis_b(text, text) TO anon, authenticated, service_role;

-- get_fluxo_caixa_kpis_diario → ARRAY['financeiro/fluxo-caixa']
ALTER FUNCTION public.get_fluxo_caixa_kpis_diario() RENAME TO get_fluxo_caixa_kpis_diario__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_kpis_diario__nucleo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_kpis_diario__nucleo() TO service_role;
CREATE FUNCTION public.get_fluxo_caixa_kpis_diario()
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa']);
  RETURN public.get_fluxo_caixa_kpis_diario__nucleo();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_kpis_diario() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_kpis_diario() TO anon, authenticated, service_role;

-- get_fluxo_caixa_mensal_v3 → ARRAY['financeiro/fluxo-caixa']
ALTER FUNCTION public.get_fluxo_caixa_mensal_v3() RENAME TO get_fluxo_caixa_mensal_v3__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_mensal_v3__nucleo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_mensal_v3__nucleo() TO service_role;
CREATE FUNCTION public.get_fluxo_caixa_mensal_v3()
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa']);
  RETURN public.get_fluxo_caixa_mensal_v3__nucleo();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_mensal_v3() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_mensal_v3() TO anon, authenticated, service_role;

-- get_gerencial_lancamentos → ARRAY['financeiro/gerencial']
ALTER FUNCTION public.get_gerencial_lancamentos(integer) RENAME TO get_gerencial_lancamentos__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_gerencial_lancamentos__nucleo(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_lancamentos__nucleo(integer) TO service_role;
CREATE FUNCTION public.get_gerencial_lancamentos(p_limit integer DEFAULT 1000)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN public.get_gerencial_lancamentos__nucleo(p_limit);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_gerencial_lancamentos(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_lancamentos(integer) TO anon, authenticated, service_role;

-- get_gerencial_lancamentos_planilha → ARRAY['financeiro/gerencial']
ALTER FUNCTION public.get_gerencial_lancamentos_planilha() RENAME TO get_gerencial_lancamentos_planilha__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_gerencial_lancamentos_planilha__nucleo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_lancamentos_planilha__nucleo() TO service_role;
CREATE FUNCTION public.get_gerencial_lancamentos_planilha()
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN public.get_gerencial_lancamentos_planilha__nucleo();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_gerencial_lancamentos_planilha() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_lancamentos_planilha() TO anon, authenticated, service_role;

-- get_gerencial_projecao_diaria → ARRAY['financeiro/gerencial']
ALTER FUNCTION public.get_gerencial_projecao_diaria(integer) RENAME TO get_gerencial_projecao_diaria__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_gerencial_projecao_diaria__nucleo(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_projecao_diaria__nucleo(integer) TO service_role;
CREATE FUNCTION public.get_gerencial_projecao_diaria(p_dias integer DEFAULT 90)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN public.get_gerencial_projecao_diaria__nucleo(p_dias);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_gerencial_projecao_diaria(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_projecao_diaria(integer) TO anon, authenticated, service_role;

-- get_gerencial_saldos → ARRAY['financeiro/gerencial']
ALTER FUNCTION public.get_gerencial_saldos() RENAME TO get_gerencial_saldos__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_gerencial_saldos__nucleo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_saldos__nucleo() TO service_role;
CREATE FUNCTION public.get_gerencial_saldos()
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN public.get_gerencial_saldos__nucleo();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_gerencial_saldos() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_saldos() TO anon, authenticated, service_role;

-- get_historico_12m_setores → ARRAY['executiva'] || app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_historico_12m_setores(text) RENAME TO get_historico_12m_setores__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_historico_12m_setores__nucleo(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_historico_12m_setores__nucleo(text) TO service_role;
CREATE FUNCTION public.get_historico_12m_setores(p_setor text DEFAULT 'todos'::text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['executiva'] || app.areas_do_setor(p_setor));
  RETURN public.get_historico_12m_setores__nucleo(p_setor);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_historico_12m_setores(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_historico_12m_setores(text) TO anon, authenticated, service_role;

-- get_historico_mensal → ARRAY['metas','executiva'] || app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_historico_mensal(text) RENAME TO get_historico_mensal__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_historico_mensal__nucleo(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_historico_mensal__nucleo(text) TO service_role;
CREATE FUNCTION public.get_historico_mensal(p_setor text DEFAULT 'todos'::text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas','executiva'] || app.areas_do_setor(p_setor));
  RETURN public.get_historico_mensal__nucleo(p_setor);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_historico_mensal(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_historico_mensal(text) TO anon, authenticated, service_role;

-- get_kpis → ARRAY['metas','executiva'] || app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_kpis(integer, integer, text) RENAME TO get_kpis__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_kpis__nucleo(integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_kpis__nucleo(integer, integer, text) TO service_role;
CREATE FUNCTION public.get_kpis(p_ano integer, p_mes integer, p_setor text DEFAULT 'todos'::text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas','executiva'] || app.areas_do_setor(p_setor));
  RETURN public.get_kpis__nucleo(p_ano, p_mes, p_setor);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_kpis(integer, integer, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_kpis(integer, integer, text) TO anon, authenticated, service_role;

-- get_lancamentos_do_dia → ARRAY['financeiro/fluxo-caixa']
ALTER FUNCTION public.get_lancamentos_do_dia(date) RENAME TO get_lancamentos_do_dia__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_lancamentos_do_dia__nucleo(date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_lancamentos_do_dia__nucleo(date) TO service_role;
CREATE FUNCTION public.get_lancamentos_do_dia(p_data date)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa']);
  RETURN public.get_lancamentos_do_dia__nucleo(p_data);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_lancamentos_do_dia(date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_lancamentos_do_dia(date) TO anon, authenticated, service_role;

-- get_mix_produto → app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_mix_produto(date, date, text, integer) RENAME TO get_mix_produto__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_mix_produto__nucleo(date, date, text, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_mix_produto__nucleo(date, date, text, integer) TO service_role;
CREATE FUNCTION public.get_mix_produto(p_from date, p_to date, p_setor text DEFAULT 'todos'::text, p_limite integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(app.areas_do_setor(p_setor));
  RETURN public.get_mix_produto__nucleo(p_from, p_to, p_setor, p_limite);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_mix_produto(date, date, text, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_mix_produto(date, date, text, integer) TO anon, authenticated, service_role;

-- get_mix_setor → app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_mix_setor(date, date, text) RENAME TO get_mix_setor__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_mix_setor__nucleo(date, date, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_mix_setor__nucleo(date, date, text) TO service_role;
CREATE FUNCTION public.get_mix_setor(p_from date, p_to date, p_setor text DEFAULT 'todos'::text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(app.areas_do_setor(p_setor));
  RETURN public.get_mix_setor__nucleo(p_from, p_to, p_setor);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_mix_setor(date, date, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_mix_setor(date, date, text) TO anon, authenticated, service_role;

-- get_operacao_weddings → ARRAY['performance/weddings']
ALTER FUNCTION public.get_operacao_weddings(text) RENAME TO get_operacao_weddings__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_operacao_weddings__nucleo(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_operacao_weddings__nucleo(text) TO service_role;
CREATE FUNCTION public.get_operacao_weddings(p_operacao text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);
  RETURN public.get_operacao_weddings__nucleo(p_operacao);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_operacao_weddings(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_operacao_weddings(text) TO anon, authenticated, service_role;

-- get_operacoes_lista_weddings → ARRAY['performance/weddings']
ALTER FUNCTION public.get_operacoes_lista_weddings() RENAME TO get_operacoes_lista_weddings__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_operacoes_lista_weddings__nucleo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_operacoes_lista_weddings__nucleo() TO service_role;
CREATE FUNCTION public.get_operacoes_lista_weddings()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);
  RETURN public.get_operacoes_lista_weddings__nucleo();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_operacoes_lista_weddings() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_operacoes_lista_weddings() TO anon, authenticated, service_role;

-- get_operacoes_weddings → ARRAY['performance/weddings']
ALTER FUNCTION public.get_operacoes_weddings(text, date, date, text, text, text, text, integer, integer) RENAME TO get_operacoes_weddings__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_operacoes_weddings__nucleo(text, date, date, text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_operacoes_weddings__nucleo(text, date, date, text, text, text, text, integer, integer) TO service_role;
CREATE FUNCTION public.get_operacoes_weddings(p_status text DEFAULT 'todos'::text, p_periodo_inicio date DEFAULT NULL::date, p_periodo_fim date DEFAULT NULL::date, p_subsetor text DEFAULT 'todos'::text, p_busca text DEFAULT NULL::text, p_ordenar_por text DEFAULT 'data_evento'::text, p_direcao text DEFAULT 'desc'::text, p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);
  RETURN public.get_operacoes_weddings__nucleo(p_status, p_periodo_inicio, p_periodo_fim, p_subsetor, p_busca, p_ordenar_por, p_direcao, p_pagina, p_por_pagina);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_operacoes_weddings(text, date, date, text, text, text, text, integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_operacoes_weddings(text, date, date, text, text, text, text, integer, integer) TO anon, authenticated, service_role;

-- get_pipeline_weddings → ARRAY['performance/weddings']
ALTER FUNCTION public.get_pipeline_weddings(integer) RENAME TO get_pipeline_weddings__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_pipeline_weddings__nucleo(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_pipeline_weddings__nucleo(integer) TO service_role;
CREATE FUNCTION public.get_pipeline_weddings(p_horizonte_meses integer DEFAULT 18)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);
  RETURN public.get_pipeline_weddings__nucleo(p_horizonte_meses);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_pipeline_weddings(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_pipeline_weddings(integer) TO anon, authenticated, service_role;

-- get_posicao_por_conta → ARRAY['financeiro/fluxo-caixa']
ALTER FUNCTION public.get_posicao_por_conta() RENAME TO get_posicao_por_conta__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_posicao_por_conta__nucleo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_posicao_por_conta__nucleo() TO service_role;
CREATE FUNCTION public.get_posicao_por_conta()
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa']);
  RETURN public.get_posicao_por_conta__nucleo();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_posicao_por_conta() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_posicao_por_conta() TO anon, authenticated, service_role;

-- get_prejuizos → app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_prejuizos(date, date, text, boolean) RENAME TO get_prejuizos__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_prejuizos__nucleo(date, date, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_prejuizos__nucleo(date, date, text, boolean) TO service_role;
CREATE FUNCTION public.get_prejuizos(p_from date, p_to date, p_setor text DEFAULT 'todos'::text, p_summary boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(app.areas_do_setor(p_setor));
  RETURN public.get_prejuizos__nucleo(p_from, p_to, p_setor, p_summary);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_prejuizos(date, date, text, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_prejuizos(date, date, text, boolean) TO anon, authenticated, service_role;

-- get_proximos_casamentos → ARRAY['performance/weddings']
ALTER FUNCTION public.get_proximos_casamentos(integer) RENAME TO get_proximos_casamentos__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_proximos_casamentos__nucleo(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_proximos_casamentos__nucleo(integer) TO service_role;
CREATE FUNCTION public.get_proximos_casamentos(p_horizonte_meses integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);
  RETURN public.get_proximos_casamentos__nucleo(p_horizonte_meses);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_proximos_casamentos(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_proximos_casamentos(integer) TO anon, authenticated, service_role;

-- get_proximos_lancamentos → ARRAY['financeiro/fluxo-caixa']
ALTER FUNCTION public.get_proximos_lancamentos(integer, text) RENAME TO get_proximos_lancamentos__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_proximos_lancamentos__nucleo(integer, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_proximos_lancamentos__nucleo(integer, text) TO service_role;
CREATE FUNCTION public.get_proximos_lancamentos(p_dias integer DEFAULT 10, p_tipo text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa']);
  RETURN public.get_proximos_lancamentos__nucleo(p_dias, p_tipo);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_proximos_lancamentos(integer, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_proximos_lancamentos(integer, text) TO anon, authenticated, service_role;

-- get_ranking_produtos → ARRAY['metas','executiva'] || app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_ranking_produtos(integer, integer, text, integer) RENAME TO get_ranking_produtos__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_ranking_produtos__nucleo(integer, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_ranking_produtos__nucleo(integer, integer, text, integer) TO service_role;
CREATE FUNCTION public.get_ranking_produtos(p_ano integer, p_mes integer, p_setor text DEFAULT 'todos'::text, p_limite integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas','executiva'] || app.areas_do_setor(p_setor));
  RETURN public.get_ranking_produtos__nucleo(p_ano, p_mes, p_setor, p_limite);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_ranking_produtos(integer, integer, text, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_ranking_produtos(integer, integer, text, integer) TO anon, authenticated, service_role;

-- get_ranking_vendedores → ARRAY['metas','executiva'] || app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_ranking_vendedores(integer, integer, text, integer) RENAME TO get_ranking_vendedores__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_ranking_vendedores__nucleo(integer, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_ranking_vendedores__nucleo(integer, integer, text, integer) TO service_role;
CREATE FUNCTION public.get_ranking_vendedores(p_ano integer, p_mes integer, p_setor text DEFAULT 'todos'::text, p_limite integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas','executiva'] || app.areas_do_setor(p_setor));
  RETURN public.get_ranking_vendedores__nucleo(p_ano, p_mes, p_setor, p_limite);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_ranking_vendedores(integer, integer, text, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_ranking_vendedores(integer, integer, text, integer) TO anon, authenticated, service_role;

-- get_ranking_vendedores_range → app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_ranking_vendedores_range(date, date, text, integer) RENAME TO get_ranking_vendedores_range__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_ranking_vendedores_range__nucleo(date, date, text, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_ranking_vendedores_range__nucleo(date, date, text, integer) TO service_role;
CREATE FUNCTION public.get_ranking_vendedores_range(p_from date, p_to date, p_setor text DEFAULT 'todos'::text, p_limite integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(app.areas_do_setor(p_setor));
  RETURN public.get_ranking_vendedores_range__nucleo(p_from, p_to, p_setor, p_limite);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_ranking_vendedores_range(date, date, text, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_ranking_vendedores_range(date, date, text, integer) TO anon, authenticated, service_role;

-- get_ritmo_diario → ARRAY['metas','executiva'] || app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_ritmo_diario(integer, integer, text) RENAME TO get_ritmo_diario__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_ritmo_diario__nucleo(integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_ritmo_diario__nucleo(integer, integer, text) TO service_role;
CREATE FUNCTION public.get_ritmo_diario(p_ano integer, p_mes integer, p_setor text DEFAULT 'todos'::text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas','executiva'] || app.areas_do_setor(p_setor));
  RETURN public.get_ritmo_diario__nucleo(p_ano, p_mes, p_setor);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_ritmo_diario(integer, integer, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_ritmo_diario(integer, integer, text) TO anon, authenticated, service_role;

-- get_setores_macro → qualquer usuário logado
ALTER FUNCTION public.get_setores_macro() RENAME TO get_setores_macro__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_setores_macro__nucleo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_setores_macro__nucleo() TO service_role;
CREATE FUNCTION public.get_setores_macro()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso();
  RETURN public.get_setores_macro__nucleo();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_setores_macro() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_setores_macro() TO anon, authenticated, service_role;

-- get_sumario_subsetor → ARRAY['performance/weddings']
ALTER FUNCTION public.get_sumario_subsetor(date, date) RENAME TO get_sumario_subsetor__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_sumario_subsetor__nucleo(date, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_sumario_subsetor__nucleo(date, date) TO service_role;
CREATE FUNCTION public.get_sumario_subsetor(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);
  RETURN public.get_sumario_subsetor__nucleo(p_from, p_to);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_sumario_subsetor(date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_sumario_subsetor(date, date) TO anon, authenticated, service_role;

-- get_tendencia_margem → app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_tendencia_margem(date, date, text) RENAME TO get_tendencia_margem__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_tendencia_margem__nucleo(date, date, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_tendencia_margem__nucleo(date, date, text) TO service_role;
CREATE FUNCTION public.get_tendencia_margem(p_from date, p_to date, p_setor text DEFAULT 'todos'::text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(app.areas_do_setor(p_setor));
  RETURN public.get_tendencia_margem__nucleo(p_from, p_to, p_setor);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_tendencia_margem(date, date, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_tendencia_margem(date, date, text) TO anon, authenticated, service_role;

-- get_vendas_em_aberto → app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_vendas_em_aberto(text, integer, integer) RENAME TO get_vendas_em_aberto__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_vendas_em_aberto__nucleo(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_vendas_em_aberto__nucleo(text, integer, integer) TO service_role;
CREATE FUNCTION public.get_vendas_em_aberto(p_setor text DEFAULT 'todos'::text, p_limite integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(app.areas_do_setor(p_setor));
  RETURN public.get_vendas_em_aberto__nucleo(p_setor, p_limite, p_offset);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_vendas_em_aberto(text, integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_vendas_em_aberto(text, integer, integer) TO anon, authenticated, service_role;

-- get_vendas_em_aberto_weddings → ARRAY['performance/weddings']
ALTER FUNCTION public.get_vendas_em_aberto_weddings(integer, integer) RENAME TO get_vendas_em_aberto_weddings__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_vendas_em_aberto_weddings__nucleo(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_vendas_em_aberto_weddings__nucleo(integer, integer) TO service_role;
CREATE FUNCTION public.get_vendas_em_aberto_weddings(p_limite integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);
  RETURN public.get_vendas_em_aberto_weddings__nucleo(p_limite, p_offset);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_vendas_em_aberto_weddings(integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_vendas_em_aberto_weddings(integer, integer) TO anon, authenticated, service_role;

-- get_vendas_prejuizo_weddings → ARRAY['performance/weddings']
ALTER FUNCTION public.get_vendas_prejuizo_weddings(date, date) RENAME TO get_vendas_prejuizo_weddings__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_vendas_prejuizo_weddings__nucleo(date, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_vendas_prejuizo_weddings__nucleo(date, date) TO service_role;
CREATE FUNCTION public.get_vendas_prejuizo_weddings(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);
  RETURN public.get_vendas_prejuizo_weddings__nucleo(p_from, p_to);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_vendas_prejuizo_weddings(date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_vendas_prejuizo_weddings(date, date) TO anon, authenticated, service_role;

-- get_vendas_receita_negativa → app.areas_do_setor(p_setor)
ALTER FUNCTION public.get_vendas_receita_negativa(text, date, date) RENAME TO get_vendas_receita_negativa__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_vendas_receita_negativa__nucleo(text, date, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_vendas_receita_negativa__nucleo(text, date, date) TO service_role;
CREATE FUNCTION public.get_vendas_receita_negativa(p_setor text DEFAULT 'todos'::text, p_from date DEFAULT '2020-01-01'::date, p_to date DEFAULT '2099-12-31'::date)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(app.areas_do_setor(p_setor));
  RETURN public.get_vendas_receita_negativa__nucleo(p_setor, p_from, p_to);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_vendas_receita_negativa(text, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_vendas_receita_negativa(text, date, date) TO anon, authenticated, service_role;

-- get_weddings_historico_subsetor → ARRAY['performance/weddings']
ALTER FUNCTION public.get_weddings_historico_subsetor(date, date) RENAME TO get_weddings_historico_subsetor__nucleo;
REVOKE EXECUTE ON FUNCTION public.get_weddings_historico_subsetor__nucleo(date, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_weddings_historico_subsetor__nucleo(date, date) TO service_role;
CREATE FUNCTION public.get_weddings_historico_subsetor(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);
  RETURN public.get_weddings_historico_subsetor__nucleo(p_from, p_to);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_weddings_historico_subsetor(date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_weddings_historico_subsetor(date, date) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
