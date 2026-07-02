-- ---------------------------------------------------------------------------
-- 0166 — feat(v4.34.0): Acervo de Documentos — excluir documento
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria APENAS a RPC NOVA public.acervo_excluir(p_doc_id bigint)
--     (CREATE FUNCTION + REVOKE/GRANT). Nenhum objeto pré-existente (tabela,
--     coluna, área RBAC, outra função) é alterado.
--   • ADITIVA / RETROCOMPATÍVEL: a única escrita em dado (o DELETE de uma linha
--     de app.acervo_documento) vive DENTRO do corpo da função e só executa sob
--     chamada autorizada (exigir_acesso), no momento em que um usuário com a
--     área pedir a exclusão — a migration em si não escreve em nenhuma linha
--     pré-existente ao ser aplicada; é a criação de uma CAPACIDADE nova, não uma
--     migração de dado.
--   • RBAC: reusa a área de gestão já existente 'financeiro/acervo/gestao'
--     (mesma permissão de adicionar documento, 0165) — decisão de produto: quem
--     pode adicionar também pode excluir, sem área nova.
--   • Reversão (manual, destrutiva): DROP FUNCTION public.acervo_excluir(bigint).
-- ---------------------------------------------------------------------------

-- ── Excluir documento — SÓ gestão (mesma área de adicionar, 0165) ───────────
-- Remove a LINHA primeiro (fonte da verdade de "o documento existe"); o binário
-- no Storage é removido DEPOIS, best-effort, pela Server Action (com o
-- `storage_path` devolvido aqui). Ordem escolhida de propósito: se a remoção do
-- binário falhar, sobra um objeto órfão no bucket — inofensivo, pois não há mais
-- registro de metadados apontando pra ele (nunca aparece na listagem, nunca é
-- baixável pela RPC de path). O inverso (apagar o binário antes da linha) seria
-- pior: uma falha no meio deixaria um documento LISTADO cujo download quebra.
CREATE OR REPLACE FUNCTION public.acervo_excluir(p_doc_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_path text;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/acervo/gestao']);

  DELETE FROM app.acervo_documento WHERE id = p_doc_id RETURNING storage_path INTO v_path;

  IF v_path IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADO' USING ERRCODE='42501';
  END IF;

  RETURN jsonb_build_object('storage_path', v_path);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.acervo_excluir(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.acervo_excluir(bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
