-- ---------------------------------------------------------------------------
-- 0105 — fix(v4.9/M1): Carteira usa a Data Início REAL, sem fallback pelo nome
--
-- BUG: analytics.regenerar_dim_operacao_weddings() derivava data_evento como
--   COALESCE(ci.data_inicio_evento, analytics.extrair_data_evento(operacao)).
--   O fallback parseia o NOME da operação ("W - Paula e Fernando - 11MAY27" →
--   2027-05-11), inventando anos de evento quando a Data Início é nula. Isso
--   produzia células espúrias na Carteira (ex.: "2023 → 2027").
--
-- FIX: data_evento passa a ser SOMENTE ci.data_inicio_evento (Data Início do
--   Contrato). Nula → NULL → "sem data" honesto na Carteira (detector de
--   cadastro/ingestão incompleta). Mesmo princípio da remoção da Equação
--   Financeira na v4.8. NÃO toca data_venda_contrato (já correto).
--
-- Obs.: a coluna `Data Início` da planilha de Vendas hoje não é ingerida (header
--   divergente no parser — corrigido em paralelo no M2/parser + re-upload).
--   Até o re-upload, data_inicio_evento é nula → a Carteira fica "sem data"
--   honestamente, em vez de mostrar anos inventados.
--
-- extrair_data_evento fica ÓRFÃ após esta mudança (era usada só aqui) → dropada.
-- CREATE OR REPLACE (não destrutiva); a dim é repovoada chamando a função.
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

  -- Fonte primária: linha Contrato=1 com fornecedor real (re-seed mai/2026).
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

  -- Fallback para operações sem linha Contrato=1 (dados históricos sem re-seed).
  -- Prioridade: 'Diárias de Hospedagem' (1) → 'Pacote de Casamento' (2).
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
    -- v4.9/M1: somente a Data Início real do Contrato; sem fallback pelo nome.
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

-- extrair_data_evento ficou órfã (só era usada no fallback acima).
DROP FUNCTION IF EXISTS analytics.extrair_data_evento(text);
