-- 0138 — admin_atualizar_nome (v4.18.0/M1): edição do nome de um usuário.
--
-- DECLARAÇÃO PRÉVIA (âncora / regime autônomo):
--   • O QUE FAZ: CREATE de uma RPC nova `public.admin_atualizar_nome(uuid, text)` —
--     wrapper SECURITY DEFINER que exige a área `admin/acessos` e atualiza
--     `app.rbac_usuarios.nome`. Segue o padrão das demais `admin_*` (0119).
--   • ADITIVA / retrocompatível: só CREATE de função; NÃO altera schema, NÃO escreve
--     em dados pré-existentes na aplicação da migration (só quando chamada). Sem
--     anti-lockout (mudar nome não toca acesso/role/ativo).
--   • Nome vazio é REJEITADO (nullif(btrim(...),'')) — não grava nome em branco.

CREATE OR REPLACE FUNCTION public.admin_atualizar_nome(p_user_id uuid, p_nome text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nome text;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);

  v_nome := nullif(btrim(p_nome), '');
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'NOME_VAZIO: o nome não pode ficar em branco' USING ERRCODE = '22023';
  END IF;

  UPDATE app.rbac_usuarios SET nome = v_nome, atualizado_em = now() WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USUARIO_INEXISTENTE' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_atualizar_nome(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_atualizar_nome(uuid, text) TO authenticated, service_role;
