-- ---------------------------------------------------------------------------
-- 0172 — feat(v4.38.0/M1): juros/multa aplicados em app.fatura_emissao + leituras de resultado.
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ:
--     (1) ALTER TABLE app.fatura_emissao: colunas juros_aplicado / multa_aplicada (int, NULL).
--         Registram o percentual EFETIVAMENTE aplicado no boleto (juros=interest, multa=fine)
--         no momento da emissão NOVA. Registros antigos ficam NULL (a UI exibe "—" — NUNCA
--         inventa 2%/2% retroativo). Boleto "já existia" (não criado nesta emissão) também
--         grava NULL — não sabemos o que o Asaas aplicou na criação original.
--     (2) CREATE OR REPLACE registrar_emissao (def viva vem da 0162) — CONHECE as 2 colunas
--         novas no INSERT e no ON CONFLICT DO UPDATE. O guard `asaas_payment_id IS NULL`
--         mantém: as colunas novas só "pegam" na 1ª gravação de sucesso (nunca sobrescrevem).
--     (3) 2 RPCs de LEITURA novas (padrão inline) para os modais de resultado + re-hidratação:
--         resultado_boletos(p_refs) e resultado_notas(p_refs). NÃO filtram por sucesso —
--         trazem também os que FALHARAM (status='erro'), pois o modal mostra emitido/falhou.
--   • ADITIVA / retrocompatível: só ADD COLUMN NULL + CREATE OR REPLACE (as RPCs de leitura são
--     novas; registrar_emissao só ACRESCENTA colunas). NÃO reescreve dado pré-existente.
--     Lógica de emissão/envio INALTERADA (as actions só passam a mandar os aplicados no p_dados).
-- ---------------------------------------------------------------------------

-- 1. Colunas dos aplicados (aditivas; NULL = desconhecido/antigo → "—" na UI).
ALTER TABLE app.fatura_emissao
  ADD COLUMN IF NOT EXISTS juros_aplicado int,
  ADD COLUMN IF NOT EXISTS multa_aplicada int;

-- 2. registrar_emissao — agora conhece juros_aplicado/multa_aplicada (só gravam na 1ª sucesso).
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
    status, bank_slip_url, invoice_url, nosso_numero, ambiente, emitido_por, erro,
    juros_aplicado, multa_aplicada
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
    p_dados->>'erro',
    NULLIF(p_dados->>'juros_aplicado', '')::int,
    NULLIF(p_dados->>'multa_aplicada', '')::int
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
    erro              = EXCLUDED.erro,
    juros_aplicado    = EXCLUDED.juros_aplicado,
    multa_aplicada    = EXCLUDED.multa_aplicada
  WHERE app.fatura_emissao.asaas_payment_id IS NULL  -- nunca sobrescreve emissão bem-sucedida
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.registrar_emissao(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_emissao(jsonb) TO authenticated, service_role;

-- 3. resultado_boletos(p_refs) — estado do BOLETO por ref (inclui os que falharam). Serve o modal
--    de resultado de boletos + a re-hidratação. fatura_cliente_no é UNIQUE → 1 linha por ref.
CREATE OR REPLACE FUNCTION public.resultado_boletos(p_refs text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'fatura_cliente_no', e.fatura_cliente_no,
    'pessoa_nome',       e.pessoa_nome,
    'valor',             e.valor,
    'vencimento',        e.vencimento,
    'asaas_payment_id',  e.asaas_payment_id,
    'status',            e.status,
    'bank_slip_url',     e.bank_slip_url,
    'invoice_url',       e.invoice_url,
    'juros_aplicado',    e.juros_aplicado,
    'multa_aplicada',    e.multa_aplicada,
    'erro',              e.erro
  ) ORDER BY e.pessoa_nome), '[]'::jsonb)
  INTO v
  FROM app.fatura_emissao e
  WHERE e.fatura_cliente_no = ANY (p_refs);
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resultado_boletos(text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resultado_boletos(text[]) TO authenticated, service_role;

-- 4. resultado_notas(p_refs) — estado da NOTA por ref (inclui falhas). Serve o modal de notas +
--    a re-hidratação (invoice_id p/ o "Atualizar status" funcionar pós-reload — fecha o follow-up
--    da Fase 2). Uma ref pode ter normal E avulsa (external_reference distintos) — devolve ambas.
CREATE OR REPLACE FUNCTION public.resultado_notas(p_refs text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'external_reference', n.external_reference,
    'fatura_cliente_no',  n.fatura_cliente_no,
    'pessoa_nome',        e.pessoa_nome,
    'modo',               n.modo,
    'valor',              n.valor,
    'status',             n.status,
    'number',             n.number,
    'pdf_url',            n.pdf_url,
    'asaas_invoice_id',   n.asaas_invoice_id,
    'erro',               n.erro
  ) ORDER BY e.pessoa_nome, n.modo), '[]'::jsonb)
  INTO v
  FROM app.fatura_nota n
  LEFT JOIN app.fatura_emissao e ON e.fatura_cliente_no = n.fatura_cliente_no
  WHERE n.fatura_cliente_no = ANY (p_refs);
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resultado_notas(text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resultado_notas(text[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
