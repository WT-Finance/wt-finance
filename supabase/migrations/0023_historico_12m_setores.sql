-- ---------------------------------------------------------------------------
-- 0023 — get_historico_12m_setores
--
-- Versão ampliada do get_historico_12m que inclui breakdown por setor_macro
-- em cada mês. Usada pelo gráfico 12m quando setor='todos' para barras
-- empilhadas. Quando p_setor é um setor específico, os outros ficam em 0.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_historico_12m_setores(
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
  WITH
  months AS (
    SELECT date_trunc('month', CURRENT_DATE - (n || ' months')::interval)::date AS m_start
    FROM generate_series(11, 0, -1) AS n
  ),
  fv AS (
    SELECT
      vd.data_venda,
      vd.valor_total,
      vd.receitas,
      dsm.nome AS setor_nome
    FROM analytics.mv_vendas_diarias vd
    JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
    WHERE p_setor = 'todos' OR dsm.nome = p_setor
  ),
  agg AS (
    SELECT
      m.m_start,
      EXTRACT(year  FROM m.m_start)::int AS ano,
      EXTRACT(month FROM m.m_start)::int AS mes,
      COALESCE(SUM(CASE WHEN fv.setor_nome = 'Lazer'       THEN fv.valor_total END), 0)::numeric AS fat_lazer,
      COALESCE(SUM(CASE WHEN fv.setor_nome = 'Weddings'    THEN fv.valor_total END), 0)::numeric AS fat_weddings,
      COALESCE(SUM(CASE WHEN fv.setor_nome = 'Corporativo' THEN fv.valor_total END), 0)::numeric AS fat_corp,
      COALESCE(SUM(fv.valor_total), 0)::numeric AS fat_total,
      COALESCE(SUM(fv.receitas),    0)::numeric AS rec_total
    FROM months m
    LEFT JOIN fv ON fv.data_venda
      BETWEEN m.m_start
          AND (m.m_start + interval '1 month' - interval '1 day')::date
    GROUP BY m.m_start
    ORDER BY m.m_start
  )
  SELECT jsonb_build_object(
    'meses', jsonb_agg(
      jsonb_build_object(
        'ano',         a.ano,
        'mes',         a.mes,
        'eh_atual',    a.m_start = date_trunc('month', CURRENT_DATE)::date,
        'total',       a.fat_total,
        'receita',     a.rec_total,
        'margem_pct',  CASE WHEN a.fat_total > 0
                         THEN ROUND((a.rec_total / a.fat_total * 100)::numeric, 1)
                         ELSE NULL END,
        'Lazer',       a.fat_lazer,
        'Weddings',    a.fat_weddings,
        'Corporativo', a.fat_corp
      )
      ORDER BY a.m_start
    )
  )
  INTO v_result
  FROM agg a;

  RETURN COALESCE(v_result, '{"meses":[]}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_historico_12m_setores(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_historico_12m_setores(text) TO anon, authenticated, service_role;
