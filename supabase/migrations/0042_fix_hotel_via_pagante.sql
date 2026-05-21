-- ---------------------------------------------------------------------------
-- 0042 — fix: hotel via pagante quando não há venda_n no lançamento
--
-- Problema: contrato_info usava JOIN fato_lancamento_operacao.venda_n →
--   raw.vendas_excel. Se o lançamento não tem venda_n apontando para a
--   venda contrato, hotel fica NULL.
--
-- Solução: dois caminhos de busca, prioridade ao venda_n, fallback ao pagante.
--   1. via_lanc  — caminho existente (JOIN por venda_n, r.contrato = true)
--   2. via_pagante — raw.vendas_excel.pagante = extrair_nome_casal(operacao)
--      e contrato = true
--
-- Atualiza analytics.regenerar_dim_operacao_weddings e o wrapper público.
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

  -- Lista de operações com nome_casal extraído
  all_ops AS (
    SELECT DISTINCT
      operacao,
      analytics.extrair_nome_casal(operacao) AS nome_casal
    FROM analytics.fato_lancamento_operacao
    WHERE operacao IS NOT NULL
  ),

  -- Caminho 1: via lançamento → venda_n → raw.vendas_excel (contrato = true)
  contrato_via_lanc AS (
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

  -- Caminho 2 (fallback): raw.vendas_excel.pagante = nome_casal da operação
  contrato_via_pagante AS (
    SELECT DISTINCT ON (ops.operacao)
      ops.operacao,
      r.data_inicio_evento,
      r.data_venda   AS data_venda_contrato,
      r.fornecedor   AS hotel
    FROM all_ops ops
    JOIN raw.vendas_excel r
      ON r.contrato = true
     AND TRIM(UPPER(r.pagante)) = TRIM(UPPER(ops.nome_casal))
     AND r.fornecedor IS NOT NULL
    ORDER BY ops.operacao, r.id
  ),

  -- Mescla os dois caminhos: prefere via_lanc, cai em via_pagante
  contrato_info AS (
    SELECT
      ops.operacao,
      COALESCE(vl.data_inicio_evento, vp.data_inicio_evento) AS data_inicio_evento,
      COALESCE(vl.data_venda_contrato, vp.data_venda_contrato) AS data_venda_contrato,
      COALESCE(vl.hotel, vp.hotel) AS hotel
    FROM all_ops ops
    LEFT JOIN contrato_via_lanc    vl ON vl.operacao = ops.operacao
    LEFT JOIN contrato_via_pagante vp ON vp.operacao = ops.operacao
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
