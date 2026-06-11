-- v4.14.1 — renomear o rótulo da área admin/acessos: "Usuários & Acessos" →
-- "Usuários e Acessos" (decisão de UX). Espelha o AREA_INFO de src/lib/auth/areas.ts.
-- A CHAVE da área NÃO muda (continua 'admin/acessos'); só o texto exibido, que o
-- modal de Permissões e os chips dos perfis leem de app.rbac_areas (admin_listar_areas).
-- Aditiva e idempotente; nenhum impacto em permissões/guards.

UPDATE app.rbac_areas
SET rotulo = 'Usuários e Acessos'
WHERE area = 'admin/acessos' AND rotulo = 'Usuários & Acessos';

NOTIFY pgrst, 'reload schema';
