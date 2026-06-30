-- ---------------------------------------------------------------------------
-- 0162 — feat(v4.31.0/M2): app.fatura_emissao — registro de emissão de boletos
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria a tabela NOVA app.fatura_emissao (registro/rastreabilidade da
--     emissão de boletos via Asaas) + 2 RPCs novas (registrar_emissao = UPSERT idempotente;
--     fatura_emissao_existentes = leitura das já-emitidas) + GRANTs. RLS deny-by-default.
--   • ADITIVA: só CREATE de objetos NOVOS + GRANT. NÃO altera tabela/coluna/dado
--     pré-existente. As escritas (INSERT/UPDATE) vivem DENTRO do corpo de função (não
--     top-level), e só tocam a tabela NOVA — não há escrita-no-mundo no apply da migration.
--   • IMPORTANTE: esta é a PRIMEIRA tabela do projeto que registra uma AÇÃO REAL sobre o
--     mundo (boletos emitidos), não dado de ingestão descartável (raw.*). A ESCRITA de
--     verdade ocorre em RUNTIME, via registrar_emissao, chamada pelo fluxo de emissão.
--   • Reversão (manual, destrutiva): DROP das 2 funções + DROP TABLE app.fatura_emissao.
-- ---------------------------------------------------------------------------

-- 1) Tabela de registro. fatura_cliente_no UNIQUE = 2ª trava de idempotência (a 1ª é o
--    externalReference no Asaas). Shape derivado do retorno do Asaas (B3) + ambiente/auditoria.
CREATE TABLE IF NOT EXISTS app.fatura_emissao (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fatura_cliente_no text NOT NULL UNIQUE,
  pessoa_nome       text,
  valor             numeric,
  vencimento        date,
  asaas_customer_id text,
  asaas_payment_id  text,                       -- preenchido = emissão bem-sucedida (ou já-existente)
  status            text,                       -- status do Asaas (ex.: PENDING) ou 'erro'
  bank_slip_url     text,
  invoice_url       text,
  nosso_numero      text,
  ambiente          text NOT NULL,              -- 'sandbox' | 'producao' (rastreio crítico)
  emitido_por       uuid,                        -- auth.uid() de quem emitiu
  emitido_em        timestamptz NOT NULL DEFAULT now(),
  erro              text                         -- code/description do Asaas se falhou (B5)
);

-- RLS deny-by-default (postura dos 6 schemas, 0123): sem policy → acesso direto negado.
-- O app nunca toca app.* direto; as RPCs SECURITY DEFINER (owner postgres) ignoram RLS.
ALTER TABLE app.fatura_emissao ENABLE ROW LEVEL SECURITY;

-- 2) Leitura: quais refs JÁ têm emissão bem-sucedida (asaas_payment_id preenchido). A UI
--    marca como "já emitida" e o fluxo de emissão PULA — espelha a trava do Asaas no nosso lado.
CREATE OR REPLACE FUNCTION public.fatura_emissao_existentes(p_refs text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  SELECT COALESCE(jsonb_agg(fatura_cliente_no), '[]'::jsonb)
  INTO v
  FROM app.fatura_emissao
  WHERE fatura_cliente_no = ANY (p_refs) AND asaas_payment_id IS NOT NULL;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fatura_emissao_existentes(text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fatura_emissao_existentes(text[]) TO authenticated, service_role;

-- 3) UPSERT idempotente do registro. Captura emitido_por = auth.uid(). ON CONFLICT atualiza
--    SOMENTE se a linha ainda NÃO tem sucesso (asaas_payment_id IS NULL) — uma emissão
--    bem-sucedida NUNCA é sobrescrita por reprocessamento (idempotência no nível do banco).
CREATE OR REPLACE FUNCTION public.registrar_emissao(p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);

  INSERT INTO app.fatura_emissao (
    fatura_cliente_no, pessoa_nome, valor, vencimento, asaas_customer_id, asaas_payment_id,
    status, bank_slip_url, invoice_url, nosso_numero, ambiente, emitido_por, erro
  ) VALUES (
    p_dados->>'fatura_cliente_no',
    p_dados->>'pessoa_nome',
    NULLIF(p_dados->>'valor', '')::numeric,
    NULLIF(p_dados->>'vencimento', '')::date,
    p_dados->>'asaas_customer_id',
    p_dados->>'asaas_payment_id',
    p_dados->>'status',
    p_dados->>'bank_slip_url',
    p_dados->>'invoice_url',
    p_dados->>'nosso_numero',
    p_dados->>'ambiente',
    auth.uid(),
    p_dados->>'erro'
  )
  ON CONFLICT (fatura_cliente_no) DO UPDATE SET
    pessoa_nome       = EXCLUDED.pessoa_nome,
    valor             = EXCLUDED.valor,
    vencimento        = EXCLUDED.vencimento,
    asaas_customer_id = EXCLUDED.asaas_customer_id,
    asaas_payment_id  = EXCLUDED.asaas_payment_id,
    status            = EXCLUDED.status,
    bank_slip_url     = EXCLUDED.bank_slip_url,
    invoice_url       = EXCLUDED.invoice_url,
    nosso_numero      = EXCLUDED.nosso_numero,
    ambiente          = EXCLUDED.ambiente,
    emitido_por       = EXCLUDED.emitido_por,
    emitido_em        = now(),
    erro              = EXCLUDED.erro
  WHERE app.fatura_emissao.asaas_payment_id IS NULL  -- nunca sobrescreve emissão bem-sucedida
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.registrar_emissao(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_emissao(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
