-- ---------------------------------------------------------------------------
-- 0077 — fix: get_sumario_subsetor — pct > 100% por fan-out em produto_normalizado
--
-- dim_produto_subsetor tem produto como PK mas produto_normalizado sem UNIQUE.
-- Existem 2 duplicatas de casing no seed (ex: 'Contrato de Casamento' e
-- 'Contrato de casamento' ambos com produto_normalizado = 'CONTRATO DE CASAMENTO').
-- O LEFT JOIN original multiplica as linhas de fato_venda_item por 2 para esses
-- produtos, inflando SUM(valor_total) e produzindo pct_faturamento > 100%.
--
-- Fix: substituir o LEFT JOIN por um subquery com DISTINCT ON (produto_normalizado)
-- que garante exatamente um subsetor_detalhado por produto normalizado.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_sumario_subsetor(
  p_from date,
  p_to   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subsetores jsonb;
  v_total      jsonb;
  v_fat_total  numeric;
BEGIN
  SELECT COALESCE(SUM(fvi.valor_total), 0)
  INTO v_fat_total
  FROM analytics.fato_venda_item  fvi
  JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
  JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
  JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
  WHERE fv.data_venda BETWEEN p_from AND p_to
    AND dsm.nome = 'Weddings';

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
  INTO v_subsetores
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
             produto_normalizado,
             subsetor_detalhado
      FROM   analytics.dim_produto_subsetor
      WHERE  ativo = TRUE
      ORDER  BY produto_normalizado
    ) dps ON dps.produto_normalizado = UPPER(TRIM(dp.nome))
    WHERE fv.data_venda BETWEEN p_from AND p_to
      AND dsm.nome = 'Weddings'
    GROUP BY COALESCE(dps.subsetor_detalhado, 'NÃO_CLASSIFICADO')
  ) sub;

  SELECT jsonb_build_object(
    'n_vendas',    COUNT(DISTINCT fv.id),
    'faturamento', COALESCE(SUM(fvi.valor_total), 0),
    'receita',     COALESCE(SUM(fvi.receitas),    0),
    'margem_pct',  CASE WHEN COALESCE(SUM(fvi.valor_total), 0) > 0
                     THEN ROUND(SUM(fvi.receitas) / SUM(fvi.valor_total) * 100, 1)
                     ELSE 0 END
  )
  INTO v_total
  FROM analytics.fato_venda_item  fvi
  JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
  JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
  JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
  WHERE fv.data_venda BETWEEN p_from AND p_to
    AND dsm.nome = 'Weddings';

  RETURN jsonb_build_object(
    'periodo',    jsonb_build_object('inicio', p_from, 'fim', p_to),
    'subsetores', COALESCE(v_subsetores, '[]'::jsonb),
    'total',      COALESCE(v_total,
      '{"n_vendas":0,"faturamento":0,"receita":0,"margem_pct":0}'::jsonb)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_sumario_subsetor(date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_sumario_subsetor(date, date) TO service_role;
