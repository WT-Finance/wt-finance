-- V3.1-1: Correção de dois bugs críticos.
--
-- Fix 1 (Bug 4): get_executiva_kpis — YoY -100% quando período atual tem 0 vendas.
--   Adicionado guard v_vendas > 0 em todas as variações (YoY e anterior).
--   Lógica: diferenciar "sem dados no período" de "zero real".
--
-- Fix 2 (Bug 1): get_kpis — Realizado = Projeção na Aba Metas.
--   v_du_passados usava data <= CURRENT_DATE, contando hoje antes da carga.
--   Corrigido para data < CURRENT_DATE.

-- ---------------------------------------------------------------------------
-- Fix 1: get_executiva_kpis — guard v_vendas > 0 nas variações
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
    'periodo',          jsonb_build_object('from', to_char(p_from,     'YYYY-MM-DD'), 'to', to_char(p_to,     'YYYY-MM-DD')),
    'periodo_anterior', jsonb_build_object('from', to_char(v_ant_from, 'YYYY-MM-DD'), 'to', to_char(v_ant_to, 'YYYY-MM-DD')),
    'periodo_yoy',      jsonb_build_object('from', to_char(v_yoy_from, 'YYYY-MM-DD'), 'to', to_char(v_yoy_to, 'YYYY-MM-DD')),

    'faturamento', jsonb_build_object(
      'valor',             v_fat,
      -- null quando período atual sem vendas (evita -100% enganoso)
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_fat_ant = 0 THEN NULL
                                ELSE ROUND(((v_fat - v_fat_ant) / v_fat_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_fat_yoy = 0 THEN NULL
                                ELSE ROUND(((v_fat - v_fat_yoy) / v_fat_yoy * 100)::numeric, 1) END
    ),
    'receita', jsonb_build_object(
      'valor',             v_rec,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_rec_ant = 0 THEN NULL
                                ELSE ROUND(((v_rec - v_rec_ant) / v_rec_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_rec_yoy = 0 THEN NULL
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
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_vendas_ant = 0 THEN NULL
                                ELSE ROUND((((v_vendas - v_vendas_ant)::numeric) / v_vendas_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_vendas_yoy = 0 THEN NULL
                                ELSE ROUND((((v_vendas - v_vendas_yoy)::numeric) / v_vendas_yoy * 100)::numeric, 1) END
    ),
    'ticket_medio', jsonb_build_object(
      'valor',             v_ticket,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_ticket_ant IS NULL THEN NULL
                                ELSE ROUND(((v_ticket - v_ticket_ant) / v_ticket_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_ticket_yoy IS NULL THEN NULL
                                ELSE ROUND(((v_ticket - v_ticket_yoy) / v_ticket_yoy * 100)::numeric, 1) END
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_executiva_kpis(date, date, text, date, date, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_executiva_kpis(date, date, text, date, date, date, date)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fix 2: get_kpis — v_du_passados com data < CURRENT_DATE
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
    -- Usa data < CURRENT_DATE para contar apenas dias com carga já encerrada.
    -- Evita projeção = realizado quando hoje ainda não foi carregado.
    SELECT COUNT(*)
    INTO v_du_passados
    FROM analytics.dim_data
    WHERE ano = p_ano AND mes = p_mes
      AND dia_util = true
      AND data < CURRENT_DATE;

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
