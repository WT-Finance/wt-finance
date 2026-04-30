-- Funções de leitura para a Aba Executiva (V2-2) e reutilizadas na Performance.
-- Todas aceitam intervalo de datas (p_from, p_to) em vez de ano/mês fixo.
-- SECURITY DEFINER para acessar analytics sem expor o schema via REST.

-- ---------------------------------------------------------------------------
-- 1. get_executiva_kpis(p_from, p_to, p_setor)
--    5 KPIs + variação vs período anterior contíguo + variação YoY
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_executiva_kpis(
  p_from  date,
  p_to    date,
  p_setor text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- duração do período selecionado (inclusive)
  v_dias          int := (p_to - p_from) + 1;

  -- período anterior contíguo de mesma duração
  v_ant_to        date := p_from - 1;
  v_ant_from      date := p_from - v_dias;

  -- período YoY (mesmo intervalo, ano anterior)
  v_yoy_from      date := (p_from - interval '1 year')::date;
  v_yoy_to        date := (p_to   - interval '1 year')::date;

  -- valores do período atual
  v_fat           numeric := 0;
  v_rec           numeric := 0;
  v_vendas        bigint  := 0;

  -- período anterior
  v_fat_ant       numeric := 0;
  v_rec_ant       numeric := 0;
  v_vendas_ant    bigint  := 0;

  -- período YoY
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
    'periodo',            jsonb_build_object('from', to_char(p_from, 'YYYY-MM-DD'), 'to', to_char(p_to, 'YYYY-MM-DD')),
    'periodo_anterior',   jsonb_build_object('from', to_char(v_ant_from, 'YYYY-MM-DD'), 'to', to_char(v_ant_to, 'YYYY-MM-DD')),
    'periodo_yoy',        jsonb_build_object('from', to_char(v_yoy_from, 'YYYY-MM-DD'), 'to', to_char(v_yoy_to, 'YYYY-MM-DD')),

    'faturamento', jsonb_build_object(
      'valor',               v_fat,
      'variacao_anterior',   CASE WHEN v_fat_ant > 0 THEN ROUND(((v_fat - v_fat_ant) / v_fat_ant * 100)::numeric, 1) ELSE NULL END,
      'variacao_yoy',        CASE WHEN v_fat_yoy > 0 THEN ROUND(((v_fat - v_fat_yoy) / v_fat_yoy * 100)::numeric, 1) ELSE NULL END
    ),
    'receita', jsonb_build_object(
      'valor',               v_rec,
      'variacao_anterior',   CASE WHEN v_rec_ant > 0 THEN ROUND(((v_rec - v_rec_ant) / v_rec_ant * 100)::numeric, 1) ELSE NULL END,
      'variacao_yoy',        CASE WHEN v_rec_yoy > 0 THEN ROUND(((v_rec - v_rec_yoy) / v_rec_yoy * 100)::numeric, 1) ELSE NULL END
    ),
    'margem_pct', jsonb_build_object(
      'valor',               v_margem,
      -- margem em pontos percentuais (p.p.), não variação relativa
      'variacao_anterior',   CASE WHEN v_margem IS NOT NULL AND v_margem_ant IS NOT NULL
                               THEN ROUND((v_margem - v_margem_ant)::numeric, 2) ELSE NULL END,
      'variacao_yoy',        CASE WHEN v_margem IS NOT NULL AND v_margem_yoy IS NOT NULL
                               THEN ROUND((v_margem - v_margem_yoy)::numeric, 2) ELSE NULL END,
      'is_pp', true  -- flag para UI exibir 'p.p.' em vez de '%'
    ),
    'vendas', jsonb_build_object(
      'valor',               v_vendas,
      'variacao_anterior',   CASE WHEN v_vendas_ant > 0 THEN ROUND((((v_vendas - v_vendas_ant)::numeric) / v_vendas_ant * 100)::numeric, 1) ELSE NULL END,
      'variacao_yoy',        CASE WHEN v_vendas_yoy > 0 THEN ROUND((((v_vendas - v_vendas_yoy)::numeric) / v_vendas_yoy * 100)::numeric, 1) ELSE NULL END
    ),
    'ticket_medio', jsonb_build_object(
      'valor',               v_ticket,
      'variacao_anterior',   CASE WHEN v_ticket_ant IS NOT NULL AND v_ticket_ant > 0
                               THEN ROUND(((v_ticket - v_ticket_ant) / v_ticket_ant * 100)::numeric, 1) ELSE NULL END,
      'variacao_yoy',        CASE WHEN v_ticket_yoy IS NOT NULL AND v_ticket_yoy > 0
                               THEN ROUND(((v_ticket - v_ticket_yoy) / v_ticket_yoy * 100)::numeric, 1) ELSE NULL END
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_executiva_kpis(date, date, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_executiva_kpis(date, date, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. get_mix_setor(p_from, p_to, p_setor)
--    Agregação por setor macro: faturamento, receita, margem, % do total
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mix_setor(
  p_from  date,
  p_to    date,
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
  WITH totais AS (
    SELECT
      COALESCE(SUM(vd.valor_total), 0) AS fat_total,
      COALESCE(SUM(vd.receitas),    0) AS rec_total
    FROM analytics.mv_vendas_diarias vd
    JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
    WHERE vd.data_venda BETWEEN p_from AND p_to
      AND (p_setor = 'todos' OR dsm.nome = p_setor)
  ),
  por_setor AS (
    SELECT
      dsm.id,
      dsm.nome,
      dsm.display_nome,
      dsm.cor_hex,
      dsm.ordem,
      COALESCE(SUM(vd.valor_total), 0) AS faturamento,
      COALESCE(SUM(vd.receitas),    0) AS receita
    FROM analytics.dim_setor_macro dsm
    LEFT JOIN analytics.mv_vendas_diarias vd
      ON vd.setor_macro_id = dsm.id
     AND vd.data_venda BETWEEN p_from AND p_to
    WHERE (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY dsm.id, dsm.nome, dsm.display_nome, dsm.cor_hex, dsm.ordem
  )
  SELECT jsonb_build_object(
    'total', jsonb_build_object(
      'faturamento', t.fat_total,
      'receita',     t.rec_total,
      'margem_pct',  CASE WHEN t.fat_total > 0
                       THEN ROUND((t.rec_total / t.fat_total * 100)::numeric, 2)
                       ELSE NULL END
    ),
    'setores', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'setor_macro',    s.nome,
          'display_nome',   s.display_nome,
          'cor_hex',        s.cor_hex,
          'faturamento',    s.faturamento,
          'receita',        s.receita,
          'margem_pct',     CASE WHEN s.faturamento > 0
                              THEN ROUND((s.receita / s.faturamento * 100)::numeric, 2)
                              ELSE NULL END,
          'pct_faturamento', CASE WHEN t.fat_total > 0
                               THEN ROUND((s.faturamento / t.fat_total * 100)::numeric, 1)
                               ELSE 0 END,
          'pct_receita',     CASE WHEN t.rec_total > 0
                               THEN ROUND((s.receita / t.rec_total * 100)::numeric, 1)
                               ELSE 0 END
        )
        ORDER BY s.ordem
      )
      FROM por_setor s
    )
  )
  INTO v_result
  FROM totais t;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_mix_setor(date, date, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_mix_setor(date, date, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. get_prejuizos(p_from, p_to, p_setor, p_summary)
--    Vendas com receita negativa. p_summary=true retorna só totais.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_prejuizos(
  p_from    date,
  p_to      date,
  p_setor   text    DEFAULT 'todos',
  p_summary boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quantidade  bigint  := 0;
  v_valor_total numeric := 0;
  v_lista       jsonb;
  v_result      jsonb;
BEGIN
  -- Totais (sempre calculados, usados em ambos os modos)
  SELECT
    COUNT(DISTINCT fv.id),
    COALESCE(ABS(SUM(fvi.receitas)), 0)
  INTO v_quantidade, v_valor_total
  FROM analytics.fato_venda_item fvi
  JOIN analytics.fato_venda      fv  ON fv.id  = fvi.fato_venda_id
  JOIN analytics.dim_setor       ds  ON ds.id  = fvi.setor_id
  JOIN analytics.dim_setor_macro dsm ON dsm.id = ds.setor_macro_id
  WHERE fv.data_venda BETWEEN p_from AND p_to
    AND fvi.receitas < 0
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  IF p_summary THEN
    RETURN jsonb_build_object(
      'quantidade',           v_quantidade,
      'valor_prejuizo_total', v_valor_total
    );
  END IF;

  -- Lista detalhada (top 50 mais negativas)
  SELECT jsonb_agg(r)
  INTO v_lista
  FROM (
    SELECT
      to_char(fv.data_venda, 'YYYY-MM-DD')  AS data_venda,
      dv.nome                                AS vendedor_nome,
      COALESCE(dp.nome, '')                  AS pagante_nome,
      dprod.nome                             AS produto_nome,
      fvi.valor_total,
      fvi.receitas
    FROM analytics.fato_venda_item fvi
    JOIN analytics.fato_venda      fv    ON fv.id    = fvi.fato_venda_id
    JOIN analytics.dim_setor       ds    ON ds.id    = fvi.setor_id
    JOIN analytics.dim_setor_macro dsm   ON dsm.id   = ds.setor_macro_id
    JOIN analytics.dim_vendedor    dv    ON dv.id    = fv.vendedor_id
    LEFT JOIN analytics.dim_pagante dp   ON dp.id    = fv.pagante_id
    JOIN analytics.dim_produto     dprod ON dprod.id = fvi.produto_id
    WHERE fv.data_venda BETWEEN p_from AND p_to
      AND fvi.receitas < 0
      AND (p_setor = 'todos' OR dsm.nome = p_setor)
    ORDER BY fvi.receitas ASC
    LIMIT 50
  ) r;

  RETURN jsonb_build_object(
    'total', jsonb_build_object(
      'quantidade',           v_quantidade,
      'valor_prejuizo_total', v_valor_total
    ),
    'vendas',          COALESCE(v_lista, '[]'::jsonb),
    'total_no_periodo', v_quantidade
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_prejuizos(date, date, text, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_prejuizos(date, date, text, boolean) TO anon, authenticated, service_role;
