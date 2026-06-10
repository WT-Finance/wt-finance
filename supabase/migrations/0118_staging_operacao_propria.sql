-- ---------------------------------------------------------------------------
-- 0118 — fix(v4.12.1/M1): operacao_propria no pipeline ATÔMICO de Vendas.
--
-- PROBLEMA (paridade de ingestão): a via atômica da v4.12 (0116) — staging + swap —
-- foi escrita listando as 21 colunas e OMITIU operacao_propria, tanto em
-- inserir_lote_staging (raw novo → staging) quanto no copy staging→raw de
-- promover_carga_vendas. Resultado: uma carga de Vendas promovida por essa via grava
-- operacao_propria = NULL, e a regeneração da dim encontra o vínculo VAZIO →
-- convidados zeram, datas de evento somem, faturamento das operações volta a errar
-- (regressão SILENCIOSA da correção da v4.9.x — ver 0107/0109/0110/0111).
--
-- A coluna JÁ EXISTE em raw.vendas_excel_staging (criada por 0116 como
-- LIKE raw.vendas_excel, que tem operacao_propria desde 0107) — falta apenas
-- PREENCHÊ-la. Esta migration faz CREATE OR REPLACE das duas funções para incluir
-- operacao_propria, alinhando o pipeline atômico ao inserir_lote_raw (0107) e ao
-- parser ÚNICO (v4.12.1). Sem isso, unificar só o parser não fecharia a porta: o SQL
-- ainda descartaria a coluna. Mudança não-destrutiva (só CREATE OR REPLACE).
-- ---------------------------------------------------------------------------

-- Defensivo: garante a coluna na staging (idempotente; já presente via 0116).
ALTER TABLE raw.vendas_excel_staging ADD COLUMN IF NOT EXISTS operacao_propria text;

-- 1. inserir_lote_staging: passa a gravar operacao_propria (22 colunas).
CREATE OR REPLACE FUNCTION public.inserir_lote_staging(p_linhas jsonb)
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
    INSERT INTO raw.vendas_excel_staging (
      arquivo_origem, linha_origem, venda_numero, data_venda, vendedor, pagante,
      setor_macro, setor, setor_micro, produto, valor_total, receitas, contrato,
      taxa_servico, semana, mes, data_inicio_evento, fornecedor, situacao,
      tipo_contrato, passageiros, operacao_propria
    ) VALUES (
      linha->>'arquivo_origem',
      (linha->>'linha_origem')::int,
      linha->>'venda_numero',
      NULLIF(linha->>'data_venda', '')::date,
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
      linha->>'fornecedor',
      NULLIF(linha->>'situacao', ''),
      NULLIF(linha->>'tipo_contrato', ''),
      NULLIF(linha->>'passageiros', ''),
      NULLIF(linha->>'operacao_propria', '')
    );
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_staging(jsonb) TO service_role;

-- 2. promover_carga_vendas: o copy staging→raw passa a incluir operacao_propria.
--    Demais passos (validação defensiva, truncate+swap, transform, dims, refresh)
--    idênticos à 0116.
CREATE OR REPLACE FUNCTION public.promover_carga_vendas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total   int;
  v_fora    int;
  v_dim_min date;
  v_dim_max date;
  v_result  jsonb;
BEGIN
  -- Re-validação defensiva ANTES do truncate (a transação garante rollback, mas
  -- abortar cedo deixa a mensagem clara e evita trabalho desnecessário).
  SELECT count(*) INTO v_total FROM raw.vendas_excel_staging;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'Carga abortada: staging vazia — nada a promover.';
  END IF;

  SELECT min(data), max(data) INTO v_dim_min, v_dim_max FROM analytics.dim_data;
  SELECT count(*) INTO v_fora
  FROM raw.vendas_excel_staging
  WHERE data_venda IS NOT NULL AND (data_venda < v_dim_min OR data_venda > v_dim_max);
  IF v_fora > 0 THEN
    RAISE EXCEPTION 'Carga abortada: % venda(s) com data fora do calendário (% a %).',
      v_fora, v_dim_min, v_dim_max;
  END IF;

  -- Swap destrutivo — só aqui, e tudo nesta transação.
  TRUNCATE
    analytics.fato_venda_item,
    analytics.fato_venda,
    analytics.dim_produto,
    analytics.dim_pagante,
    analytics.dim_vendedor,
    raw.vendas_excel
  RESTART IDENTITY CASCADE;

  INSERT INTO raw.vendas_excel (
    arquivo_origem, linha_origem, venda_numero, data_venda, vendedor, pagante,
    setor_macro, setor, setor_micro, produto, valor_total, receitas, contrato,
    taxa_servico, semana, mes, data_inicio_evento, fornecedor, situacao,
    tipo_contrato, passageiros, operacao_propria
  )
  SELECT
    arquivo_origem, linha_origem, venda_numero, data_venda, vendedor, pagante,
    setor_macro, setor, setor_micro, produto, valor_total, receitas, contrato,
    taxa_servico, semana, mes, data_inicio_evento, fornecedor, situacao,
    tipo_contrato, passageiros, operacao_propria
  FROM raw.vendas_excel_staging;

  v_result := public.transform_raw_to_analytics();
  PERFORM public.regenerar_dim_operacao_weddings();
  PERFORM public.refresh_all_materialized_views();

  TRUNCATE raw.vendas_excel_staging RESTART IDENTITY;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.promover_carga_vendas() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.promover_carga_vendas() TO service_role;
