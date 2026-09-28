-- 0286 — FONTE DO ROLLBACK: corpos VIVOS (pg_get_functiondef) das 12 funções e a tabela
-- audit.ingestao_log, lidos do catálogo de PRODUÇÃO em 2026-09-28T14:22:44.138Z, ANTES do DROP.
-- Não é migration e não é aplicado por ninguém: é o que se reaplica, à mão, se a 0286 precisar ser
-- desfeita. A fonte certa é o catálogo vivo, não a migration de origem (skill banco-e-rpc).
-- A ACL de cada função está no comentário acima dela; reaplicar o corpo NÃO repõe grants —
-- os GRANT/REVOKE vão logo abaixo de cada corpo.

-- ═════ public.truncar_demonstrativo_competencia()  dono=postgres  acl=postgres=X/postgres service_role=X/postgres
CREATE OR REPLACE FUNCTION public.truncar_demonstrativo_competencia()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  TRUNCATE raw.demonstrativo_competencia RESTART IDENTITY;
END;
$function$
;
REVOKE ALL ON FUNCTION public.truncar_demonstrativo_competencia() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.truncar_demonstrativo_competencia() TO service_role;

-- ═════ public.truncar_lancamentos()  dono=postgres  acl=postgres=X/postgres service_role=X/postgres
CREATE OR REPLACE FUNCTION public.truncar_lancamentos()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  TRUNCATE analytics.fato_lancamento_operacao;
END $function$
;
REVOKE ALL ON FUNCTION public.truncar_lancamentos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.truncar_lancamentos() TO service_role;

-- ═════ public.truncar_lancamentos_movimentacao()  dono=postgres  acl=postgres=X/postgres service_role=X/postgres
CREATE OR REPLACE FUNCTION public.truncar_lancamentos_movimentacao()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  TRUNCATE raw.lancamentos_movimentacao RESTART IDENTITY;
END;
$function$
;
REVOKE ALL ON FUNCTION public.truncar_lancamentos_movimentacao() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.truncar_lancamentos_movimentacao() TO service_role;

-- ═════ public.truncar_titulos_em_aberto()  dono=postgres  acl=postgres=X/postgres service_role=X/postgres
CREATE OR REPLACE FUNCTION public.truncar_titulos_em_aberto()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  TRUNCATE raw.titulos_em_aberto RESTART IDENTITY;
END;
$function$
;
REVOKE ALL ON FUNCTION public.truncar_titulos_em_aberto() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.truncar_titulos_em_aberto() TO service_role;

