-- ---------------------------------------------------------------------------
-- 0111 — fix(v4.9.1): Carteira Vendas × Entrega construída SÓ da base de Vendas
--
-- ⚠️ APLICAR SOMENTE APÓS o re-upload de Vendas COM Operação Própria ingerida.
--
-- A Carteira: Vendas × Entrega deve usar APENAS a base VendasPorProduto (decisão
-- do usuário). Antes lia analytics.dim_operacao_weddings, que é construída a
-- partir dos Lançamentos e datava o evento pelo join frágil venda_n (jogava 3
-- casamentos de 2027 em 2023/2024/2025 — ver 0110/ADR-0101).
--
-- AGORA: cada casamento = 1 linha `Produto = 'Contrato de casamento'` da Vendas
-- (filtro que isola exatamente os 233 casamentos, todos Setor = Weddings).
--   • linha da matriz  = ano de Data Venda (data_venda) do contrato
--   • coluna da matriz = ano de Data Início (data_inicio_evento) do contrato  ← entrega
--   • métrica 'casamentos'           = contagem (1 linha = 1 casamento)
--   • métrica 'faturamento'/'receita'= soma dos produtos da operação (por operacao_propria)
-- A montagem da matriz (células/linhas/totais) é idêntica à anterior; só muda a fonte.
-- CREATE OR REPLACE preserva os GRANTs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_carteira_weddings(p_metric text DEFAULT 'casamentos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
  v_metric text;
BEGIN
  v_metric := CASE
    WHEN p_metric IN ('casamentos', 'faturamento', 'receita_bruta') THEN p_metric
    ELSE 'casamentos'
  END;

  WITH
  -- 1 linha por casamento: a linha 'Contrato de casamento' da base de Vendas.
  contrato AS (
    SELECT DISTINCT ON (operacao_propria)
      operacao_propria,
      data_venda          AS data_venda_contrato,
      data_inicio_evento  AS data_evento
    FROM raw.vendas_excel
    WHERE produto = 'Contrato de casamento'
      AND operacao_propria IS NOT NULL
      AND operacao_propria <> ''
    ORDER BY operacao_propria, id
  ),
  -- faturamento/receita da operação = soma de TODOS os produtos da Operação Própria.
  financeiro AS (
    SELECT
      operacao_propria,
      COALESCE(SUM(valor_total), 0) AS faturamento,
      COALESCE(SUM(receitas),    0) AS receita_bruta
    FROM raw.vendas_excel
    WHERE operacao_propria IS NOT NULL
      AND operacao_propria <> ''
    GROUP BY operacao_propria
  ),
  base AS (
    SELECT
      EXTRACT(YEAR FROM c.data_venda_contrato)::int                AS ano_venda,
      EXTRACT(YEAR FROM c.data_evento)::int                        AS ano_casamento_num,
      COALESCE(EXTRACT(YEAR FROM c.data_evento)::text, 'sem_data') AS ano_casamento,
      CASE v_metric
        WHEN 'faturamento'   THEN f.faturamento
        WHEN 'receita_bruta' THEN f.receita_bruta
        ELSE 1
      END AS valor
    FROM contrato c
    LEFT JOIN financeiro f ON f.operacao_propria = c.operacao_propria
    WHERE c.data_venda_contrato IS NOT NULL
  ),
  celulas AS (
    SELECT
      ano_venda,
      ano_casamento_num,
      ano_casamento,
      CASE v_metric
        WHEN 'casamentos' THEN COUNT(*)::numeric
        ELSE SUM(valor)
      END AS v
    FROM base
    GROUP BY ano_venda, ano_casamento_num, ano_casamento
  ),
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
  ),
  linhas_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('ano_venda', av, 'valores', valores, 'total', total)
        ORDER BY sort_key, av
      ),
      '[]'::jsonb
    ) AS linhas
    FROM (
      SELECT av, valores, total, 1 AS sort_key FROM linhas
      UNION ALL
      SELECT 'total', valores, total, 2 FROM total_row WHERE total IS NOT NULL
    ) combined
  )
  SELECT jsonb_build_object(
    'metrica',        v_metric,
    'anos_casamento', COALESCE((SELECT to_jsonb(arr) FROM anos_casamento_arr), '[]'::jsonb),
    'linhas',         (SELECT linhas FROM linhas_json)
  )
  INTO v_result;

  RETURN v_result;
END $function$;
