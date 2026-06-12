-- ---------------------------------------------------------------------------
-- 0129 — fix(v4.16.0): visibilidade NULL-safe (achado da auto-auditoria §7).
--
-- BUG (pego pela auditoria adversarial): em app.pode_ver_solic / app.sou_atendente,
-- a comparação `destinatario_user_id = uid_jwt()` retorna NULL quando o destinatário
-- é uma ROLE (destinatario_user_id IS NULL). Numa cadeia OR, `false OR NULL OR false`
-- = NULL; e `IF NOT NULL THEN RAISE` NÃO dispara → um terceiro sem relação conseguia
-- VER e CONCLUIR solicitação atribuída a uma role que não é a dele (vazamento).
-- As variantes em WHERE (solic_caixa/minhas/pendencias) já excluíam NULL corretamente.
--
-- FIX: coalesce(..., false) em cada comparação, garantindo boolean estrito.
-- CREATE OR REPLACE preserva grants/REVOKE; mudança aditiva e idempotente.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.pode_ver_solic(p_sol app.solicitacao)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.tem_area('solicitacoes')
      OR coalesce(p_sol.solicitante_id       = app.uid_jwt(),      false)
      OR coalesce(p_sol.destinatario_user_id = app.uid_jwt(),      false)
      OR coalesce(p_sol.destinatario_role_id = app.minha_role_id(), false);
$$;

CREATE OR REPLACE FUNCTION app.sou_atendente(p_sol app.solicitacao)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(p_sol.destinatario_user_id = app.uid_jwt(),      false)
      OR coalesce(p_sol.destinatario_role_id = app.minha_role_id(), false);
$$;

REVOKE EXECUTE ON FUNCTION app.pode_ver_solic(app.solicitacao), app.sou_atendente(app.solicitacao) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
