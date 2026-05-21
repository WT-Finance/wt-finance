-- ---------------------------------------------------------------------------
-- 0040 — M11 v3.8: Agregação por Venda Nº (ADR-0045)
--
-- Cria analytics.vw_vendas_agregadas
-- Atualiza get_vendas_em_aberto_weddings para usar a view
-- Cria get_vendas_prejuizo_weddings para Receita Negativa por Venda Nº
-- ---------------------------------------------------------------------------

-- 1. View de agregação por Venda Nº
CREATE OR REPLACE VIEW analytics.vw_vendas_agregadas AS
SELECT
  venda_numero                                             AS venda_no,
  MIN(data_venda)                                         AS data_venda,
  MIN(vendedor)                                           AS vendedor,
  setor_macro,
  SUM(valor_total)                                        AS valor_total,
  SUM(receitas)                                           AS receita,
  CASE WHEN SUM(CASE WHEN situacao = 'Aberta' OR situacao IS NULL
                     THEN 1 ELSE 0 END) > 0
       THEN 'Aberta'::text
       ELSE 'Fechada'::text
  END                                                     AS situacao,
  COUNT(*)                                                AS qtd_produtos,
  STRING_AGG(COALESCE(produto, ''), ', ' ORDER BY produto) AS produtos
FROM raw.vendas_excel
GROUP BY venda_numero, setor_macro;

-- 2. get_vendas_em_aberto_weddings — usa vw_vendas_agregadas
CREATE OR REPLACE FUNCTION public.get_vendas_em_aberto_weddings(
  p_limite  int DEFAULT 50,
  p_offset  int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total  bigint;
  v_vendas jsonb;
BEGIN
  SELECT COUNT(*)
  INTO v_total
  FROM analytics.vw_vendas_agregadas
  WHERE setor_macro = 'Weddings'
    AND situacao = 'Aberta';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'venda_no',    v.venda_no,
        'data_venda',  to_char(v.data_venda, 'YYYY-MM-DD'),
        'valor_total', v.valor_total,
        'vendedor',    COALESCE(v.vendedor, '—'),
        'idade_dias',  (CURRENT_DATE - v.data_venda)::int
      )
      ORDER BY v.data_venda DESC
    ),
    '[]'::jsonb
  )
  INTO v_vendas
  FROM (
    SELECT venda_no, data_venda, valor_total, vendedor
    FROM analytics.vw_vendas_agregadas
    WHERE setor_macro = 'Weddings'
      AND situacao = 'Aberta'
    ORDER BY data_venda DESC
    LIMIT p_limite OFFSET p_offset
  ) v;

  RETURN jsonb_build_object(
    'total',  v_total,
    'vendas', COALESCE(v_vendas, '[]'::jsonb)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_vendas_em_aberto_weddings(int, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_vendas_em_aberto_weddings(int, int)
  TO anon, authenticated, service_role;

-- 3. get_vendas_prejuizo_weddings — Receita Negativa por Venda Nº (Weddings)
CREATE OR REPLACE FUNCTION public.get_vendas_prejuizo_weddings(
  p_from date,
  p_to   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total  bigint;
  v_vendas jsonb;
BEGIN
  SELECT COUNT(*)
  INTO v_total
  FROM analytics.vw_vendas_agregadas
  WHERE setor_macro = 'Weddings'
    AND data_venda BETWEEN p_from AND p_to
    AND receita < 0;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'venda_no',    v.venda_no,
        'data_venda',  to_char(v.data_venda, 'YYYY-MM-DD'),
        'valor_total', v.valor_total,
        'receita',     v.receita,
        'vendedor',    COALESCE(v.vendedor, '—')
      )
      ORDER BY v.receita ASC
    ),
    '[]'::jsonb
  )
  INTO v_vendas
  FROM (
    SELECT venda_no, data_venda, valor_total, receita, vendedor
    FROM analytics.vw_vendas_agregadas
    WHERE setor_macro = 'Weddings'
      AND data_venda BETWEEN p_from AND p_to
      AND receita < 0
    ORDER BY receita ASC
    LIMIT 50
  ) v;

  RETURN jsonb_build_object(
    'total',  v_total,
    'vendas', COALESCE(v_vendas, '[]'::jsonb)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_vendas_prejuizo_weddings(date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_vendas_prejuizo_weddings(date, date)
  TO anon, authenticated, service_role;
