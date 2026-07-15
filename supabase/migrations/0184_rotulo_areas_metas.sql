-- 0184_rotulo_areas_metas.sql — v5.1.9
-- Rename dos RÓTULOS de exibição das duas áreas de Metas no modal de "Usuários e Acessos".
-- O modal lê o rotulo de app.rbac_areas via admin_listar_areas (AREA_INFO em
-- src/lib/auth/areas.ts é só FALLBACK), então a mudança só aparece na UI depois desta
-- migration. Espelha os novos rótulos do areas.ts. Mesmo precedente da 0168_rotulo_areas.sql.
--
-- DECLARAÇÃO (ADR-0116): esta migration é DESTRUTIVA por classificação — é UPDATE em dado
-- existente (rbac_areas.rotulo). NÃO altera `area` (chave/FK), `grupo`, `ordem`, permissões
-- (rbac_role_permissoes), guards nem RPCs — é só metadado de exibição. Reversível: bloco DOWN
-- abaixo. Aplicada por humano em TTY (`npm run db:migrate -- --destrutiva`) — o agente não aplica.
-- (v5.1.9) 'metas' → 'Metas/Cadastro'; 'metas/acompanhamento' → 'Metas/Acompanhamento'.

UPDATE app.rbac_areas SET rotulo = 'Metas/Cadastro'       WHERE area = 'metas';
UPDATE app.rbac_areas SET rotulo = 'Metas/Acompanhamento' WHERE area = 'metas/acompanhamento';

-- ===== DOWN (reverter os rótulos) =====
--   UPDATE app.rbac_areas SET rotulo = 'Metas'                  WHERE area = 'metas';
--   UPDATE app.rbac_areas SET rotulo = 'Metas — Acompanhamento' WHERE area = 'metas/acompanhamento';
-- ===== fim DOWN =====
