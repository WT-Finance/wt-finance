-- 0089 — feat: get_kpi_weddings_drawer — série mensal + YoY + subsetores para o drawer rico (ADR-0086)

CREATE OR REPLACE FUNCTION public.get_kpi_weddings_drawer(
  p_from date,
  p_to   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_yoy_from  date := (p_from - interval '1 year')::date;
  v_yoy_to    date := (p_to   - interval '1 year')::date;
  v_series    jsonb;
  v_yoy       jsonb;
  v_totais    jsonb;
  v_subs      jsonb;
  v_fat_total numeric;
BEGIN
  -- série mensal
  SELECT jsonb_agg(
    jsonb_build_object(
      'mes',        to_char(date_trunc('month', fv.data_venda), 'YYYY-MM'),
      'faturamento', COALESCE(SUM(fvi.valor_total), 0),
      'receita',     COALESCE(SUM(fvi.receitas),    0),
      'margem_pct',  CASE WHEN SUM(fvi.valor_total) > 0
                       THEN ROUND(SUM(fvi.receitas) / SUM(fvi.valor_total) * 100, 1)
                       ELSE 0 END,
      'n_vendas',    COUNT(DISTINCT fv.id)
    )
    ORDER BY date_trunc('month', fv.data_venda)
  )
  INTO v_series
  FROM analytics.fato_venda_item  fvi
  JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
  JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
  JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
  WHERE fv.data_venda BETWEEN p_from AND p_to
    AND dsm.nome = 'Weddings'
  GROUP BY date_trunc('month', fv.data_venda);

  -- yoy série
  SELECT jsonb_agg(
    jsonb_build_object(
      'mes',        to_char(date_trunc('month', fv.data_venda), 'YYYY-MM'),
      'faturamento', COALESCE(SUM(fvi.valor_total), 0),
      'receita',     COALESCE(SUM(fvi.receitas),    0)
    )
    ORDER BY date_trunc('month', fv.data_venda)
  )
  INTO v_yoy
  FROM analytics.fato_venda_item  fvi
  JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
  JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
  JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
  WHERE fv.data_venda BETWEEN v_yoy_from AND v_yoy_to
    AND dsm.nome = 'Weddings'
  GROUP BY date_trunc('month', fv.data_venda);

  -- totais
  SELECT jsonb_build_object(
    'faturamento',  COALESCE(SUM(fvi.valor_total), 0),
    'receita',      COALESCE(SUM(fvi.receitas),    0),
    'margem_pct',   CASE WHEN SUM(fvi.valor_total) > 0
                      THEN ROUND(SUM(fvi.receitas) / SUM(fvi.valor_total) * 100, 1)
                      ELSE 0 END,
    'n_vendas',     COUNT(DISTINCT fv.id),
    'ticket_medio', CASE WHEN COUNT(DISTINCT fv.id) > 0
                      THEN ROUND(SUM(fvi.valor_total) / COUNT(DISTINCT fv.id), 0)
                      ELSE 0 END,
    'receita_media', CASE WHEN COUNT(DISTINCT fv.id) > 0
                       THEN ROUND(SUM(fvi.receitas) / COUNT(DISTINCT fv.id), 0)
                       ELSE 0 END
  )
  INTO v_totais
  FROM analytics.fato_venda_item  fvi
  JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
  JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
  JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
  WHERE fv.data_venda BETWEEN p_from AND p_to
    AND dsm.nome = 'Weddings';

  -- fat total para pct
  v_fat_total := (v_totais->>'faturamento')::numeric;

  -- subsetores (same pattern as get_sumario_subsetor)
  SELECT jsonb_agg(
    jsonb_build_object(
      'subsetor',        sub.subsetor_detalhado,
      'n_vendas',        sub.n_vendas,
      'faturamento',     sub.faturamento,
      'receita',         sub.receita,
      'margem_pct',      CASE WHEN sub.faturamento > 0
                           THEN ROUND(sub.receita / sub.faturamento * 100, 1)
                           ELSE 0 END,
      'pct_faturamento', CASE WHEN v_fat_total > 0
                           THEN ROUND(sub.faturamento / v_fat_total * 100, 1)
                           ELSE 0 END
    )
    ORDER BY sub.faturamento DESC
  )
  INTO v_subs
  FROM (
    SELECT
      COALESCE(dps.subsetor_detalhado, 'NÃO_CLASSIFICADO') AS subsetor_detalhado,
      COUNT(DISTINCT fv.id)                                 AS n_vendas,
      COALESCE(SUM(fvi.valor_total), 0)                     AS faturamento,
      COALESCE(SUM(fvi.receitas),    0)                     AS receita
    FROM analytics.fato_venda_item  fvi
    JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
    JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
    JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
    JOIN analytics.dim_produto      dp  ON dp.id  = fvi.produto_id
    LEFT JOIN (
      SELECT DISTINCT ON (produto_normalizado)
             produto_normalizado, subsetor_detalhado
      FROM   analytics.dim_produto_subsetor
      WHERE  ativo = TRUE
      ORDER  BY produto_normalizado
    ) dps ON dps.produto_normalizado = UPPER(TRIM(dp.nome))
    WHERE fv.data_venda BETWEEN p_from AND p_to
      AND dsm.nome = 'Weddings'
    GROUP BY COALESCE(dps.subsetor_detalhado, 'NÃO_CLASSIFICADO')
  ) sub;

  RETURN jsonb_build_object(
    'series',      COALESCE(v_series, '[]'::jsonb),
    'yoy_series',  COALESCE(v_yoy,    '[]'::jsonb),
    'totais',      COALESCE(v_totais, '{"faturamento":0,"receita":0,"margem_pct":0,"n_vendas":0,"ticket_medio":0,"receita_media":0}'::jsonb),
    'subsetores',  COALESCE(v_subs,   '[]'::jsonb)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_kpi_weddings_drawer(date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_kpi_weddings_drawer(date, date) TO service_role;
