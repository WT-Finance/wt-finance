-- ---------------------------------------------------------------------------
-- 0031 — M4b: Corrige bugs nas RPCs de Carteira e Próximos Casamentos
--
-- Bug 1 — get_carteira_weddings: PostgreSQL não permite ORDER BY com expressão
--   diferente do argumento DISTINCT em array_agg. Fix: subquery com DISTINCT primeiro.
--
-- Bug 2 — get_proximos_casamentos: v_ratio era inflado porque operações históricas
--   sem saidas_total (pagamentos ao hotel não registrados em lançamentos) produziam
--   (entradas_total - 0) / receita_bruta >> 1. Fix: filtrar saidas_total > 0.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. public.get_carteira_weddings() — fix Bug 1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_carteira_weddings(
  p_metric text DEFAULT 'casamentos'
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
  base AS (
    SELECT
      EXTRACT(YEAR FROM data_venda_contrato)::int                         AS ano_venda,
      EXTRACT(YEAR FROM data_evento)::int                                 AS ano_casamento_num,
      COALESCE(EXTRACT(YEAR FROM data_evento)::text, 'sem_data')          AS ano_casamento,
      CASE p_metric
        WHEN 'faturamento'   THEN faturamento
        WHEN 'receita_bruta' THEN receita_bruta
        ELSE 1
      END AS valor
    FROM analytics.dim_operacao_weddings
    WHERE data_venda_contrato IS NOT NULL
  ),
  celulas AS (
    SELECT
      ano_venda,
      ano_casamento_num,
      ano_casamento,
      CASE p_metric
        WHEN 'casamentos' THEN COUNT(*)::numeric
        ELSE SUM(valor)
      END AS v
    FROM base
    GROUP BY ano_venda, ano_casamento_num, ano_casamento
  ),
  -- FIX: subquery com DISTINCT antes do array_agg (PostgreSQL exige ORDER BY = argumento DISTINCT)
  anos_casamento_arr AS (
    SELECT array_agg(ano_casamento ORDER BY ano_casamento_num NULLS LAST, ano_casamento) AS arr
    FROM (SELECT DISTINCT ano_casamento, ano_casamento_num FROM celulas) t
  ),
  linhas AS (
    SELECT
      ano_venda::text AS av,
      jsonb_object_agg(ano_casamento, v) AS valores,
      SUM(v) AS total
    FROM celulas
    GROUP BY ano_venda
  ),
  totais_col AS (
    SELECT ano_casamento, SUM(v) AS col_total
    FROM celulas
    GROUP BY ano_casamento
  ),
  total_row AS (
    SELECT
      jsonb_object_agg(ano_casamento, col_total) AS valores,
      SUM(col_total) AS total
    FROM totais_col
  )
  SELECT jsonb_build_object(
    'metrica',        p_metric,
    'anos_casamento', (SELECT arr FROM anos_casamento_arr),
    'linhas', (
      SELECT jsonb_agg(
        jsonb_build_object('ano_venda', av, 'valores', valores, 'total', total)
        ORDER BY sort_key, av
      )
      FROM (
        SELECT av, valores, total, 1 AS sort_key FROM linhas
        UNION ALL
        SELECT 'total', valores, total, 2 FROM total_row
      ) combined
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, jsonb_build_object(
    'metrica', p_metric,
    'anos_casamento', '[]'::jsonb,
    'linhas', '[]'::jsonb
  ));
END $$;

REVOKE EXECUTE ON FUNCTION public.get_carteira_weddings(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_carteira_weddings(text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. public.get_proximos_casamentos() — fix Bug 2
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_proximos_casamentos(
  p_horizonte_meses int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result       jsonb;
  v_ratio        numeric;
  v_margem_hist  numeric;
BEGIN
  -- FIX: filtra saidas_total > 0 para usar apenas operações com caixa completo
  -- (hotel pago e registrado em lançamentos). Sem esse filtro, operações onde
  -- saidas_total=0 inflam entradas/receita_bruta >> 1.
  SELECT
    AVG(CASE WHEN receita_bruta > 0
          THEN (entradas_total - saidas_total)::numeric / receita_bruta
          ELSE NULL END),
    AVG(CASE WHEN faturamento > 0
          THEN (entradas_total - saidas_total)::numeric / faturamento * 100
          ELSE NULL END)
  INTO v_ratio, v_margem_hist
  FROM analytics.dim_operacao_weddings
  WHERE situacao = 'passado'
    AND receita_bruta > 0
    AND saidas_total > 0
    AND (entradas_total - saidas_total) > 0;

  SELECT jsonb_build_object(
    'horizonte_meses',      p_horizonte_meses,
    'margem_historica_pct', ROUND(COALESCE(v_margem_hist, 0), 1),
    'casamentos', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'data_casamento',          to_char(data_evento, 'YYYY-MM-DD'),
            'casal',                   nome_casal,
            'hotel',                   hotel,
            'faturamento',             faturamento,
            'receita_bruta',           receita_bruta,
            'margem_pct',              margem_bruta_pct,
            'receita_liquida_prevista',
              ROUND(receita_bruta * COALESCE(v_ratio, 0), 2)
          )
          ORDER BY data_evento ASC
        )
        FROM analytics.dim_operacao_weddings
        WHERE situacao = 'futuro'
          AND data_evento <= CURRENT_DATE + (p_horizonte_meses || ' months')::interval
      ),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_proximos_casamentos(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_proximos_casamentos(int)
  TO anon, authenticated, service_role;
