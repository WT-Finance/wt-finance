-- ---------------------------------------------------------------------------
-- 0027 — RPCs públicos para acesso ao analytics schema
--
-- O schema analytics não é exposto pelo PostgREST. Estas funções SECURITY
-- DEFINER no schema public são os únicos pontos de entrada para operações
-- de carga de lançamentos e para leitura de status de upload.
-- ---------------------------------------------------------------------------

-- Status de carga: counts + timestamps de última importação
CREATE OR REPLACE FUNCTION public.get_upload_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'vendas', jsonb_build_object(
      'total',              (SELECT COUNT(*)       FROM analytics.fato_venda),
      'ultima_atualizacao', (SELECT MAX(criado_em) FROM analytics.fato_venda)
    ),
    'lancamentos', jsonb_build_object(
      'total',              (SELECT COUNT(*)          FROM analytics.fato_lancamento_operacao),
      'ultima_atualizacao', (SELECT MAX(importado_em) FROM analytics.fato_lancamento_operacao)
    )
  )
$$;

-- Trunca fato_lancamento_operacao antes de nova carga
CREATE OR REPLACE FUNCTION public.truncar_lancamentos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  TRUNCATE analytics.fato_lancamento_operacao;
END $$;

-- Insere lote de lançamentos recebido como array JSON
CREATE OR REPLACE FUNCTION public.inserir_lote_lancamentos(p_linhas jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
END $$;

-- Wrapper público para analytics.regenerar_dim_operacao_weddings
CREATE OR REPLACE FUNCTION public.regenerar_dim_operacao_weddings()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT analytics.regenerar_dim_operacao_weddings()
$$;
