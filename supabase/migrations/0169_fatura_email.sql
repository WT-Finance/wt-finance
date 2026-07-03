-- ---------------------------------------------------------------------------
-- 0169 — feat(v4.35.0/M1): app.fatura_email — registro de ENVIO de e-mail de fatura
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria a tabela NOVA app.fatura_email (registro/rastreabilidade do ENVIO dos
--     e-mails de fatura — boleto/nota anexados — Fase 4a) + 3 RPCs novas
--     (registrar_email = INSERT append-only; email_existentes = leitura das enviadas POR MODO;
--     buscar_docs_fatura = leitura read-only das URLs de boleto/nota p/ anexar) + GRANTs.
--     RLS deny-by-default.
--   • ADITIVA: só CREATE de objetos NOVOS + GRANT. NÃO altera tabela/coluna/dado pré-existente.
--     As escritas (INSERT) vivem DENTRO do corpo de função (não top-level) e só tocam a tabela
--     NOVA — não há escrita-no-mundo no apply da migration.
--   • CONTEXTO: 3ª tabela de escrita-no-mundo do Faturamento (após fatura_emissao/0162 e
--     fatura_nota/0163). O e-mail SAI DE VERDADE — nesta fase (4a) só o MODO TESTE é alcançável
--     (a action recusa modo real; a virada é 4b). O registro guarda os destinatários REAIS
--     (para onde iria) E os EFETIVOS (para onde foi — em teste, o override).
--   • IDEMPOTÊNCIA POR MODO, SEM UNIQUE (DELIBERADO): a tabela é APPEND-ONLY (sem UNIQUE em
--     fatura_cliente_no) porque o reenvio deliberado é legítimo (4b). A idempotência é por
--     CONSULTA: email_existentes(refs, modo) devolve as refs com envio bem-sucedido NAQUELE
--     modo, e o fluxo pula por default. Enviada em TESTE não conta como enviada em REAL (senão a
--     virada de produção pularia tudo que foi testado). ⚠ NÃO adicionar UNIQUE — a ausência é
--     decisão de desenho documentada (auto-auditoria: não "corrigir").
--   • Reversão (manual, destrutiva): DROP das 3 funções + DROP TABLE app.fatura_email.
-- ---------------------------------------------------------------------------

-- 1) Tabela de registro do envio. SEM UNIQUE (append-only; reenvio legítimo). Guarda reais E
--    efetivos (a verdade do disparo), anexos incluídos, modo, sucesso/erro, quem/quando.
CREATE TABLE IF NOT EXISTS app.fatura_email (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fatura_cliente_no      text NOT NULL,                         -- a fatura (SEM unique — reenvio legítimo)
  modo                   text NOT NULL CHECK (modo IN ('teste','real')),  -- chave da idempotência por modo
  destinatarios_reais    jsonb,                                 -- para onde IRIA no modo real (pós-split/validação)
  destinatarios_efetivos jsonb,                                 -- para onde FOI de fato (em teste = o override)
  anexos                 jsonb,                                 -- o que foi anexado, ex. {"boleto":true,"nota":false}
  sucesso                boolean NOT NULL,
  erro                   text,                                  -- motivo quando sucesso=false (SMTP/fetch/etc.)
  enviado_por            uuid,                                  -- auth.uid() de quem disparou
  enviado_em             timestamptz NOT NULL DEFAULT now()
);

-- RLS deny-by-default (postura dos 6 schemas, 0123): sem policy → acesso direto negado.
-- O app nunca toca app.* direto; as RPCs SECURITY DEFINER (owner postgres) ignoram RLS.
ALTER TABLE app.fatura_email ENABLE ROW LEVEL SECURITY;

-- 2) Leitura POR MODO: quais refs JÁ têm envio bem-sucedido NAQUELE modo. O fluxo pula por
--    default (idempotência). Enviada em teste NÃO aparece para o modo real (e vice-versa).
CREATE OR REPLACE FUNCTION public.email_existentes(p_refs text[], p_modo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  SELECT COALESCE(jsonb_agg(DISTINCT fatura_cliente_no), '[]'::jsonb)
  INTO v
  FROM app.fatura_email
  WHERE fatura_cliente_no = ANY (p_refs) AND modo = p_modo AND sucesso = true;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.email_existentes(text[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.email_existentes(text[], text) TO authenticated, service_role;

-- 3) INSERT append-only do registro. Captura enviado_por = auth.uid(). SEM ON CONFLICT
--    (sem UNIQUE): cada tentativa (sucesso OU erro) é uma linha — rastreabilidade total,
--    inclusive reenvios e falhas.
CREATE OR REPLACE FUNCTION public.registrar_email(p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);

  INSERT INTO app.fatura_email (
    fatura_cliente_no, modo, destinatarios_reais, destinatarios_efetivos, anexos, sucesso, erro, enviado_por
  ) VALUES (
    p_dados->>'fatura_cliente_no',
    p_dados->>'modo',
    p_dados->'destinatarios_reais',
    p_dados->'destinatarios_efetivos',
    p_dados->'anexos',
    COALESCE((p_dados->>'sucesso')::boolean, false),
    p_dados->>'erro',
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.registrar_email(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_email(jsonb) TO authenticated, service_role;

-- 4) Leitura read-only dos DOCUMENTOS de cada fatura — o insumo dos anexos. Por fatura
--    (fatura_cliente_no com boleto BEM-SUCEDIDO): as URLs do boleto (bank_slip_url/invoice_url)
--    + a "melhor" nota ligada (autorizada+pdf preferida). O schema `app` não é acessível via
--    .from() — daí a RPC. A regra da nota (autorizada → anexa; pendente → não-enviável) é
--    aplicada na ACTION a partir de nota_status (aqui só devolvemos os fatos).
CREATE OR REPLACE FUNCTION public.buscar_docs_fatura(p_refs text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'fatura_cliente_no', e.fatura_cliente_no,
    'pessoa_nome',       e.pessoa_nome,
    'bank_slip_url',     e.bank_slip_url,
    'invoice_url',       e.invoice_url,
    'boleto_status',     e.status,
    'nota_pdf_url',      n.pdf_url,
    'nota_status',       n.status,
    'nota_number',       n.number
  )), '[]'::jsonb)
  INTO v
  FROM app.fatura_emissao e
  LEFT JOIN LATERAL (
    -- a "melhor" nota da fatura: autorizada com pdf primeiro; senão a mais recente (revela
    -- "pendente" para a action bloquear). fatura_nota.fatura_cliente_no = ref (sem sufixo).
    SELECT fn.pdf_url, fn.status, fn.number
    FROM app.fatura_nota fn
    WHERE fn.fatura_cliente_no = e.fatura_cliente_no
    ORDER BY (fn.status = 'AUTHORIZED' AND fn.pdf_url IS NOT NULL) DESC,
             (fn.modo = 'normal') DESC,
             fn.emitido_em DESC
    LIMIT 1
  ) n ON true
  WHERE e.fatura_cliente_no = ANY (p_refs)
    AND e.asaas_payment_id IS NOT NULL;   -- só faturas com boleto bem-sucedido
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.buscar_docs_fatura(text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.buscar_docs_fatura(text[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
