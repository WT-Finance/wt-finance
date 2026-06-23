-- ---------------------------------------------------------------------------
-- 0156 — feat(v4.25.0): RPC de fan-out para notificação por e-mail das Solicitações.
--
-- DECLARAÇÃO (CLAUDE.md): migration ADITIVA / retrocompatível com a main viva.
--   • O que faz: CRIA a função public.solic_emails_envolvidos(bigint) — NADA mais.
--   • Aditiva: só CREATE FUNCTION + REVOKE/GRANT. NÃO altera tabela, NÃO escreve em
--     dado pré-existente, NÃO toca objeto existente. Retrocompatível (nada a consome ainda).
--
-- PROPÓSITO: dada uma solicitação, resolver os e-mails dos ENVOLVIDOS (autor +
-- destinatário usuário OU todos os membros ATIVOS da role destinatária) + o contexto
-- mínimo p/ o corpo do e-mail. Chamada pelas server actions após cada movimentação.
--
-- SEGURANÇA (invariante v4.25): NÃO vaza a lista de usuários. Gated por
-- app.pode_ver_solic(v_sol) — só quem já pode VER a solicitação obtém os e-mails dela
-- (autor/atendente/gestão), e SÓ os e-mails daquela solicitação (nunca um diretório).
-- Born-hardened: REVOKE de PUBLIC/anon; GRANT só a authenticated/service_role (anon nunca).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solic_emails_envolvidos(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sol    app.solicitacao;
  v_emails text[];
BEGIN
  PERFORM app.exigir_acesso();                       -- autenticado ATIVO (barra anon/inativo)

  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA: solicitação % inexistente', p_id USING ERRCODE = 'P0002';
  END IF;

  -- Gate central: só quem pode VER a solicitação obtém os e-mails dela.
  IF NOT app.pode_ver_solic(v_sol) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: sem acesso à solicitação %', p_id USING ERRCODE = '42501';
  END IF;

  -- Envolvidos (DISTINCT): autor (sempre) + destinatário usuário (sempre, atribuído
  -- explícito) OU todos os membros ATIVOS da role destinatária. SÓ os desta solicitação.
  SELECT array_agg(DISTINCT e) INTO v_emails FROM (
    SELECT email AS e FROM app.rbac_usuarios
      WHERE user_id = v_sol.solicitante_id
    UNION
    SELECT email FROM app.rbac_usuarios
      WHERE v_sol.destinatario_user_id IS NOT NULL AND user_id = v_sol.destinatario_user_id
    UNION
    SELECT email FROM app.rbac_usuarios
      WHERE v_sol.destinatario_role_id IS NOT NULL AND role_id = v_sol.destinatario_role_id AND ativo
  ) s
  WHERE e IS NOT NULL;

  RETURN jsonb_build_object(
    'tipo_nome',     (SELECT nome FROM app.solicitacao_tipo WHERE id = v_sol.tipo_id),
    'autor_email',   (SELECT email FROM app.rbac_usuarios WHERE user_id = v_sol.solicitante_id),
    'atribuido_tipo', CASE WHEN v_sol.destinatario_user_id IS NOT NULL THEN 'usuario' ELSE 'role' END,
    'atribuido_rotulo', CASE
      WHEN v_sol.destinatario_user_id IS NOT NULL
        THEN (SELECT email FROM app.rbac_usuarios WHERE user_id = v_sol.destinatario_user_id)
      ELSE (SELECT nome FROM app.rbac_roles WHERE id = v_sol.destinatario_role_id)
    END,
    'envolvidos_emails', coalesce(to_jsonb(v_emails), '[]'::jsonb)
  );
END;
$$;

-- Born-hardened: anon nunca; só authenticated (caminho da UI) e service_role.
REVOKE EXECUTE ON FUNCTION public.solic_emails_envolvidos(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_emails_envolvidos(bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
