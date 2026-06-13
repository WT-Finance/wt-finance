-- ---------------------------------------------------------------------------
-- 0136 — v4.17.0 Balde 3: promoção de anexos de solicitação (M17).
--
-- PLANO/ÂNCORA (2026-06-13): cria 1 RPC SECURITY DEFINER + grants; NÃO escreve em
-- dados pré-existentes (só atualiza storage_path dos anexos recém-criados pelo próprio
-- solicitante). Backup do dia feito antes da 1ª migration.
--
-- M17 (decisão do Yan: promover): o upload de anexo grava em tmp/<uuid>/<arq> ANTES
-- de saber o id da solicitação. Após criar_solicitacao, o objeto é movido (storage.move,
-- no server action) para sol/<solicitacao_id>/<uuid>/<arq>. Esta RPC atualiza o
-- storage_path no banco para os pares (de→para) efetivamente movidos. Resultado: tmp/
-- passa a conter SÓ órfãos (uploads que nunca viraram solicitação). Só o SOLICITANTE
-- (quem acabou de criar) promove os próprios anexos; a visibilidade do download
-- (solic_anexo_path) continua inalterada — a promoção não afrouxa acesso.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solic_promover_anexos(p_solicitacao_id bigint, p_de_para jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid;
  v_n   int;
BEGIN
  PERFORM app.exigir_acesso();          -- autenticado ativo
  v_uid := app.uid_jwt();

  -- Só o solicitante promove os próprios anexos (chamada logo após criar_solicitacao).
  IF NOT EXISTS (
    SELECT 1 FROM app.solicitacao s
    WHERE s.id = p_solicitacao_id
      AND coalesce(s.solicitante_id = v_uid, false)
  ) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: somente o solicitante pode promover os anexos'
      USING ERRCODE = '42501';
  END IF;

  UPDATE app.solicitacao_anexo a
  SET storage_path = m.para
  FROM jsonb_to_recordset(p_de_para) AS m(de text, para text)
  WHERE a.solicitacao_id = p_solicitacao_id
    AND a.storage_path = m.de;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.solic_promover_anexos(bigint, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_promover_anexos(bigint, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
