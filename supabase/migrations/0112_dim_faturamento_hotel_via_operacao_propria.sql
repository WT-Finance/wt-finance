-- ---------------------------------------------------------------------------
-- 0112 — fix(v4.9.2): faturamento/receita/hotel da dim via Operação Própria
--
-- ⚠️ Backend-only (não precisa re-upload). APÓS aplicar, RE-RODAR a função para
--    repovoar a dim: SELECT public.regenerar_dim_operacao_weddings();
--
-- A 0110 já trocou data_evento/data_venda_contrato para a Operação Própria. Mas
-- faturamento/receita (vendas_agg) e hotel (hotel_por_produto) ainda saíam do
-- join por venda_n → contaminação confirmada e GRAVE:
--   • "W - Darlene e Adnan" mostrava R$ 375.523 de faturamento — 100% da
--     "W - Daniella e Augusto" (todos os 31 venda_n da Darlene pertencem à
--     Daniella). Pior: Daniella era contada DUAS vezes (como Daniella e como
--     Darlene). O faturamento real da Darlene é R$ 8.999 (só o contrato).
--
-- FIX: faturamento/receita = soma de raw.vendas_excel por operacao_propria
-- (todos os produtos da operação, qualquer setor); hotel = fornecedor da linha
-- de hospedagem/pacote da operação, por operacao_propria. Mesmo vínculo direto
-- e confiável do ADR-0101 (estende-o a faturamento/hotel — ADR-0102).
--
-- Efeito medido: 214 das 231 operações casadas ficam IDÊNTICAS; mudam só as ~17
-- contaminadas; total cai de R$ 44,38 Mi → ~R$ 44,14 Mi (remoção das duplas
-- contagens). Operação cujo nome no Lançamentos não casa a Operação Própria
-- (Camila e Bruno "SET"≠"SEP"; Thelma "DDMMAA") fica com faturamento 0 / hotel
-- nulo — consistente com o "sem data" já honesto delas.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION analytics.regenerar_dim_operacao_weddings()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

  -- data_evento/data_venda_contrato da linha 'Contrato de casamento' (v4.9.1/0110).
  contrato_info AS (
    SELECT DISTINCT ON (r.operacao_propria)
      r.operacao_propria       AS operacao,
      r.data_inicio_evento,
      r.data_venda             AS data_venda_contrato,
      NULLIF(r.fornecedor, '') AS hotel
    FROM raw.vendas_excel r
    WHERE r.produto = 'Contrato de casamento'
      AND r.operacao_propria IS NOT NULL
      AND r.operacao_propria <> ''
    ORDER BY r.operacao_propria, r.id
  ),

  -- v4.9.2: hotel via operacao_propria (fornecedor da hospedagem/pacote da operação).
  -- 'Diárias de Hospedagem' (1) → 'Pacote de Casamento' (2).
  hotel_por_produto AS (
    SELECT DISTINCT ON (r.operacao_propria)
      r.operacao_propria AS operacao,
      r.fornecedor       AS hotel
    FROM raw.vendas_excel r
    WHERE r.operacao_propria IS NOT NULL
      AND r.operacao_propria <> ''
      AND r.produto IN ('Diárias de Hospedagem', 'Pacote de Casamento')
      AND r.fornecedor IS NOT NULL
      AND r.fornecedor <> ''
    ORDER BY r.operacao_propria,
      CASE r.produto
        WHEN 'Diárias de Hospedagem' THEN 1
        WHEN 'Pacote de Casamento'   THEN 2
        ELSE 99
      END,
      r.id
  ),

  -- v4.9.2: faturamento/receita = soma da operação por operacao_propria (todos
  -- os produtos/setores). Substitui o join por venda_n, que contaminava e duplicava.
  vendas_agg AS (
    SELECT
      r.operacao_propria                AS operacao,
      COALESCE(SUM(r.valor_total), 0)   AS faturamento,
      COALESCE(SUM(r.receitas),    0)   AS receita_bruta
    FROM raw.vendas_excel r
    WHERE r.operacao_propria IS NOT NULL
      AND r.operacao_propria <> ''
    GROUP BY r.operacao_propria
  )

  SELECT
    l.operacao,
    analytics.extrair_nome_casal(l.operacao)                                      AS nome_casal,
    ci.data_inicio_evento                                                          AS data_evento,
    CASE
      WHEN ci.data_inicio_evento IS NULL        THEN 'sem_data'
      WHEN ci.data_inicio_evento < CURRENT_DATE THEN 'passado'
      ELSE 'futuro'
    END                                                                            AS situacao,
    COALESCE(ci.hotel, hpb.hotel)                                                  AS hotel,
    ci.data_venda_contrato,
    COALESCE(v.faturamento,   0)                                                   AS faturamento,
    COALESCE(v.receita_bruta, 0)                                                   AS receita_bruta,
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
      ELSE 0 END                                                                   AS margem_bruta_pct,
    CASE WHEN COALESCE(v.faturamento, 0) > 0
      THEN ROUND((l.entradas_total - l.saidas_total) / v.faturamento * 100, 1)
      ELSE 0 END                                                                   AS margem_liquida_pct,
    now()                                                                          AS atualizado_em

  FROM lanc l
  LEFT JOIN contrato_info    ci  ON ci.operacao  = l.operacao
  LEFT JOIN hotel_por_produto hpb ON hpb.operacao = l.operacao
  LEFT JOIN vendas_agg        v   ON v.operacao   = l.operacao;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$;
