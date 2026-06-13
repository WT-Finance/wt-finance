-- ---------------------------------------------------------------------------
-- 0135 — v4.17.0 Balde 3 (imediato): trava de concorrência na carga de Vendas (M3)
-- + aviso não-bloqueante de degradação de operacao_propria (op_propria).
--
-- PLANO/ÂNCORA (2026-06-13): CREATE OR REPLACE de funções, aditivo, NÃO escreve em
-- dados pré-existentes. Backup do dia com restore testado feito antes da 1ª migration.
--
-- M3: a staging de Vendas é compartilhada e sem lock → dois uploads concorrentes
-- podiam interleave (um truncando a staging enquanto o outro promovia) e corromper a
-- base. Adicionamos pg_advisory_xact_lock(4017001) — MESMA chave — no início de
-- limpar/inserir/promover. O lock é transacional (liberado no commit/rollback de cada
-- chamada): dois promover serializam (o 2º espera o 1º); e um upload concorrente não
-- consegue truncar/inserir na staging enquanto um promover segura o lock. Chave fixa
-- 4017001 (4017 = v4.17, 001 = pipeline de vendas).
--
-- op_propria: validar_carga_staging passa a comparar o preenchimento de operacao_propria
-- da staging com o da base viva e emite AVISO (não-bloqueante, array `avisos`) se cair
-- abruptamente — detecta a origem parar de popular operacao_propria (a regressão
-- silenciosa da v4.9.x). Não altera `ok`/`erros` (continua promovendo).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.limpar_staging_vendas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(4017001); -- serializa o pipeline de carga de Vendas
  TRUNCATE raw.vendas_excel_staging RESTART IDENTITY;
END;
$function$;

CREATE OR REPLACE FUNCTION public.inserir_lote_staging(p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  linha jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(4017001); -- mesma chave do pipeline de carga de Vendas
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
$function$;

CREATE OR REPLACE FUNCTION public.promover_carga_vendas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_total   int;
  v_fora    int;
  v_dim_min date;
  v_dim_max date;
  v_result  jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(4017001); -- M3: serializa o swap (2º promover espera o 1º)

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
$function$;

CREATE OR REPLACE FUNCTION public.validar_carga_staging()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_total      int;
  v_min        date;
  v_max        date;
  v_dim_min    date;
  v_dim_max    date;
  v_fora       int;
  v_setor_fora int;
  v_setor_vals text;
  v_erros      text[] := '{}';
  v_avisos     text[] := '{}';
  v_prod_total int;
  v_prod_pct   numeric;
  v_stg_pct    numeric;
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

  -- Guarda de setor/setor_micro (0132): linhas que o INNER JOIN do transform descartaria.
  SELECT count(*) INTO v_setor_fora
  FROM raw.vendas_excel_staging s
  WHERE NOT EXISTS (SELECT 1 FROM analytics.dim_setor d        WHERE d.nome  = TRIM(s.setor))
     OR NOT EXISTS (SELECT 1 FROM analytics.dim_setor_micro dm WHERE dm.nome = TRIM(s.setor_micro));

  IF v_setor_fora > 0 THEN
    SELECT string_agg(DISTINCT q, ', ' ORDER BY q) INTO v_setor_vals
    FROM (
      SELECT 'setor=«'        || coalesce(NULLIF(TRIM(s.setor), ''), '∅')       || '»' AS q
        FROM raw.vendas_excel_staging s
        WHERE NOT EXISTS (SELECT 1 FROM analytics.dim_setor d WHERE d.nome = TRIM(s.setor))
      UNION
      SELECT 'setor_micro=«' || coalesce(NULLIF(TRIM(s.setor_micro), ''), '∅') || '»'
        FROM raw.vendas_excel_staging s
        WHERE NOT EXISTS (SELECT 1 FROM analytics.dim_setor_micro dm WHERE dm.nome = TRIM(s.setor_micro))
    ) t;

    v_erros := v_erros || format(
      '%s venda(s) com setor/setor_micro fora das dimensões (seriam descartadas em silêncio pelo transform): %s. Atualize analytics.dim_setor/dim_setor_micro antes de carregar.',
      v_setor_fora, left(v_setor_vals, 300));
  END IF;

  -- op_propria: AVISO não-bloqueante se o preenchimento de operacao_propria cair
  -- abruptamente vs a base viva (origem parou de popular → regressão silenciosa v4.9.x).
  SELECT count(*) INTO v_prod_total FROM raw.vendas_excel;
  IF v_prod_total > 0 THEN
    SELECT round(100.0 * count(*) FILTER (WHERE operacao_propria IS NOT NULL AND operacao_propria <> '') / count(*), 1)
      INTO v_prod_pct FROM raw.vendas_excel;
    SELECT round(100.0 * count(*) FILTER (WHERE operacao_propria IS NOT NULL AND operacao_propria <> '') / count(*), 1)
      INTO v_stg_pct FROM raw.vendas_excel_staging;
    IF v_prod_pct > 0 AND v_stg_pct < v_prod_pct / 2 THEN
      v_avisos := v_avisos || format(
        'operacao_propria preenchida em %s%% da carga vs %s%% da base atual — queda abrupta. Verifique se a origem (ERP) ainda exporta a coluna. A carga prossegue.',
        v_stg_pct, v_prod_pct);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok',            (array_length(v_erros, 1) IS NULL),
    'total',         v_total,
    'data_min',      v_min,
    'data_max',      v_max,
    'dim_min',       v_dim_min,
    'dim_max',       v_dim_max,
    'fora_do_range', v_fora,
    'setor_fora',    v_setor_fora,
    'erros',         to_jsonb(v_erros),
    'avisos',        to_jsonb(v_avisos)
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
