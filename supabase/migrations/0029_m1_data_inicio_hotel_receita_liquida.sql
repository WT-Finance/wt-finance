-- ---------------------------------------------------------------------------
-- 0029 — M1: Data de Início, Hotel e Receita Líquida
--
-- ADR-0027: data_inicio_evento como fonte canônica da data do casamento
-- ADR-0029: hotel extraído do Fornecedor do contrato (Contrato = 1)
-- ADR-0030: receita_liquida = entradas - saídas; custos = receita_bruta - receita_liquida
--
-- Mudanças:
--   raw.vendas_excel          + data_inicio_evento DATE, fornecedor TEXT
--   analytics.dim_operacao_weddings + hotel, faturamento, receita_bruta,
--                               custos_internos, margem_bruta_pct, margem_liquida_pct
--   public.inserir_lote_raw() atualizado
--   analytics.regenerar_dim_operacao_weddings() atualizado
--   public.regenerar_dim_operacao_weddings()   atualizado
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. raw.vendas_excel — novas colunas
-- ---------------------------------------------------------------------------
ALTER TABLE raw.vendas_excel
  ADD COLUMN IF NOT EXISTS data_inicio_evento date,
  ADD COLUMN IF NOT EXISTS fornecedor         text;

-- ---------------------------------------------------------------------------
-- 2. analytics.dim_operacao_weddings — novas colunas
-- ---------------------------------------------------------------------------
ALTER TABLE analytics.dim_operacao_weddings
  ADD COLUMN IF NOT EXISTS hotel             text,
  ADD COLUMN IF NOT EXISTS faturamento       numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receita_bruta     numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custos_internos   numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margem_bruta_pct  numeric(7,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margem_liquida_pct numeric(7,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3. public.inserir_lote_raw() — inclui os dois novos campos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inserir_lote_raw(p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linha jsonb;
BEGIN
  FOR linha IN SELECT jsonb_array_elements(p_linhas)
  LOOP
    INSERT INTO raw.vendas_excel (
      arquivo_origem,
      linha_origem,
      venda_numero,
      data_venda,
      vendedor,
      pagante,
      setor_macro,
      setor,
      setor_micro,
      produto,
      valor_total,
      receitas,
      contrato,
      taxa_servico,
      semana,
      mes,
      data_inicio_evento,
      fornecedor
    ) VALUES (
      linha->>'arquivo_origem',
      (linha->>'linha_origem')::int,
      linha->>'venda_numero',
      (linha->>'data_venda')::date,
      linha->>'vendedor',
      linha->>'pagante',
      linha->>'setor_macro',
      linha->>'setor',
      linha->>'setor_micro',
      linha->>'produto',
      (linha->>'valor_total')::numeric,
      (linha->>'receitas')::numeric,
      (linha->>'contrato')::boolean,
      (linha->>'taxa_servico')::boolean,
      NULLIF(linha->>'semana', '')::int,
      linha->>'mes',
      NULLIF(linha->>'data_inicio_evento', '')::date,
      NULLIF(linha->>'fornecedor', '')
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.inserir_lote_raw(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_raw(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. analytics.regenerar_dim_operacao_weddings()
--    Agora usa data_inicio_evento (ADR-0027) e fornecedor (ADR-0029) das
--    vendas onde contrato = true, e calcula Receita Líquida (ADR-0030).
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

  -- Agrega lançamentos por operação
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

  -- Extrai data_inicio_evento e hotel do contrato (Contrato = 1) vinculado à operação
  -- via venda_n → raw.vendas_excel.venda_numero
  contrato_info AS (
    SELECT DISTINCT ON (l.operacao)
      l.operacao,
      r.data_inicio_evento,
      r.fornecedor AS hotel
    FROM analytics.fato_lancamento_operacao l
    JOIN raw.vendas_excel r
      ON r.venda_numero = l.venda_n::text
      AND r.contrato = true
    WHERE l.venda_n IS NOT NULL
    ORDER BY l.operacao, r.id
  ),

  -- Agrega faturamento e receita_bruta das vendas vinculadas à operação
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

    -- Data canônica: prefere data_inicio_evento do contrato (ADR-0027),
    -- fallback para regex no nome se não disponível
    COALESCE(ci.data_inicio_evento, analytics.extrair_data_evento(l.operacao)) AS data_evento,

    CASE
      WHEN COALESCE(ci.data_inicio_evento, analytics.extrair_data_evento(l.operacao)) IS NULL
        THEN 'sem_data'
      WHEN COALESCE(ci.data_inicio_evento, analytics.extrair_data_evento(l.operacao)) < CURRENT_DATE
        THEN 'passado'
      ELSE 'futuro'
    END                                                                  AS situacao,

    ci.hotel,

    COALESCE(v.faturamento,   0)                                         AS faturamento,
    COALESCE(v.receita_bruta, 0)                                         AS receita_bruta,

    l.entradas_total,
    l.saidas_total,
    l.recebido,
    l.a_receber,
    l.pago,
    l.a_pagar,

    -- custos_internos = receita_bruta − receita_liquida (ADR-0030)
    -- receita_liquida = entradas − saídas = resultado_caixa
    GREATEST(COALESCE(v.receita_bruta, 0) - (l.entradas_total - l.saidas_total), 0)
                                                                         AS custos_internos,

    -- margem_bruta_pct = receita_bruta / faturamento
    CASE WHEN COALESCE(v.faturamento, 0) > 0
      THEN ROUND(COALESCE(v.receita_bruta, 0) / v.faturamento * 100, 1)
      ELSE 0 END                                                         AS margem_bruta_pct,

    -- margem_liquida_pct = receita_liquida / faturamento
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
-- 5. public.regenerar_dim_operacao_weddings() — wrapper SECURITY DEFINER
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regenerar_dim_operacao_weddings()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT analytics.regenerar_dim_operacao_weddings()
$$;

REVOKE EXECUTE ON FUNCTION public.regenerar_dim_operacao_weddings() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.regenerar_dim_operacao_weddings() TO service_role;
