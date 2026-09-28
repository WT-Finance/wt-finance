-- ---------------------------------------------------------------------------
-- 0284 — fix(v6.0.0/M9): a validação de carga de Vendas deixa de cobrar as linhas Welcome
--        contra as dimensões — decisão 8 do briefing v6.0.0; achado da 1ª carga real (M9)
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: `CREATE OR REPLACE FUNCTION public.validar_carga_staging()` com o corpo BYTE A
--     BYTE o do catálogo VIVO (pg_get_functiondef em 25/09/2026, dump insumo fora do repositório)
--     e UMA mudança de regra: a guarda de setor/setor_micro (0132) passa a olhar só as linhas que o
--     transform LÊ — `s.setor_macro IS DISTINCT FROM 'Welcome'`, o MESMO predicado de
--     `analytics.vendas_excel_para_fato` (0277). São três predicados acrescentados: o COUNT da
--     guarda (com parênteses em volta do OR original, para a precedência não mudar) e as duas
--     metades do UNION que monta a mensagem. Nenhuma outra linha muda.
--   • POR QUE: na primeira carga real do cru de Vendas pelo caminho novo (M9, 25/09, arquivos
--     de 21/09), a validação reprovou a carga inteira: "210 venda(s) com setor/setor_micro fora
--     das dimensões … setor_micro=«Welcome», setor=«Welcome»". As 210 linhas Welcome nunca tinham
--     chegado ao banco — o script R as filtrava — e agora entram em raw.vendas_excel de propósito
--     (o checksum do arquivo precisa delas; decisão 8) e ficam FORA do transform pela view. A M5
--     moveu o filtro para a leitura do transform e a M7 (0283) para os seis leitores de
--     raw.vendas_excel; esta guarda lê a STAGING (raw.vendas_excel_staging), que nenhuma das duas
--     enumerou. A guarda existe para proteger o INNER JOIN do transform — e o transform não lê
--     Welcome, então cobrá-las é reprovar por linhas que nunca seriam descartadas.
--   • O QUE NÃO MUDA, de propósito: a guarda de data fora do calendário (dim_data) e o aviso de
--     operacao_propria continuam olhando a staging inteira. A de data é mais rígida que o
--     necessário para as linhas Welcome, mas inofensiva: nesta mesma carga ela PASSOU (a mensagem
--     de erro não a citou), e `promover_carga_vendas` repete a mesma guarda sobre todas as linhas.
--   • ACL/dono/SECURITY DEFINER/search_path preservados pelo CREATE OR REPLACE (assinatura
--     idêntica, sem parâmetros). EXECUTE hoje: postgres, service_role, verificador, ingestor.
--   • Efeito: a carga do cru de Vendas deixa de ser recusada por Welcome; uma linha NÃO-Welcome com
--     setor fora das dimensões continua reprovando exatamente como antes.
--   • Classificação: ADITIVA (só CREATE OR REPLACE de corpo de função, COMMENT e NOTIFY).
--   • Reversão: reaplicar o corpo vivo anterior — é este mesmo arquivo sem os três predicados
--     `s.setor_macro IS DISTINCT FROM 'Welcome'` (e sem os parênteses em volta do OR do COUNT);
--     a última migration que definiu o corpo antes desta é a 0135.
-- ---------------------------------------------------------------------------

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
  -- v6.0.0/0284: só as linhas que o transform LÊ — o mesmo predicado de
  -- analytics.vendas_excel_para_fato (0277). As linhas de Setor Macro = Welcome entram em
  -- raw.vendas_excel (o checksum do arquivo precisa delas) e ficam FORA do transform por decisão
  -- (briefing v6.0.0, decisão 8); cobrá-las contra as dimensões reprovava a carga do cru inteira.
  -- IS DISTINCT FROM, nunca <>: setor_macro é anulável.
  SELECT count(*) INTO v_setor_fora
  FROM raw.vendas_excel_staging s
  WHERE s.setor_macro IS DISTINCT FROM 'Welcome'
    AND (NOT EXISTS (SELECT 1 FROM analytics.dim_setor d        WHERE d.nome  = TRIM(s.setor))
      OR NOT EXISTS (SELECT 1 FROM analytics.dim_setor_micro dm WHERE dm.nome = TRIM(s.setor_micro)));

  IF v_setor_fora > 0 THEN
    SELECT string_agg(DISTINCT q, ', ' ORDER BY q) INTO v_setor_vals
    FROM (
      SELECT 'setor=«'        || coalesce(NULLIF(TRIM(s.setor), ''), '∅')       || '»' AS q
        FROM raw.vendas_excel_staging s
        WHERE s.setor_macro IS DISTINCT FROM 'Welcome'
          AND NOT EXISTS (SELECT 1 FROM analytics.dim_setor d WHERE d.nome = TRIM(s.setor))
      UNION
      SELECT 'setor_micro=«' || coalesce(NULLIF(TRIM(s.setor_micro), ''), '∅') || '»'
        FROM raw.vendas_excel_staging s
        WHERE s.setor_macro IS DISTINCT FROM 'Welcome'
          AND NOT EXISTS (SELECT 1 FROM analytics.dim_setor_micro dm WHERE dm.nome = TRIM(s.setor_micro))
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
$function$
;

COMMENT ON FUNCTION public.validar_carga_staging() IS
  'Valida a staging de Vendas por Produto antes da promoção (jsonb: ok, total, erros, avisos). Guardas: data fora de dim_data (todas as linhas); setor/setor_micro fora das dimensões SÓ nas linhas que o transform lê (setor_macro IS DISTINCT FROM ''Welcome'', o predicado de analytics.vendas_excel_para_fato — v6.0.0/0284); aviso de queda de operacao_propria. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT.';

NOTIFY pgrst, 'reload schema';
