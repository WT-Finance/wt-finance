-- ---------------------------------------------------------------------------
-- 0163 — feat(v4.32.0/M2): app.fatura_nota — registro de emissão de NOTAS FISCAIS (NFS-e)
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria a tabela NOVA app.fatura_nota (registro/rastreabilidade da emissão de
--     NFS-e via Asaas — ciclo ASSÍNCRONO, status que evolui) + 3 RPCs novas (registrar_nota =
--     UPSERT que não sobrescreve nota já criada; atualizar_status_nota = refresh do status/pdf;
--     nota_existentes = leitura das já criadas) + GRANTs. RLS deny-by-default.
--   • ADITIVA: só CREATE de objetos NOVOS + GRANT. NÃO altera tabela/coluna/dado pré-existente.
--     As escritas (INSERT/UPDATE) vivem DENTRO do corpo das funções (não top-level), e só tocam
--     a tabela NOVA — não há escrita-no-mundo no apply da migration.
--   • CONTEXTO: 2ª tabela de escrita-no-mundo (após app.fatura_emissao/boletos, 0162). A NF é
--     documento fiscal (irreversível). Tabela SEPARADA da fatura_emissao: a NF tem ciclo próprio
--     assíncrono e valor que pode diferir do boleto. Ligadas por fatura_cliente_no.
--   • Reversão (manual, destrutiva): DROP das 3 funções + DROP TABLE app.fatura_nota.
-- ---------------------------------------------------------------------------

-- 1) Tabela de registro da NF. external_reference UNIQUE = idempotência (normal usa a ref;
--    avulsa usa ref+'-AVULSA' — não colidem). Shape derivado do retorno do Asaas + auditoria.
CREATE TABLE IF NOT EXISTS app.fatura_nota (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_reference text NOT NULL UNIQUE,           -- ref ou ref-AVULSA (idempotência)
  fatura_cliente_no  text,                            -- fatura de origem (sem sufixo) — liga ao boleto
  modo               text NOT NULL CHECK (modo IN ('normal','avulsa')),
  valor              numeric,                          -- valor da NF (= boleto se normal; próprio se avulsa)
  asaas_invoice_id   text,                             -- preenchido = nota criada no Asaas (sucesso)
  asaas_payment_id   text,                             -- boleto vinculado (se houve --link-payment)
  status             text,                             -- SCHEDULED/PENDING/PROCESSING/AUTHORIZED/ERROR/CANCELLED (evolui)
  pdf_url            text,
  xml_url            text,
  number             text,
  rps_number         text,
  verification_code  text,
  ambiente           text NOT NULL,                    -- 'sandbox' | 'producao'
  emitido_por        uuid,                             -- auth.uid() de quem emitiu
  emitido_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz,                      -- muda no refresh de status
  erro               text                              -- code/description do Asaas se falhou
);

-- RLS deny-by-default (postura dos 6 schemas, 0123). O app nunca toca app.* direto; as RPCs
-- SECURITY DEFINER (owner postgres) ignoram RLS.
ALTER TABLE app.fatura_nota ENABLE ROW LEVEL SECURITY;

-- 2) Leitura: quais refs JÁ têm nota criada no Asaas (asaas_invoice_id preenchido). A UI marca
--    e o fluxo PULA — 1ª trava de idempotência (a 2ª é findInvoiceByExternalRef no Asaas).
CREATE OR REPLACE FUNCTION public.nota_existentes(p_refs text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  SELECT COALESCE(jsonb_agg(external_reference), '[]'::jsonb)
  INTO v
  FROM app.fatura_nota
  WHERE external_reference = ANY (p_refs) AND asaas_invoice_id IS NOT NULL;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.nota_existentes(text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.nota_existentes(text[]) TO authenticated, service_role;

-- 3) UPSERT do registro de emissão. Captura emitido_por = auth.uid(). ON CONFLICT atualiza
--    SOMENTE se ainda NÃO houver nota criada (asaas_invoice_id IS NULL) — uma nota já criada
--    NUNCA é sobrescrita por reprocessamento (o status dela evolui via atualizar_status_nota).
CREATE OR REPLACE FUNCTION public.registrar_nota(p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);

  INSERT INTO app.fatura_nota (
    external_reference, fatura_cliente_no, modo, valor, asaas_invoice_id, asaas_payment_id,
    status, pdf_url, xml_url, number, rps_number, verification_code, ambiente, emitido_por, erro
  ) VALUES (
    p_dados->>'external_reference',
    p_dados->>'fatura_cliente_no',
    p_dados->>'modo',
    NULLIF(p_dados->>'valor', '')::numeric,
    p_dados->>'asaas_invoice_id',
    p_dados->>'asaas_payment_id',
    p_dados->>'status',
    p_dados->>'pdf_url',
    p_dados->>'xml_url',
    p_dados->>'number',
    p_dados->>'rps_number',
    p_dados->>'verification_code',
    p_dados->>'ambiente',
    auth.uid(),
    p_dados->>'erro'
  )
  ON CONFLICT (external_reference) DO UPDATE SET
    fatura_cliente_no = EXCLUDED.fatura_cliente_no,
    modo              = EXCLUDED.modo,
    valor             = EXCLUDED.valor,
    asaas_invoice_id  = EXCLUDED.asaas_invoice_id,
    asaas_payment_id  = EXCLUDED.asaas_payment_id,
    status            = EXCLUDED.status,
    pdf_url           = EXCLUDED.pdf_url,
    xml_url           = EXCLUDED.xml_url,
    number            = EXCLUDED.number,
    rps_number        = EXCLUDED.rps_number,
    verification_code = EXCLUDED.verification_code,
    ambiente          = EXCLUDED.ambiente,
    emitido_por       = EXCLUDED.emitido_por,
    emitido_em        = now(),
    erro              = EXCLUDED.erro
  WHERE app.fatura_nota.asaas_invoice_id IS NULL  -- nunca sobrescreve nota já criada
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.registrar_nota(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_nota(jsonb) TO authenticated, service_role;

-- 4) Refresh: atualiza o status/pdf/xml/number da nota (ciclo assíncrono). Atualiza a linha
--    existente por external_reference; NÃO cria linha nova (a nota já foi registrada na emissão).
CREATE OR REPLACE FUNCTION public.atualizar_status_nota(p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);

  UPDATE app.fatura_nota SET
    status            = COALESCE(p_dados->>'status', status),
    pdf_url           = COALESCE(p_dados->>'pdf_url', pdf_url),
    xml_url           = COALESCE(p_dados->>'xml_url', xml_url),
    number            = COALESCE(p_dados->>'number', number),
    rps_number        = COALESCE(p_dados->>'rps_number', rps_number),
    verification_code = COALESCE(p_dados->>'verification_code', verification_code),
    erro              = p_dados->>'erro',
    atualizado_em     = now()
  WHERE external_reference = p_dados->>'external_reference'
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.atualizar_status_nota(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.atualizar_status_nota(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
