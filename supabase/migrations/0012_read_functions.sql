-- Funções de leitura para os Route Handlers da M3.
-- Todas no schema public, acessíveis ao anon — dados públicos do dashboard.
-- SECURITY DEFINER para acessar analytics e app sem expor esses schemas via REST.

-- ---------------------------------------------------------------------------
-- 1. get_setores_macro()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_setores_macro()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',           id,
      'nome',         nome,
      'display_nome', display_nome,
      'cor_hex',      cor_hex,
      'ordem',        ordem
    )
    ORDER BY ordem
  )
  FROM analytics.dim_setor_macro;
$$;

REVOKE EXECUTE ON FUNCTION public.get_setores_macro() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_setores_macro() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. get_kpis(p_ano, p_mes, p_setor)
--    KPIs do mês: realizado, meta, % atingimento, projeção, YoY
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_kpis(
  p_ano   int,
  p_mes   int,
  p_setor text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_realizado   numeric := 0;
  v_receitas    numeric := 0;
  v_vendas      int     := 0;
  v_meta        numeric := 0;
  v_ant         numeric := 0;
  v_du_passados int     := 0;
  v_du_total    int     := 1;
  v_projecao    numeric;
BEGIN
  -- Realizado do mês
  SELECT
    COALESCE(SUM(vm.valor_total), 0),
    COALESCE(SUM(vm.receitas), 0),
    COALESCE(SUM(vm.vendas_count)::int, 0)
  INTO v_realizado, v_receitas, v_vendas
  FROM analytics.mv_vendas_mensais vm
  JOIN analytics.dim_setor_macro dsm ON dsm.id = vm.setor_macro_id
  WHERE vm.ano = p_ano AND vm.mes = p_mes
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  -- Meta do mês
  SELECT COALESCE(SUM(ms.valor_meta), 0)
  INTO v_meta
  FROM app.meta_setor ms
  JOIN analytics.dim_setor_macro dsm ON dsm.id = ms.setor_macro_id
  WHERE ms.ano = p_ano AND ms.mes = p_mes
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  -- Mesmo mês, ano anterior
  SELECT COALESCE(SUM(vm.valor_total), 0)
  INTO v_ant
  FROM analytics.mv_vendas_mensais vm
  JOIN analytics.dim_setor_macro dsm ON dsm.id = vm.setor_macro_id
  WHERE vm.ano = p_ano - 1 AND vm.mes = p_mes
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  -- Projeção: só para o mês corrente
  IF p_ano = EXTRACT(YEAR  FROM CURRENT_DATE)::int
 AND p_mes = EXTRACT(MONTH FROM CURRENT_DATE)::int
  THEN
    SELECT COUNT(*)
    INTO v_du_passados
    FROM analytics.dim_data
    WHERE ano = p_ano AND mes = p_mes
      AND dia_util = true
      AND data <= CURRENT_DATE;

    SELECT COALESCE(MAX(dias_uteis_no_mes), 1)
    INTO v_du_total
    FROM analytics.dim_data
    WHERE ano = p_ano AND mes = p_mes;

    IF v_du_passados > 0 THEN
      v_projecao := ROUND((v_realizado * v_du_total / v_du_passados)::numeric, 2);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'valor_realizado',     v_realizado,
    'receitas_realizadas', v_receitas,
    'vendas_count',        v_vendas,
    'valor_meta',          v_meta,
    'pct_atingimento',     CASE WHEN v_meta > 0
                             THEN ROUND((v_realizado / v_meta * 100)::numeric, 1)
                             ELSE NULL END,
    'projecao_fim_mes',    v_projecao,
    'valor_ano_anterior',  v_ant
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_kpis(int, int, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_kpis(int, int, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. get_ritmo_diario(p_ano, p_mes, p_setor)
--    Um item por dia do mês: valor diário, acumulado e meta acumulada
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ritmo_diario(
  p_ano   int,
  p_mes   int,
  p_setor text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meta_mes numeric := 0;
  v_du_total int     := 1;
  v_result   jsonb;
BEGIN
  SELECT COALESCE(SUM(ms.valor_meta), 0)
  INTO v_meta_mes
  FROM app.meta_setor ms
  JOIN analytics.dim_setor_macro dsm ON dsm.id = ms.setor_macro_id
  WHERE ms.ano = p_ano AND ms.mes = p_mes
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  SELECT COALESCE(MAX(dias_uteis_no_mes), 1)
  INTO v_du_total
  FROM analytics.dim_data
  WHERE ano = p_ano AND mes = p_mes;

  WITH vendas_dia AS (
    SELECT
      vd.data_venda,
      SUM(vd.valor_total) AS valor_total,
      SUM(vd.receitas)    AS receitas
    FROM analytics.mv_vendas_diarias vd
    JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
    WHERE (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY vd.data_venda
  ),
  base AS (
    SELECT
      dd.data,
      dd.dia,
      dd.dia_util,
      COALESCE(v.valor_total, 0)                                                                    AS valor_dia,
      COALESCE(v.receitas,    0)                                                                    AS receitas_dia,
      SUM(COALESCE(v.valor_total, 0)) OVER (ORDER BY dd.data)                                       AS valor_acumulado,
      COALESCE(
        MAX(dd.dia_util_mes) OVER (ORDER BY dd.data ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
        0
      )                                                                                             AS du_acumulados
    FROM analytics.dim_data dd
    LEFT JOIN vendas_dia v ON v.data_venda = dd.data
    WHERE dd.ano = p_ano AND dd.mes = p_mes
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'data',            to_char(b.data, 'YYYY-MM-DD'),
      'dia',             b.dia,
      'dia_util',        b.dia_util,
      'valor_dia',       b.valor_dia,
      'receitas_dia',    b.receitas_dia,
      'valor_acumulado', b.valor_acumulado,
      'meta_acumulada',  ROUND((v_meta_mes * b.du_acumulados::numeric / v_du_total), 2)
    )
    ORDER BY b.data
  )
  INTO v_result
  FROM base b;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ritmo_diario(int, int, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_ritmo_diario(int, int, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. get_historico_mensal(p_setor)
--    Últimos 24 meses com realizado e meta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_historico_mensal(
  p_setor text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH month_series AS (
    SELECT
      EXTRACT(YEAR  FROM m)::int AS ano,
      EXTRACT(MONTH FROM m)::int AS mes
    FROM generate_series(
      date_trunc('month', CURRENT_DATE) - interval '23 months',
      date_trunc('month', CURRENT_DATE),
      '1 month'::interval
    ) m
  ),
  vendas_mes AS (
    SELECT
      vm.ano,
      vm.mes,
      SUM(vm.valor_total)        AS valor_total,
      SUM(vm.receitas)           AS receitas,
      SUM(vm.vendas_count)::int  AS vendas_count
    FROM analytics.mv_vendas_mensais vm
    JOIN analytics.dim_setor_macro dsm ON dsm.id = vm.setor_macro_id
    WHERE (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY vm.ano, vm.mes
  ),
  metas_mes AS (
    SELECT
      ms.ano,
      ms.mes,
      SUM(ms.valor_meta) AS valor_meta
    FROM app.meta_setor ms
    JOIN analytics.dim_setor_macro dsm ON dsm.id = ms.setor_macro_id
    WHERE (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY ms.ano, ms.mes
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'ano',          s.ano,
      'mes',          s.mes,
      'valor_total',  COALESCE(v.valor_total, 0),
      'receitas',     COALESCE(v.receitas, 0),
      'vendas_count', COALESCE(v.vendas_count, 0),
      'valor_meta',   COALESCE(m.valor_meta, 0)
    )
    ORDER BY s.ano, s.mes
  )
  INTO v_result
  FROM month_series s
  LEFT JOIN vendas_mes  v ON v.ano = s.ano AND v.mes = s.mes
  LEFT JOIN metas_mes   m ON m.ano = s.ano AND m.mes = s.mes;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_historico_mensal(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_historico_mensal(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. get_ranking_vendedores(p_ano, p_mes, p_setor, p_limite)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ranking_vendedores(
  p_ano    int,
  p_mes    int,
  p_setor  text DEFAULT 'todos',
  p_limite int  DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(r)
  INTO v_result
  FROM (
    SELECT
      rv.vendedor_id,
      dv.nome,
      SUM(rv.valor_total)        AS valor_total,
      SUM(rv.receitas)           AS receitas,
      SUM(rv.vendas_count)::int  AS vendas_count
    FROM analytics.mv_ranking_vendedores_mensal rv
    JOIN analytics.dim_vendedor    dv  ON dv.id  = rv.vendedor_id
    JOIN analytics.dim_setor_macro dsm ON dsm.id = rv.setor_macro_id
    WHERE rv.ano = p_ano AND rv.mes = p_mes
      AND (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY rv.vendedor_id, dv.nome
    ORDER BY SUM(rv.valor_total) DESC
    LIMIT p_limite
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ranking_vendedores(int, int, text, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_ranking_vendedores(int, int, text, int) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. get_ranking_produtos(p_ano, p_mes, p_setor, p_limite)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ranking_produtos(
  p_ano    int,
  p_mes    int,
  p_setor  text DEFAULT 'todos',
  p_limite int  DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(r)
  INTO v_result
  FROM (
    SELECT
      rp.produto_id,
      dp.nome,
      SUM(rp.valor_total)        AS valor_total,
      SUM(rp.receitas)           AS receitas,
      SUM(rp.vendas_count)::int  AS vendas_count
    FROM analytics.mv_ranking_produtos_mensal rp
    JOIN analytics.dim_produto     dp  ON dp.id  = rp.produto_id
    JOIN analytics.dim_setor_macro dsm ON dsm.id = rp.setor_macro_id
    WHERE rp.ano = p_ano AND rp.mes = p_mes
      AND (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY rp.produto_id, dp.nome
    ORDER BY SUM(rp.valor_total) DESC
    LIMIT p_limite
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ranking_produtos(int, int, text, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_ranking_produtos(int, int, text, int) TO anon, authenticated, service_role;
