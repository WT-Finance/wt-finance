-- ---------------------------------------------------------------------------
-- 0030 — M4: Carteira vendas×entregas + Próximos Casamentos a Entregar
--
-- ADR-0028: Carteira matrix usa Contrato=1 como pivô da operação
-- ADR-0031: Pipeline removido; substituído por Próximos Casamentos
--
-- Mudanças:
--   analytics.dim_operacao_weddings + data_venda_contrato DATE
--   analytics.regenerar_dim_operacao_weddings() atualizado
--   public.get_carteira_weddings(p_metric)   novo RPC
--   public.get_proximos_casamentos(p_horizonte_meses)  novo RPC
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. analytics.dim_operacao_weddings — nova coluna
-- ---------------------------------------------------------------------------
ALTER TABLE analytics.dim_operacao_weddings
  ADD COLUMN IF NOT EXISTS data_venda_contrato date;

-- ---------------------------------------------------------------------------
-- 2. analytics.regenerar_dim_operacao_weddings() — inclui data_venda_contrato
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.regenerar_dim_operacao_weddings()
RETURNS int
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  TRUNCATE analytics.dim_operacao_weddings;

  INSERT INTO analytics.dim_operacao_weddings (
    operacao,
    nome_casal,
    data_evento,
    situacao,
    hotel,
    data_venda_contrato,
    faturamento,
    receita_bruta,
    entradas_total,
    saidas_total,
    recebido,
    a_receber,
    pago,
    a_pagar,
    custos_internos,
    margem_bruta_pct,
    margem_liquida_pct,
    atualizado_em
  )
  WITH

  lanc AS (
    SELECT
      operacao,
      SUM(CASE WHEN tipo   = 'Entrada'          THEN valor ELSE 0 END) AS entradas_total,
      SUM(CASE WHEN tipo   = 'Saída'            THEN valor ELSE 0 END) AS saidas_total,
      SUM(CASE WHEN status = 'Entrada'          THEN valor ELSE 0 END) AS recebido,
      SUM(CASE WHEN status = 'A Receber Futuro' THEN valor ELSE 0 END) AS a_receber,
      SUM(CASE WHEN status = 'Saída'            THEN valor ELSE 0 END) AS pago,
      SUM(CASE WHEN status = 'A Pagar Futuro'   THEN valor ELSE 0 END) AS a_pagar
    FROM analytics.fato_lancamento_operacao
    GROUP BY operacao
  ),

  -- Extrai data_inicio_evento, hotel e data_venda_contrato do Contrato=1 vinculado
  contrato_info AS (
    SELECT DISTINCT ON (l.operacao)
      l.operacao,
      r.data_inicio_evento,
      r.data_venda   AS data_venda_contrato,
      r.fornecedor   AS hotel
    FROM analytics.fato_lancamento_operacao l
    JOIN raw.vendas_excel r
      ON r.venda_numero = l.venda_n::text
     AND r.contrato = true
    WHERE l.venda_n IS NOT NULL
    ORDER BY l.operacao, r.id
  ),

  vendas_agg AS (
    SELECT
      l.operacao,
      COALESCE(SUM(fvi.valor_total), 0) AS faturamento,
      COALESCE(SUM(fvi.receitas),    0) AS receita_bruta
    FROM (
      SELECT DISTINCT operacao, venda_n::text AS venda_num
      FROM analytics.fato_lancamento_operacao
      WHERE venda_n IS NOT NULL
    ) l
    JOIN analytics.fato_venda      fv  ON fv.venda_numero = l.venda_num
    JOIN analytics.fato_venda_item fvi ON fvi.fato_venda_id = fv.id
    GROUP BY l.operacao
  )

  SELECT
    l.operacao,
    analytics.extrair_nome_casal(l.operacao)                             AS nome_casal,
    COALESCE(ci.data_inicio_evento, analytics.extrair_data_evento(l.operacao)) AS data_evento,
    CASE
      WHEN COALESCE(ci.data_inicio_evento, analytics.extrair_data_evento(l.operacao)) IS NULL
        THEN 'sem_data'
      WHEN COALESCE(ci.data_inicio_evento, analytics.extrair_data_evento(l.operacao)) < CURRENT_DATE
        THEN 'passado'
      ELSE 'futuro'
    END                                                                  AS situacao,
    ci.hotel,
    ci.data_venda_contrato,
    COALESCE(v.faturamento,   0)                                         AS faturamento,
    COALESCE(v.receita_bruta, 0)                                         AS receita_bruta,
    l.entradas_total,
    l.saidas_total,
    l.recebido,
    l.a_receber,
    l.pago,
    l.a_pagar,
    GREATEST(COALESCE(v.receita_bruta, 0) - (l.entradas_total - l.saidas_total), 0)
                                                                         AS custos_internos,
    CASE WHEN COALESCE(v.faturamento, 0) > 0
      THEN ROUND(COALESCE(v.receita_bruta, 0) / v.faturamento * 100, 1)
      ELSE 0 END                                                         AS margem_bruta_pct,
    CASE WHEN COALESCE(v.faturamento, 0) > 0
      THEN ROUND((l.entradas_total - l.saidas_total) / v.faturamento * 100, 1)
      ELSE 0 END                                                         AS margem_liquida_pct,
    now()                                                                AS atualizado_em

  FROM lanc l
  LEFT JOIN contrato_info ci ON ci.operacao = l.operacao
  LEFT JOIN vendas_agg    v  ON v.operacao  = l.operacao;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ---------------------------------------------------------------------------
-- 3. public.regenerar_dim_operacao_weddings() — wrapper SECURITY DEFINER
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regenerar_dim_operacao_weddings()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN analytics.regenerar_dim_operacao_weddings();
END $$;

REVOKE EXECUTE ON FUNCTION public.regenerar_dim_operacao_weddings() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.regenerar_dim_operacao_weddings() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. public.get_carteira_weddings() — matriz ano_venda × ano_casamento
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
      EXTRACT(YEAR FROM data_venda_contrato)::int       AS ano_venda,
      EXTRACT(YEAR FROM data_evento)::int               AS ano_casamento_num,
      COALESCE(EXTRACT(YEAR FROM data_evento)::text, 'sem_data') AS ano_casamento,
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
  anos_casamento_arr AS (
    SELECT array_agg(DISTINCT ano_casamento ORDER BY ano_casamento_num NULLS LAST, ano_casamento) AS arr
    FROM celulas
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
-- 5. public.get_proximos_casamentos() — casamentos futuros no horizonte
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
  -- Razão histórica RL/RB de operações passadas com dados completos
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
    AND (entradas_total - saidas_total) > 0;

  SELECT jsonb_build_object(
    'horizonte_meses',   p_horizonte_meses,
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

-- ---------------------------------------------------------------------------
-- 6. Rebuilds dim_operacao_weddings with new data_venda_contrato column
-- ---------------------------------------------------------------------------
SELECT analytics.regenerar_dim_operacao_weddings();
