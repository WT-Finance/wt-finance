-- V3-1: adiciona parâmetros opcionais de período ao get_executiva_kpis.
-- Quando fornecidos, p_ant_from/p_ant_to/p_yoy_from/p_yoy_to sobrepõem
-- o cálculo interno, permitindo que o Server Component passe períodos
-- proporcionais (ex: este-mês parcial → comparar só os dias decorridos).

-- Remove a assinatura antiga (3 params) para evitar ambiguidade
DROP FUNCTION IF EXISTS public.get_executiva_kpis(date, date, text);

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

  -- Período anterior: usa override quando fornecido
  v_ant_to        date := COALESCE(p_ant_to,   p_from - 1);
  v_ant_from      date := COALESCE(p_ant_from, p_from - v_dias);

  -- Período YoY: usa override quando fornecido
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

  -- ── Margens e tickets ──────────────────────────────────────────────────
  v_margem     := CASE WHEN v_fat     > 0 THEN ROUND((v_rec     / v_fat     * 100)::numeric, 2) ELSE NULL END;
  v_margem_ant := CASE WHEN v_fat_ant > 0 THEN ROUND((v_rec_ant / v_fat_ant * 100)::numeric, 2) ELSE NULL END;
  v_margem_yoy := CASE WHEN v_fat_yoy > 0 THEN ROUND((v_rec_yoy / v_fat_yoy * 100)::numeric, 2) ELSE NULL END;

  v_ticket     := CASE WHEN v_vendas     > 0 THEN ROUND((v_fat     / v_vendas)::numeric,     2) ELSE NULL END;
  v_ticket_ant := CASE WHEN v_vendas_ant > 0 THEN ROUND((v_fat_ant / v_vendas_ant)::numeric, 2) ELSE NULL END;
  v_ticket_yoy := CASE WHEN v_vendas_yoy > 0 THEN ROUND((v_fat_yoy / v_vendas_yoy)::numeric, 2) ELSE NULL END;

  RETURN jsonb_build_object(
    'periodo',          jsonb_build_object('from', to_char(p_from,      'YYYY-MM-DD'), 'to', to_char(p_to,      'YYYY-MM-DD')),
    'periodo_anterior', jsonb_build_object('from', to_char(v_ant_from,  'YYYY-MM-DD'), 'to', to_char(v_ant_to,  'YYYY-MM-DD')),
    'periodo_yoy',      jsonb_build_object('from', to_char(v_yoy_from,  'YYYY-MM-DD'), 'to', to_char(v_yoy_to,  'YYYY-MM-DD')),

    'faturamento', jsonb_build_object(
      'valor',             v_fat,
      'variacao_anterior', CASE WHEN v_fat_ant > 0 THEN ROUND(((v_fat - v_fat_ant) / v_fat_ant * 100)::numeric, 1) ELSE NULL END,
      'variacao_yoy',      CASE WHEN v_fat_yoy > 0 THEN ROUND(((v_fat - v_fat_yoy) / v_fat_yoy * 100)::numeric, 1) ELSE NULL END
    ),
    'receita', jsonb_build_object(
      'valor',             v_rec,
      'variacao_anterior', CASE WHEN v_rec_ant > 0 THEN ROUND(((v_rec - v_rec_ant) / v_rec_ant * 100)::numeric, 1) ELSE NULL END,
      'variacao_yoy',      CASE WHEN v_rec_yoy > 0 THEN ROUND(((v_rec - v_rec_yoy) / v_rec_yoy * 100)::numeric, 1) ELSE NULL END
    ),
    'margem_pct', jsonb_build_object(
      'valor',             v_margem,
      'variacao_anterior', CASE WHEN v_margem IS NOT NULL AND v_margem_ant IS NOT NULL
                             THEN ROUND((v_margem - v_margem_ant)::numeric, 2) ELSE NULL END,
      'variacao_yoy',      CASE WHEN v_margem IS NOT NULL AND v_margem_yoy IS NOT NULL
                             THEN ROUND((v_margem - v_margem_yoy)::numeric, 2) ELSE NULL END,
      'is_pp', true
    ),
    'vendas', jsonb_build_object(
      'valor',             v_vendas,
      'variacao_anterior', CASE WHEN v_vendas_ant > 0 THEN ROUND((((v_vendas - v_vendas_ant)::numeric) / v_vendas_ant * 100)::numeric, 1) ELSE NULL END,
      'variacao_yoy',      CASE WHEN v_vendas_yoy > 0 THEN ROUND((((v_vendas - v_vendas_yoy)::numeric) / v_vendas_yoy * 100)::numeric, 1) ELSE NULL END
    ),
    'ticket_medio', jsonb_build_object(
      'valor',             v_ticket,
      'variacao_anterior', CASE WHEN v_ticket_ant IS NOT NULL AND v_ticket_ant > 0
                             THEN ROUND(((v_ticket - v_ticket_ant) / v_ticket_ant * 100)::numeric, 1) ELSE NULL END,
      'variacao_yoy',      CASE WHEN v_ticket_yoy IS NOT NULL AND v_ticket_yoy > 0
                             THEN ROUND(((v_ticket - v_ticket_yoy) / v_ticket_yoy * 100)::numeric, 1) ELSE NULL END
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_executiva_kpis(date, date, text, date, date, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_executiva_kpis(date, date, text, date, date, date, date) TO anon, authenticated, service_role;
