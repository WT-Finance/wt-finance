-- ---------------------------------------------------------------------------
-- 0052 — refactor: hotel via fornecedor real (supersede workaround de 0042)
--
-- 0042 adicionou fallback via pagante porque raw.vendas_excel.fornecedor
-- estava NULL em toda a base. Com o re-seed de mai/2026, fornecedor agora
-- contém o nome real do hotel/venue para todos os contratos.
--
-- Remove o CTE contrato_via_pagante e o COALESCE duplo. A função volta ao
-- caminho único: fato_lancamento_operacao.venda_n → raw.vendas_excel
-- (contrato = true, fornecedor como hotel).
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

  -- Dados canônicos da operação: data, hotel e data_venda vêm da linha Contrato=1
  -- (ADR-0031 / ADR-0052). fornecedor é real desde o re-seed de mai/2026.
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
-- Wrapper público (mantém SECURITY DEFINER)
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
