-- ---------------------------------------------------------------------------
-- 0131 — feat(v4.16.0): concede a área 'solicitacoes' (gestão) à role Administrador.
--
-- A área 'solicitacoes' nasceu na 0127 mas não foi vinculada a nenhuma role; a role
-- Administrador (que é "todas as áreas") não a tinha → o admin não conseguia abrir
-- /admin/solicitacoes (gestão de tipos). Concede aqui, mantendo a consistência de que
-- Administrador tem acesso total. Idempotente e aditivo. Outras roles recebem a área
-- pela UI de Permissões conforme a necessidade.
-- ---------------------------------------------------------------------------

INSERT INTO app.rbac_role_permissoes (role_id, area)
SELECT r.id, 'solicitacoes'
FROM app.rbac_roles r
WHERE r.nome = 'Administrador'
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