-- ═════ public.inserir_lote_demonstrativo_competencia(jsonb)  dono=postgres  acl=postgres=X/postgres service_role=X/postgres
CREATE OR REPLACE FUNCTION public.inserir_lote_demonstrativo_competencia(p_linhas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO raw.demonstrativo_competencia (
    arquivo_origem, tipo, grupo, descricao, ano, mes, mes_num, competencia, valor
  )
  SELECT
    x->>'arquivo_origem',
    NULLIF(x->>'tipo',      ''),
    x->>'grupo',
    x->>'descricao',
    (x->>'ano')::INT,
    NULLIF(x->>'mes',       ''),
    (x->>'mes_num')::INT,
    (x->>'competencia')::DATE,
    (x->>'valor')::NUMERIC(18,2)
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$function$
;
REVOKE ALL ON FUNCTION public.inserir_lote_demonstrativo_competencia(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inserir_lote_demonstrativo_competencia(jsonb) TO service_role;

-- ═════ public.inserir_lote_lancamentos(jsonb)  dono=postgres  acl=postgres=X/postgres service_role=X/postgres
CREATE OR REPLACE FUNCTION public.inserir_lote_lancamentos(p_linhas jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count int;
BEGIN
  INSERT INTO analytics.fato_lancamento_operacao
    (lancamento_n, venda_n, pessoa, descricao,
     liquidacao_dt, vencimento_dt, valor, tipo,
     operacao, status, data_final, mes_ano)
  SELECT
    NULLIF(el->>'lancamento_n', '')::bigint,
    NULLIF(el->>'venda_n',      '')::bigint,
    NULLIF(el->>'pessoa',       ''),
    NULLIF(el->>'descricao',    ''),
    NULLIF(el->>'liquidacao_dt','')::date,
    NULLIF(el->>'vencimento_dt','')::date,
    (el->>'valor')::numeric,
    el->>'tipo',
    el->>'operacao',
    NULLIF(el->>'status',    ''),
    NULLIF(el->>'data_final','')::date,
    NULLIF(el->>'mes_ano',   '')
  FROM jsonb_array_elements(p_linhas) AS el;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$
;
REVOKE ALL ON FUNCTION public.inserir_lote_lancamentos(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inserir_lote_lancamentos(jsonb) TO service_role;

-- ═════ public.inserir_lote_lancamentos_movimentacao(jsonb)  dono=postgres  acl=postgres=X/postgres service_role=X/postgres
CREATE OR REPLACE FUNCTION public.inserir_lote_lancamentos_movimentacao(p_linhas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO raw.lancamentos_movimentacao (
    arquivo_origem,
    numero,
    venda_no,
    emissao,
    vencimento,
    liquidacao,
    data_movimentacao,
    pessoa,
    descricao,
    descricao_categoria,
    valor,
    categoria,
    grupo_categoria,
    conta
  )
  SELECT
    x->>'arquivo_origem',
    NULLIF(x->>'numero',              ''),
    (NULLIF(x->>'venda_no',           ''))::BIGINT,
    (NULLIF(x->>'emissao',            ''))::DATE,
    (NULLIF(x->>'vencimento',         ''))::DATE,
    (NULLIF(x->>'liquidacao',         ''))::DATE,
    (NULLIF(x->>'data_movimentacao',  ''))::DATE,
    NULLIF(x->>'pessoa',              ''),
    NULLIF(x->>'descricao',           ''),
    NULLIF(x->>'descricao_categoria', ''),
    (x->>'valor')::NUMERIC(18,2),
    NULLIF(x->>'categoria',           ''),
    NULLIF(x->>'grupo_categoria',     ''),
    NULLIF(x->>'conta',               '')
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$function$
;
REVOKE ALL ON FUNCTION public.inserir_lote_lancamentos_movimentacao(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inserir_lote_lancamentos_movimentacao(jsonb) TO service_role;

-- ═════ public.inserir_lote_titulos_em_aberto(jsonb)  dono=postgres  acl=postgres=X/postgres service_role=X/postgres
CREATE OR REPLACE FUNCTION public.inserir_lote_titulos_em_aberto(p_linhas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO raw.titulos_em_aberto (
    arquivo_origem,
    numero,
    venda_no,
    emissao,
    vencimento,
    liquidacao,
    pessoa,
    descricao,
    descricao_categoria,
    valor,
    categoria,
    grupo_categoria,
    conta
  )
  SELECT
    x->>'arquivo_origem',
    NULLIF(x->>'numero',              ''),
    (NULLIF(x->>'venda_no',           ''))::BIGINT,
    (NULLIF(x->>'emissao',            ''))::DATE,
    (NULLIF(x->>'vencimento',         ''))::DATE,
    (NULLIF(x->>'liquidacao',         ''))::DATE,
    NULLIF(x->>'pessoa',              ''),
    NULLIF(x->>'descricao',           ''),
    NULLIF(x->>'descricao_categoria', ''),
    (x->>'valor')::NUMERIC(18,2),
    NULLIF(x->>'categoria',           ''),
    NULLIF(x->>'grupo_categoria',     ''),
    NULLIF(x->>'conta',               '')
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$function$
;
REVOKE ALL ON FUNCTION public.inserir_lote_titulos_em_aberto(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inserir_lote_titulos_em_aberto(jsonb) TO service_role;

-- ═════ public.inserir_lote_raw(jsonb)  dono=postgres  acl=postgres=X/postgres service_role=X/postgres
CREATE OR REPLACE FUNCTION public.inserir_lote_raw(p_linhas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      fornecedor,
      situacao,
      tipo_contrato,
      passageiros,
      operacao_propria
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
      linha->>'fornecedor',
      NULLIF(linha->>'situacao', ''),
      NULLIF(linha->>'tipo_contrato', ''),
      NULLIF(linha->>'passageiros', ''),
      NULLIF(linha->>'operacao_propria', '')
    );
  END LOOP;
END;
$function$
;
REVOKE ALL ON FUNCTION public.inserir_lote_raw(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inserir_lote_raw(jsonb) TO service_role;

-- ═════ public.promover_carga_vendas()  dono=postgres  acl=postgres=X/postgres service_role=X/postgres ingestor=X/postgres
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
$function$
;
REVOKE ALL ON FUNCTION public.promover_carga_vendas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promover_carga_vendas() TO ingestor;
GRANT EXECUTE ON FUNCTION public.promover_carga_vendas() TO service_role;
-- COMMENT vivo (obj_description) — a única das 12 funções que tinha comentário no catálogo; a
-- tabela e as colunas de audit.ingestao_log não têm nenhum (conferido em 28/09).
COMMENT ON FUNCTION public.promover_carga_vendas() IS 'Promove a staging de Vendas para as tabelas finais (jsonb com contagens). SEM exigir_acesso no corpo POR DESENHO: é RPC de carga, protegida por GRANT — só service_role executa. Abre com pg_advisory_xact_lock(4017001), que serializa limpar→inserir→promover e impede interleave de dois uploads concorrentes (0135). Promove TUDO o que está na staging: a staging é volume total, não incremental.';

-- ═════ public.truncate_dynamic_tables()  dono=postgres  acl=postgres=X/postgres service_role=X/postgres
CREATE OR REPLACE FUNCTION public.truncate_dynamic_tables()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  TRUNCATE
    analytics.fato_venda_item,
    analytics.fato_venda,
    analytics.dim_produto,
    analytics.dim_pagante,
    analytics.dim_vendedor,
    raw.vendas_excel
  RESTART IDENTITY CASCADE;
END;
$function$
;
REVOKE ALL ON FUNCTION public.truncate_dynamic_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.truncate_dynamic_tables() TO service_role;

-- ═════ public.registrar_ingestao_log(text,text,integer,text)  dono=postgres  acl=postgres=X/postgres service_role=X/postgres
CREATE OR REPLACE FUNCTION public.registrar_ingestao_log(p_fonte text, p_status text, p_registros integer DEFAULT NULL::integer, p_erro text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO audit.ingestao_log (
    fonte, iniciado_em, finalizado_em, status, registros_processados, erro_mensagem
  ) VALUES (
    p_fonte,
    now(),
    now(),
    p_status,
    p_registros,
    p_erro
  );
END;
$function$
;
REVOKE ALL ON FUNCTION public.registrar_ingestao_log(text,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_ingestao_log(text,text,integer,text) TO service_role;

-- ═════ audit.ingestao_log (estrutura + as 10 linhas)
-- A sequence é da coluna (deptype 'a'): o DROP TABLE a leva junto, então o rollback a recria antes.
CREATE SEQUENCE audit.ingestao_log_id_seq;
CREATE TABLE audit.ingestao_log (
  id bigint DEFAULT nextval('audit.ingestao_log_id_seq'::regclass) NOT NULL,
  fonte text NOT NULL,
  iniciado_em timestamp with time zone NOT NULL,
  finalizado_em timestamp with time zone,
  status text NOT NULL,
  registros_processados integer,
  erro_mensagem text,
  CONSTRAINT ingestao_log_pkey PRIMARY KEY (id),
  CONSTRAINT ingestao_log_status_check CHECK ((status = ANY (ARRAY['sucesso'::text, 'falha'::text, 'em_progresso'::text])))
);
-- ACL da tabela: {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- ACL da sequence: {postgres=rwU/postgres,service_role=rwU/postgres}
ALTER SEQUENCE audit.ingestao_log_id_seq OWNED BY audit.ingestao_log.id;
REVOKE ALL ON TABLE audit.ingestao_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE audit.ingestao_log TO service_role;
REVOKE ALL ON SEQUENCE audit.ingestao_log_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE audit.ingestao_log_id_seq TO service_role;
INSERT INTO audit.ingestao_log (id, fonte, iniciado_em, finalizado_em, status, registros_processados, erro_mensagem) VALUES ('1', 'seed-2026-04-29', '2026-04-29T18:37:50.374Z', '2026-04-29T18:37:50.374Z', 'sucesso', 31001, NULL);
INSERT INTO audit.ingestao_log (id, fonte, iniciado_em, finalizado_em, status, registros_processados, erro_mensagem) VALUES ('2', 'seed-2026-04-29', '2026-04-29T18:43:43.774Z', '2026-04-29T18:43:43.774Z', 'sucesso', 31001, NULL);
INSERT INTO audit.ingestao_log (id, fonte, iniciado_em, finalizado_em, status, registros_processados, erro_mensagem) VALUES ('3', 'seed-2026-05-08', '2026-05-08T19:20:51.656Z', '2026-05-08T19:20:51.656Z', 'sucesso', 31377, NULL);
INSERT INTO audit.ingestao_log (id, fonte, iniciado_em, finalizado_em, status, registros_processados, erro_mensagem) VALUES ('4', 'seed-2026-05-11', '2026-05-11T17:54:14.140Z', '2026-05-11T17:54:14.140Z', 'sucesso', 31377, NULL);
INSERT INTO audit.ingestao_log (id, fonte, iniciado_em, finalizado_em, status, registros_processados, erro_mensagem) VALUES ('5', 'seed-2026-05-12', '2026-05-12T17:29:32.450Z', '2026-05-12T17:29:32.450Z', 'sucesso', 31377, NULL);
INSERT INTO audit.ingestao_log (id, fonte, iniciado_em, finalizado_em, status, registros_processados, erro_mensagem) VALUES ('6', 'seed-2026-05-14', '2026-05-14T19:29:47.139Z', '2026-05-14T19:29:47.139Z', 'sucesso', 31604, NULL);
INSERT INTO audit.ingestao_log (id, fonte, iniciado_em, finalizado_em, status, registros_processados, erro_mensagem) VALUES ('7', 'seed-2026-05-14', '2026-05-14T19:39:41.426Z', '2026-05-14T19:39:41.426Z', 'sucesso', 31604, NULL);
INSERT INTO audit.ingestao_log (id, fonte, iniciado_em, finalizado_em, status, registros_processados, erro_mensagem) VALUES ('8', 'seed-2026-05-19', '2026-05-19T16:49:00.769Z', '2026-05-19T16:49:00.769Z', 'sucesso', 31604, NULL);
INSERT INTO audit.ingestao_log (id, fonte, iniciado_em, finalizado_em, status, registros_processados, erro_mensagem) VALUES ('9', 'seed-2026-05-19', '2026-05-19T17:01:55.791Z', '2026-05-19T17:01:55.791Z', 'sucesso', 31744, NULL);
INSERT INTO audit.ingestao_log (id, fonte, iniciado_em, finalizado_em, status, registros_processados, erro_mensagem) VALUES ('10', 'seed-2026-05-21', '2026-05-21T18:30:06.627Z', '2026-05-21T18:30:06.627Z', 'sucesso', 31827, NULL);
SELECT setval('audit.ingestao_log_id_seq', 10);  -- last_value vivo em 28/09
