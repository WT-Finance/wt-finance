-- 0063: RPCs SECURITY DEFINER para raw.fluxo_caixa_titulos
-- Padrão obrigatório: schemas raw não expostos via PostgREST (ADR-0061)

CREATE OR REPLACE FUNCTION public.contar_fluxo_caixa_titulos()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COUNT(*)::integer FROM raw.fluxo_caixa_titulos;
$$;

CREATE OR REPLACE FUNCTION public.truncar_fluxo_caixa_titulos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  TRUNCATE raw.fluxo_caixa_titulos RESTART IDENTITY;
END;
$$;

CREATE OR REPLACE FUNCTION public.inserir_lote_fluxo_caixa_titulos(p_lote JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n INTEGER;
BEGIN
  INSERT INTO raw.fluxo_caixa_titulos (
    arquivo_origem, numero, emissao, pessoa, documento, observacoes,
    descricao, conta_previsao, vencimento, liquidacao,
    valor, valor_final, tipo, status, data_final, mes_ano
  )
  SELECT
    x->>'arquivo_origem',
    NULLIF(x->>'numero',         ''),
    (NULLIF(x->>'emissao',       ''))::DATE,
    NULLIF(x->>'pessoa',         ''),
    NULLIF(x->>'documento',      ''),
    NULLIF(x->>'observacoes',    ''),
    NULLIF(x->>'descricao',      ''),
    NULLIF(x->>'conta_previsao', ''),
    (NULLIF(x->>'vencimento',    ''))::DATE,
    (NULLIF(x->>'liquidacao',    ''))::DATE,
    (NULLIF(x->>'valor',         ''))::NUMERIC(18,2),
    (NULLIF(x->>'valor_final',   ''))::NUMERIC(18,2),
    x->>'tipo',
    x->>'status',
    (x->>'data_final')::DATE,
    x->>'mes_ano'
  FROM jsonb_array_elements(p_lote) AS x;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.contar_fluxo_caixa_titulos()              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.truncar_fluxo_caixa_titulos()             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_fluxo_caixa_titulos(JSONB)   FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.contar_fluxo_caixa_titulos()               TO service_role;
GRANT  EXECUTE ON FUNCTION public.truncar_fluxo_caixa_titulos()              TO service_role;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_fluxo_caixa_titulos(JSONB)    TO service_role;
