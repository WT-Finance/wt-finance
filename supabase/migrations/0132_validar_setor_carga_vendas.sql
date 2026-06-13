-- ---------------------------------------------------------------------------
-- 0132 — feat(v4.16.2): pré-validação de carga de Vendas também reprova
--        setor/setor_micro desconhecido (guarda contra descarte silencioso).
--
-- ACHADO da auditoria técnica (alta): transform_raw_to_analytics insere fato_venda_item
-- com INNER JOIN em analytics.dim_setor / dim_setor_micro. Se uma carga trouxer um
-- setor/setor_micro novo ou renomeado (ex.: subsetor reclassificado no ERP), TODAS as
-- linhas com aquele valor são SILENCIOSAMENTE descartadas — sem erro, sem rollback (o
-- swap conclui "com sucesso" com menos linhas). É a classe de regressão silenciosa que
-- já custou caro (Data Início v4.9, operacao_propria v4.9.1) e que a pré-validação
-- não-destrutiva (salvaguarda central da v4.12/v4.15) NÃO cobria.
--
-- Esta migration estende validar_carga_staging() para contar as linhas do staging cujo
-- setor OU setor_micro não existe na dimensão (exatamente as que o INNER JOIN dropa) e,
-- havendo qualquer uma, reprovar a carga ANTES do swap — mesmo padrão da checagem de
-- data fora do range. NÃO altera a forma do retorno (só acrescenta string ao array
-- `erros` já existente e zera `ok`), então não há mudança de contrato/schema no app.
--
-- ROLLBACK: re-aplicar a definição da migration 0116 (idêntica, sem o bloco de setor).
-- Mudança é validation-only (não escreve dado); reversível por CREATE OR REPLACE.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validar_carga_staging()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  -- Guarda de setor/setor_micro: conta as linhas que o INNER JOIN do transform
  -- descartaria (setor OU setor_micro ausente na dimensão).
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

  RETURN jsonb_build_object(
    'ok',            (array_length(v_erros, 1) IS NULL),
    'total',         v_total,
    'data_min',      v_min,
    'data_max',      v_max,
    'dim_min',       v_dim_min,
    'dim_max',       v_dim_max,
    'fora_do_range', v_fora,
    'setor_fora',    v_setor_fora,
    'erros',         to_jsonb(v_erros)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validar_carga_staging() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.validar_carga_staging() TO service_role;
