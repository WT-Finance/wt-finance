-- 0061: RPCs públicas para raw.vendas_pagamento e raw.contas_pagar_receber
-- O schema raw não está exposto via PostgREST — mesmo padrão de 0060.

-- ─────────────────────────────────────────────
-- raw.vendas_pagamento
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.contar_vendas_pagamento()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = raw, public
AS $$
  SELECT COUNT(*) FROM raw.vendas_pagamento;
$$;

CREATE OR REPLACE FUNCTION public.truncar_vendas_pagamento()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = raw, public
AS $$
BEGIN
  TRUNCATE raw.vendas_pagamento RESTART IDENTITY;
END;
$$;

CREATE OR REPLACE FUNCTION public.inserir_lote_vendas_pagamento(p_linhas JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = raw, public
AS $$
BEGIN
  INSERT INTO raw.vendas_pagamento (
    arquivo_origem,
    venda_no,       data_venda,      vendedor,        pagante,
    produto,        setor,           setor_macro,     operacao_propria,
    valor_bruto,    desconto,        valor,
    forma_pagamento, conta,          data_baixa,      parcela,
    situacao,       observacao
  )
  SELECT
    x->>'arquivo_origem',
    (x->>'venda_no')::BIGINT,
    (NULLIF(x->>'data_venda',       ''))::DATE,
    NULLIF(x->>'vendedor',           ''),
    NULLIF(x->>'pagante',            ''),
    NULLIF(x->>'produto',            ''),
    NULLIF(x->>'setor',              ''),
    NULLIF(x->>'setor_macro',        ''),
    NULLIF(x->>'operacao_propria',   ''),
    (x->>'valor_bruto')::NUMERIC(18,2),
    (x->>'desconto')::NUMERIC(18,2),
    (x->>'valor')::NUMERIC(18,2),
    NULLIF(x->>'forma_pagamento',    ''),
    NULLIF(x->>'conta',              ''),
    (NULLIF(x->>'data_baixa',       ''))::DATE,
    NULLIF(x->>'parcela',            ''),
    NULLIF(x->>'situacao',           ''),
    NULLIF(x->>'observacao',         '')
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$$;

GRANT EXECUTE ON FUNCTION public.contar_vendas_pagamento()                  TO service_role;
GRANT EXECUTE ON FUNCTION public.truncar_vendas_pagamento()                 TO service_role;
GRANT EXECUTE ON FUNCTION public.inserir_lote_vendas_pagamento(JSONB)       TO service_role;

-- ─────────────────────────────────────────────
-- raw.contas_pagar_receber
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.contar_contas_pagar_receber()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = raw, public
AS $$
  SELECT COUNT(*) FROM raw.contas_pagar_receber;
$$;

CREATE OR REPLACE FUNCTION public.truncar_contas_pagar_receber()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = raw, public
AS $$
BEGIN
  TRUNCATE raw.contas_pagar_receber RESTART IDENTITY;
END;
$$;

CREATE OR REPLACE FUNCTION public.inserir_lote_contas_pagar_receber(p_linhas JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = raw, public
AS $$
BEGIN
  INSERT INTO raw.contas_pagar_receber (
    arquivo_origem,  tipo_movimento,  numero,          venda_no,
    emissao,         vencimento,      liquidacao,
    valor,           valor_final,
    descricao,       categoria,       grupo_categoria, conta,
    pessoa,          fatura_cliente_no, observacoes,   conferido,
    operacao_propria
  )
  SELECT
    x->>'arquivo_origem',
    x->>'tipo_movimento',
    NULLIF(x->>'numero',              ''),
    (x->>'venda_no')::BIGINT,
    (NULLIF(x->>'emissao',            ''))::DATE,
    (NULLIF(x->>'vencimento',         ''))::DATE,
    (NULLIF(x->>'liquidacao',         ''))::DATE,
    (x->>'valor')::NUMERIC(18,2),
    (x->>'valor_final')::NUMERIC(18,2),
    NULLIF(x->>'descricao',           ''),
    NULLIF(x->>'categoria',           ''),
    NULLIF(x->>'grupo_categoria',     ''),
    NULLIF(x->>'conta',               ''),
    NULLIF(x->>'pessoa',              ''),
    NULLIF(x->>'fatura_cliente_no',   ''),
    NULLIF(x->>'observacoes',         ''),
    (x->>'conferido')::BOOLEAN,
    NULLIF(x->>'operacao_propria',    '')
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$$;

GRANT EXECUTE ON FUNCTION public.contar_contas_pagar_receber()              TO service_role;
GRANT EXECUTE ON FUNCTION public.truncar_contas_pagar_receber()             TO service_role;
GRANT EXECUTE ON FUNCTION public.inserir_lote_contas_pagar_receber(JSONB)   TO service_role;
