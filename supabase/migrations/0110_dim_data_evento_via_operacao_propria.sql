-- ---------------------------------------------------------------------------
-- 0110 — fix(v4.9.1): data_evento/data_venda_contrato da dim via Operação Própria
--
-- ⚠️ APLICAR SOMENTE APÓS o re-upload de Vendas COM a coluna Operação Própria
--    ingerida (parser v4.9.1). Antes disso operacao_propria é NULL → todas as
--    operações ficariam "sem data". Depois de aplicar, RE-RODAR a função para
--    repovoar a dim: SELECT public.regenerar_dim_operacao_weddings();
--
-- BUG: o contrato_info derivava data_evento/data_venda_contrato/hotel juntando
--   analytics.fato_lancamento_operacao.venda_n → raw.vendas_excel (contrato=true).
--   Esse venda_n (digitado no ERP no Lançamentos) aponta, em algumas operações,
--   para o contrato de OUTRO casamento de nome parecido — confirmado:
--     • "W - Paula e Fernando - 11MAY27" → venda_n 44374 = contrato da "Paula e Bruno" (2023)
--     • "W - Darlene e Adnan"            → venda_n 44025 = contrato da "Daniella e Augusto" (2024)
--     • "W - Larissa e Vitor"            → venda_n 49444 = contrato da "Larissa e Thiago" (2025)
--   Resultado: 3 casamentos de 2027 caíam em 2023/2024/2025 na Carteira e na Lista.
--
-- FIX: data_evento e data_venda_contrato passam a vir SEMPRE da linha
--   `Produto = 'Contrato de casamento'` da base de Vendas, casada por
--   operacao_propria = operacao (o vínculo confiável mantido pelo ERP). Sem
--   fallback por venda_n — operação sem match (nome defasado no Lançamentos, ex.
--   "...DDMMAA") fica "sem data" honesto até a equipe alinhar o nome no ERP.
--   (Convenção: data_evento = Data Início da Vendas, em qualquer lugar.) ADR-0101.
--
-- hotel/faturamento/receita continuam pelo venda_n por ora (contaminação tratada
-- em follow-up). Só o contrato_info muda; o resto da função é idêntico.
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

  -- v4.9.1: data_evento e data_venda_contrato vêm SEMPRE da linha
  -- 'Contrato de casamento' da base de Vendas, casada por operacao_propria
  -- (vínculo direto do ERP). Substitui o join por venda_n, que apontava para o
  -- contrato de outro casamento de nome parecido. Sem fallback: nome sem match
  -- → "sem data" honesto.
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

  -- Fallback de hotel (mantém venda_n por ora — follow-up): 'Diárias de
  -- Hospedagem' (1) → 'Pacote de Casamento' (2).
  hotel_por_produto AS (
    SELECT DISTINCT ON (l.operacao)
      l.operacao,
      r.fornecedor AS hotel
    FROM analytics.fato_lancamento_operacao l
    JOIN raw.vendas_excel r
      ON r.venda_numero = l.venda_n::text
     AND r.produto IN ('Diárias de Hospedagem', 'Pacote de Casamento')
    WHERE l.venda_n IS NOT NULL
      AND r.fornecedor IS NOT NULL
      AND r.fornecedor <> ''
    ORDER BY l.operacao,
      CASE r.produto
        WHEN 'Diárias de Hospedagem' THEN 1
        WHEN 'Pacote de Casamento'   THEN 2
        ELSE 99
      END,
      r.id
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
    analytics.extrair_nome_casal(l.operacao)                                      AS nome_casal,
    -- v4.9.1: Data Início da linha 'Contrato de casamento' (via operacao_propria).
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
