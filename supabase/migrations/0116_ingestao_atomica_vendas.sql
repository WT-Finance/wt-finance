-- ---------------------------------------------------------------------------
-- 0116 — feat(v4.12/M1): ingestão atômica de Vendas (staging + swap). ADR-0104.
--
-- PROBLEMA (F2): o fluxo atual roda truncate_dynamic_tables ANTES do transform,
-- cada passo em sua própria transação. Se o transform falha (ex.: data_venda fora
-- do range de analytics.dim_data → erro de FK), a base de leitura (analytics) fica
-- VAZIA em produção. Já custou caro (migration 0100).
--
-- SOLUÇÃO: carga em STAGING (não-destrutiva) + PRÉ-VALIDAÇÃO + SWAP ATÔMICO.
--   1. inserir_lote_staging  → carrega o raw novo em raw.vendas_excel_staging
--      (a base atual permanece intacta).
--   2. validar_carga_staging → checa range de datas vs dim_data e contagem ANTES
--      de qualquer destruição; validação falha → aborta, base intacta, erro claro.
--   3. promover_carga_vendas → numa ÚNICA transação: truncate + copia staging→raw
--      + transform + regenera dims + refresh MVs. Qualquer falha → ROLLBACK → a
--      base NUNCA fica vazia.
--
-- As RPCs antigas (truncate_dynamic_tables, inserir_lote_raw, transform_…) seguem
-- intactas (coexistem); a rota de carga troca para o fluxo novo. Remoção: depois.
-- Grants no padrão das RPCs de carga (service_role).
-- ---------------------------------------------------------------------------

-- 1. Staging: mesma estrutura de raw.vendas_excel, sem destruir a base atual.
CREATE UNLOGGED TABLE IF NOT EXISTS raw.vendas_excel_staging
  (LIKE raw.vendas_excel INCLUDING DEFAULTS);

-- 2. Insere um lote na STAGING (não-destrutivo). Mesmas colunas do inserir_lote_raw.
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
      tipo_contrato, passageiros
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
      NULLIF(linha->>'passageiros', '')
    );
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_staging(jsonb) TO service_role;

-- 3. Limpa a staging (chamada no início de cada carga, antes de inserir os lotes).
CREATE OR REPLACE FUNCTION public.limpar_staging_vendas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  TRUNCATE raw.vendas_excel_staging RESTART IDENTITY;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.limpar_staging_vendas() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.limpar_staging_vendas() TO service_role;

-- 4. Pré-validação ANTES de qualquer destruição. Não escreve nada.
CREATE OR REPLACE FUNCTION public.validar_carga_staging()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total   int;
  v_min     date;
  v_max     date;
  v_dim_min date;
  v_dim_max date;
  v_fora    int;
  v_erros   text[] := '{}';
BEGIN
  SELECT count(*) INTO v_total FROM raw.vendas_excel_staging;
  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'total', 0,
      'erros', jsonb_build_array('Nenhuma linha válida na carga — arquivo vazio ou inválido.')
    );
  END IF;

  SELECT min(data_venda), max(data_venda) INTO v_min, v_max
  FROM raw.vendas_excel_staging WHERE data_venda IS NOT NULL;

  SELECT min(data), max(data) INTO v_dim_min, v_dim_max FROM analytics.dim_data;

  SELECT count(*) INTO v_fora
  FROM raw.vendas_excel_staging
  WHERE data_venda IS NOT NULL AND (data_venda < v_dim_min OR data_venda > v_dim_max);

  IF v_fora > 0 THEN
    v_erros := v_erros || format(
      '%s venda(s) com data fora do calendário (%s a %s). Estenda dim_data antes de carregar.',
      v_fora, v_dim_min, v_dim_max);
  END IF;

  RETURN jsonb_build_object(
    'ok',            (array_length(v_erros, 1) IS NULL),
    'total',         v_total,
    'data_min',      v_min,
    'data_max',      v_max,
    'dim_min',       v_dim_min,
    'dim_max',       v_dim_max,
    'fora_do_range', v_fora,
    'erros',         to_jsonb(v_erros)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validar_carga_staging() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.validar_carga_staging() TO service_role;

-- 5. SWAP ATÔMICO: tudo numa transação. Falha em qualquer passo → ROLLBACK →
--    a base de leitura nunca fica vazia. Retorna o mesmo jsonb do transform.
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
  -- Re-validação defensiva ANTES do truncate (mesma transação garante rollback,
  -- mas abortar cedo deixa a mensagem clara e evita trabalho desnecessário).
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
    tipo_contrato, passageiros
  )
  SELECT
    arquivo_origem, linha_origem, venda_numero, data_venda, vendedor, pagante,
    setor_macro, setor, setor_micro, produto, valor_total, receitas, contrato,
    taxa_servico, semana, mes, data_inicio_evento, fornecedor, situacao,
    tipo_contrato, passageiros
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
