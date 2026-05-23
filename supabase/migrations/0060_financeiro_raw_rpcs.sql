-- 0060: RPCs públicas para acesso a raw.lancamentos
-- O schema raw não está exposto via PostgREST, portanto o acesso
-- a raw.lancamentos deve passar por funções SECURITY DEFINER no schema public,
-- seguindo o padrão de inserir_lote_raw/truncate_dynamic_tables.

-- ─────────────────────────────────────────────
-- Truncar raw.lancamentos
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.truncar_lancamentos_financeiro()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = raw, financeiro, public
AS $$
BEGIN
  TRUNCATE financeiro.fato_lancamentos, raw.lancamentos RESTART IDENTITY;
END;
$$;

-- ─────────────────────────────────────────────
-- Inserir lote em raw.lancamentos
-- Cada elemento de p_linhas deve ter os campos:
--   arquivo_origem, numero, venda_no, emissao, vencimento, liquidacao,
--   pessoa, descricao, descricao_categoria, valor,
--   categoria, grupo_categoria, conta
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inserir_lote_lancamentos_financeiro(p_linhas JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = raw, public
AS $$
BEGIN
  INSERT INTO raw.lancamentos (
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
$$;

-- ─────────────────────────────────────────────
-- Contar linhas em raw.lancamentos
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.contar_lancamentos_financeiro()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = raw, public
AS $$
  SELECT COUNT(*) FROM raw.lancamentos;
$$;

GRANT EXECUTE ON FUNCTION public.truncar_lancamentos_financeiro()                     TO service_role;
GRANT EXECUTE ON FUNCTION public.inserir_lote_lancamentos_financeiro(JSONB)           TO service_role;
GRANT EXECUTE ON FUNCTION public.contar_lancamentos_financeiro()                      TO service_role;
