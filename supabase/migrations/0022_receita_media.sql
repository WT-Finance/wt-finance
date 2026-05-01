-- V3.1-2: Adiciona receita_media_por_venda como 6º KPI.
-- receita_media = receita / vendas (quanto a agência ganha por venda, em R$).
-- Complementa ticket_medio (faturamento/vendas) mostrando rentabilidade por transação.

-- ---------------------------------------------------------------------------
-- 1. get_executiva_kpis — adiciona receita_media ao JSON retornado
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_executiva_kpis(date, date, text, date, date, date, date);

CREATE OR REPLACE FUNCTION public.get_executiva_kpis(
  p_from     date,
  p_to       date,
  p_setor    text DEFAULT 'todos',
  p_ant_from date DEFAULT NULL,
  p_ant_to   date DEFAULT NULL,
  p_yoy_from date DEFAULT NULL,
  p_yoy_to   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dias          int := (p_to - p_from) + 1;

  v_ant_to        date := COALESCE(p_ant_to,   p_from - 1);
  v_ant_from      date := COALESCE(p_ant_from, p_from - v_dias);

  v_yoy_from      date := COALESCE(p_yoy_from, (p_from - interval '1 year')::date);
  v_yoy_to        date := COALESCE(p_yoy_to,   (p_to   - interval '1 year')::date);

  v_fat           numeric := 0;
  v_rec           numeric := 0;
  v_vendas        bigint  := 0;

  v_fat_ant       numeric := 0;
  v_rec_ant       numeric := 0;
  v_vendas_ant    bigint  := 0;

  v_fat_yoy       numeric := 0;
  v_rec_yoy       numeric := 0;
  v_vendas_yoy    bigint  := 0;

  v_margem        numeric;
  v_margem_ant    numeric;
  v_margem_yoy    numeric;
  v_ticket        numeric;
  v_ticket_ant    numeric;
  v_ticket_yoy    numeric;
  v_rec_media     numeric;
  v_rec_media_ant numeric;
  v_rec_media_yoy numeric;
BEGIN
  -- ── Período atual ──────────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(vd.valor_total), 0),
    COALESCE(SUM(vd.receitas), 0),
    COALESCE(SUM(vd.vendas_count), 0)
  INTO v_fat, v_rec, v_vendas
  FROM analytics.mv_vendas_diarias vd
  JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
  WHERE vd.data_venda BETWEEN p_from AND p_to
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  -- ── Período anterior ───────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(vd.valor_total), 0),
    COALESCE(SUM(vd.receitas), 0),
    COALESCE(SUM(vd.vendas_count), 0)
  INTO v_fat_ant, v_rec_ant, v_vendas_ant
  FROM analytics.mv_vendas_diarias vd
  JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
  WHERE vd.data_venda BETWEEN v_ant_from AND v_ant_to
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  -- ── Período YoY ────────────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(vd.valor_total), 0),
    COALESCE(SUM(vd.receitas), 0),
    COALESCE(SUM(vd.vendas_count), 0)
  INTO v_fat_yoy, v_rec_yoy, v_vendas_yoy
  FROM analytics.mv_vendas_diarias vd
  JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
  WHERE vd.data_venda BETWEEN v_yoy_from AND v_yoy_to
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  -- ── Margens, tickets e receita média ──────────────────────────────────
  v_margem     := CASE WHEN v_fat     > 0 THEN ROUND((v_rec     / v_fat     * 100)::numeric, 2) ELSE NULL END;
  v_margem_ant := CASE WHEN v_fat_ant > 0 THEN ROUND((v_rec_ant / v_fat_ant * 100)::numeric, 2) ELSE NULL END;
  v_margem_yoy := CASE WHEN v_fat_yoy > 0 THEN ROUND((v_rec_yoy / v_fat_yoy * 100)::numeric, 2) ELSE NULL END;

  v_ticket     := CASE WHEN v_vendas     > 0 THEN ROUND((v_fat     / v_vendas)::numeric,     2) ELSE NULL END;
  v_ticket_ant := CASE WHEN v_vendas_ant > 0 THEN ROUND((v_fat_ant / v_vendas_ant)::numeric, 2) ELSE NULL END;
  v_ticket_yoy := CASE WHEN v_vendas_yoy > 0 THEN ROUND((v_fat_yoy / v_vendas_yoy)::numeric, 2) ELSE NULL END;

  v_rec_media     := CASE WHEN v_vendas     > 0 THEN ROUND((v_rec     / v_vendas)::numeric,     2) ELSE NULL END;
  v_rec_media_ant := CASE WHEN v_vendas_ant > 0 THEN ROUND((v_rec_ant / v_vendas_ant)::numeric, 2) ELSE NULL END;
  v_rec_media_yoy := CASE WHEN v_vendas_yoy > 0 THEN ROUND((v_rec_yoy / v_vendas_yoy)::numeric, 2) ELSE NULL END;

  RETURN jsonb_build_object(
    'periodo',          jsonb_build_object('from', to_char(p_from,     'YYYY-MM-DD'), 'to', to_char(p_to,     'YYYY-MM-DD')),
    'periodo_anterior', jsonb_build_object('from', to_char(v_ant_from, 'YYYY-MM-DD'), 'to', to_char(v_ant_to, 'YYYY-MM-DD')),
    'periodo_yoy',      jsonb_build_object('from', to_char(v_yoy_from, 'YYYY-MM-DD'), 'to', to_char(v_yoy_to, 'YYYY-MM-DD')),

    'faturamento', jsonb_build_object(
      'valor',             v_fat,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_fat_ant = 0 THEN NULL
                                ELSE ROUND(((v_fat - v_fat_ant) / v_fat_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_fat_yoy = 0 THEN NULL
                                ELSE ROUND(((v_fat - v_fat_yoy) / v_fat_yoy * 100)::numeric, 1) END
    ),
    'receita', jsonb_build_object(
      'valor',             v_rec,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_rec_ant = 0 THEN NULL
                                ELSE ROUND(((v_rec - v_rec_ant) / v_rec_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_rec_yoy = 0 THEN NULL
                                ELSE ROUND(((v_rec - v_rec_yoy) / v_rec_yoy * 100)::numeric, 1) END
    ),
    'margem_pct', jsonb_build_object(
      'valor',             v_margem,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_margem IS NULL OR v_margem_ant IS NULL THEN NULL
                                ELSE ROUND((v_margem - v_margem_ant)::numeric, 2) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_margem IS NULL OR v_margem_yoy IS NULL THEN NULL
                                ELSE ROUND((v_margem - v_margem_yoy)::numeric, 2) END,
      'is_pp', true
    ),
    'vendas', jsonb_build_object(
      'valor',             v_vendas,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_vendas_ant = 0 THEN NULL
                                ELSE ROUND((((v_vendas - v_vendas_ant)::numeric) / v_vendas_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_vendas_yoy = 0 THEN NULL
                                ELSE ROUND((((v_vendas - v_vendas_yoy)::numeric) / v_vendas_yoy * 100)::numeric, 1) END
    ),
    'ticket_medio', jsonb_build_object(
      'valor',             v_ticket,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_ticket_ant IS NULL THEN NULL
                                ELSE ROUND(((v_ticket - v_ticket_ant) / v_ticket_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_ticket_yoy IS NULL THEN NULL
                                ELSE ROUND(((v_ticket - v_ticket_yoy) / v_ticket_yoy * 100)::numeric, 1) END
    ),
    'receita_media', jsonb_build_object(
      'valor',             v_rec_media,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_rec_media_ant IS NULL THEN NULL
                                ELSE ROUND(((v_rec_media - v_rec_media_ant) / v_rec_media_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_rec_media_yoy IS NULL THEN NULL
                                ELSE ROUND(((v_rec_media - v_rec_media_yoy) / v_rec_media_yoy * 100)::numeric, 1) END
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_executiva_kpis(date, date, text, date, date, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_executiva_kpis(date, date, text, date, date, date, date)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. get_sparklines — adiciona receita_media à série de 6 pontos
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
      'labels',        jsonb_agg(lbl),
      'faturamento',   jsonb_agg(fat),
      'receita',       jsonb_agg(rec),
      'margem_pct',    jsonb_agg(CASE WHEN fat > 0 THEN ROUND((rec/fat*100)::numeric,1) ELSE NULL END),
      'vendas',        jsonb_agg(vnd),
      'ticket_medio',  jsonb_agg(CASE WHEN vnd > 0 THEN ROUND((fat/vnd)::numeric,0) ELSE NULL END),
      'receita_media', jsonb_agg(CASE WHEN vnd > 0 THEN ROUND((rec/vnd)::numeric,2) ELSE NULL END)
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
      'labels',        jsonb_agg(lbl),
      'faturamento',   jsonb_agg(fat),
      'receita',       jsonb_agg(rec),
      'margem_pct',    jsonb_agg(CASE WHEN fat > 0 THEN ROUND((rec/fat*100)::numeric,1) ELSE NULL END),
      'vendas',        jsonb_agg(vnd),
      'ticket_medio',  jsonb_agg(CASE WHEN vnd > 0 THEN ROUND((fat/vnd)::numeric,0) ELSE NULL END),
      'receita_media', jsonb_agg(CASE WHEN vnd > 0 THEN ROUND((rec/vnd)::numeric,2) ELSE NULL END)
    )
    INTO v_result
    FROM agg;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_sparklines(text, date, date, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_sparklines(text, date, date, text) TO anon, authenticated, service_role;
