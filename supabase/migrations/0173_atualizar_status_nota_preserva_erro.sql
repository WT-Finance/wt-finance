-- 0173 — atualizar_status_nota: PRESERVA o `erro` no refresh (COALESCE). ADITIVA / retrocompatível.
--
-- O QUE FAZ: CREATE OR REPLACE de public.atualizar_status_nota trocando `erro = p_dados->>'erro'`
-- (atribuição incondicional) por `erro = COALESCE(p_dados->>'erro', erro)`.
--
-- POR QUÊ (bug "nota em erro parecendo processando"): o refresh de status (atualizarStatusNotas)
-- manda `erro: null` fixo — como a coluna era sobrescrita sem COALESCE, o 1º refresh APAGAVA o
-- motivo capturado na emissão (ex.: aviso de autorização que falhou). Agora null → mantém o que
-- já havia; só um `erro` NÃO-nulo sobrescreve. Todas as demais colunas já usavam COALESCE — esta
-- fecha a única exceção.
--
-- ADITIVA/RETROCOMPATÍVEL com a `main` viva: mesma assinatura, mesmos GRANTs; muda só a semântica
-- de UMA atribuição (de "apaga" para "preserva"). NÃO escreve em dados pré-existentes (só redefine
-- a função). O UPDATE vive no corpo $$…$$ (não é DML top-level) → classificação = aditiva.

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
    erro              = COALESCE(p_dados->>'erro', erro),
    atualizado_em     = now()
  WHERE external_reference = p_dados->>'external_reference'
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.atualizar_status_nota(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.atualizar_status_nota(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
