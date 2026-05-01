-- V3-3: Linha temporal 12m e sparklines nos KPIs.
-- Nenhuma tabela nova — dados calculados em runtime das tabelas existentes.

-- ---------------------------------------------------------------------------
-- 1. get_historico_12m(p_setor)
--    12 meses completos (do mês atual para trás) com flag eh_atual.
--    Não usa filtro de período — sempre 12m para dar contexto histórico amplo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_historico_12m(
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
  fv AS (
    SELECT vd.data_venda, vd.valor_total, vd.receitas
    FROM analytics.mv_vendas_diarias vd
    JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
    WHERE p_setor = 'todos' OR dsm.nome = p_setor
  ),
  months AS (
    SELECT date_trunc('month', CURRENT_DATE - (n || ' months')::interval)::date AS m_start
    FROM generate_series(11, 0, -1) AS n
  ),
  agg AS (
    SELECT
      m.m_start,
      EXTRACT(year  FROM m.m_start)::int AS ano,
      EXTRACT(month FROM m.m_start)::int AS mes,
      COALESCE(SUM(fv.valor_total), 0) AS fat,
      COALESCE(SUM(fv.receitas),    0) AS rec
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
        'faturamento', a.fat,
        'receita',     a.rec,
        'margem_pct',  CASE WHEN a.fat > 0
                         THEN ROUND((a.rec / a.fat * 100)::numeric, 1)
                         ELSE NULL END,
        'eh_atual',    a.m_start = date_trunc('month', CURRENT_DATE)::date
      )
      ORDER BY a.m_start
    )
  )
  INTO v_result
  FROM agg a;

  RETURN COALESCE(v_result, '{"meses":[]}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_historico_12m(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_historico_12m(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. get_sparklines(p_preset, p_from, p_to, p_setor)
--    6 pontos de dados para sparklines dos KPIs.
--    Granularidade depende do preset:
--      este-mes / mes-passado  → 6 meses mensais
--      ultimos-3-meses         → 6 blocos de 3 meses (âncora = p_from)
--      ultimos-6-meses         → 6 blocos de 6 meses (âncora = p_from)
--      este-ano                → 6 anos (YTD para o atual)
--      personalizado           → NULL (período irregular)
--    Labels: "MM/YY" para blocos mensais, "YYYY" para anos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sparklines(
  p_preset text,
  p_from   date,
  p_to     date,
  p_setor  text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result   jsonb;
  v_step_mo  int;
  v_anchor   date;
  v_cur_year int;
BEGIN
  IF p_preset = 'personalizado' THEN
    RETURN NULL;
  END IF;

  -- ── Preset anual: 6 anos, YTD para o ano corrente ──────────────────────
  IF p_preset = 'este-ano' THEN
    v_cur_year := EXTRACT(year FROM p_to)::int;

    WITH
    fv AS (
      SELECT vd.data_venda, vd.valor_total, vd.receitas, vd.vendas_count
      FROM analytics.mv_vendas_diarias vd
      JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
      WHERE p_setor = 'todos' OR dsm.nome = p_setor
    ),
    periods AS (
      SELECT
        make_date(v_cur_year - n, 1, 1) AS p_start,
        CASE WHEN n = 0 THEN p_to
             ELSE make_date(v_cur_year - n, 12, 31)
        END AS p_end,
        to_char(make_date(v_cur_year - n, 1, 1), 'YYYY') AS lbl
      FROM generate_series(5, 0, -1) AS n
    ),
    agg AS (
      SELECT
        pd.p_start, pd.lbl,
        COALESCE(SUM(fv.valor_total),  0) AS fat,
        COALESCE(SUM(fv.receitas),     0) AS rec,
        COALESCE(SUM(fv.vendas_count), 0) AS vnd
      FROM periods pd
      LEFT JOIN fv ON fv.data_venda BETWEEN pd.p_start AND pd.p_end
      GROUP BY pd.p_start, pd.lbl
      ORDER BY pd.p_start
    )
    SELECT jsonb_build_object(
      'labels',       jsonb_agg(lbl),
      'faturamento',  jsonb_agg(fat),
      'receita',      jsonb_agg(rec),
      'margem_pct',   jsonb_agg(
                        CASE WHEN fat > 0 THEN ROUND((rec/fat*100)::numeric,1) ELSE NULL END),
      'vendas',       jsonb_agg(vnd),
      'ticket_medio', jsonb_agg(
                        CASE WHEN vnd > 0 THEN ROUND((fat/vnd)::numeric,0) ELSE NULL END)
    )
    INTO v_result
    FROM agg;

  -- ── Presets com blocos de N meses ──────────────────────────────────────
  ELSE
    CASE p_preset
      WHEN 'ultimos-6-meses' THEN v_step_mo := 6; v_anchor := p_from;
      WHEN 'ultimos-3-meses' THEN v_step_mo := 3; v_anchor := p_from;
      ELSE                        v_step_mo := 1;
                                  v_anchor  := date_trunc('month', p_to)::date;
    END CASE;

    WITH
    fv AS (
      SELECT vd.data_venda, vd.valor_total, vd.receitas, vd.vendas_count
      FROM analytics.mv_vendas_diarias vd
      JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
      WHERE p_setor = 'todos' OR dsm.nome = p_setor
    ),
    periods AS (
      SELECT
        (v_anchor - (n * v_step_mo || ' months')::interval)::date AS p_start,
        ((v_anchor - (n * v_step_mo || ' months')::interval)
          + (v_step_mo || ' months')::interval
          - interval '1 day')::date                               AS p_end,
        to_char(
          (v_anchor - (n * v_step_mo || ' months')::interval)::date,
          'MM/YY'
        ) AS lbl
      FROM generate_series(5, 0, -1) AS n
    ),
    agg AS (
      SELECT
        pd.p_start, pd.lbl,
        COALESCE(SUM(fv.valor_total),  0) AS fat,
        COALESCE(SUM(fv.receitas),     0) AS rec,
        COALESCE(SUM(fv.vendas_count), 0) AS vnd
      FROM periods pd
      LEFT JOIN fv ON fv.data_venda BETWEEN pd.p_start AND pd.p_end
      GROUP BY pd.p_start, pd.lbl
      ORDER BY pd.p_start
    )
    SELECT jsonb_build_object(
      'labels',       jsonb_agg(lbl),
      'faturamento',  jsonb_agg(fat),
      'receita',      jsonb_agg(rec),
      'margem_pct',   jsonb_agg(
                        CASE WHEN fat > 0 THEN ROUND((rec/fat*100)::numeric,1) ELSE NULL END),
      'vendas',       jsonb_agg(vnd),
      'ticket_medio', jsonb_agg(
                        CASE WHEN vnd > 0 THEN ROUND((fat/vnd)::numeric,0) ELSE NULL END)
    )
    INTO v_result
    FROM agg;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_sparklines(text, date, date, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_sparklines(text, date, date, text) TO anon, authenticated, service_role;
