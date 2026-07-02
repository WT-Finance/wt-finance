-- 0167_rotulo_areas.sql — v4.33.2
-- (Número 0167: 0165 e 0166 já estão aplicadas em produção pelas migrations do Acervo
--  da branch v4.34.0/PR #160 — confirmado por `npx supabase migration list`. Usar 0165
--  aqui colidiria e o `db push` PULARIA esta migration. 0167 é o próximo livre.)
-- Padronização dos RÓTULOS das áreas de permissão (só metadado de EXIBIÇÃO no modal
-- de "Usuários e Acessos"). O modal lê o rotulo de app.rbac_areas via admin_listar_areas
-- (AREA_INFO em src/lib/auth/areas.ts é só fallback), então a mudança de rótulo só
-- aparece na UI depois desta migration. Espelha os novos rótulos do areas.ts.
--
-- DECLARAÇÃO (ADR-0116): esta migration é DESTRUTIVA por classificação — é UPDATE em
-- dado existente (rbac_areas.rotulo). NÃO altera `area` (chave/FK), `grupo`, `ordem`,
-- permissões nem qualquer vínculo de role↔área — só o texto exibido. Reversível
-- (rótulos anteriores no rodapé). Aplicar com confirmação humana:
--   npm run db:migrate -- --destrutiva
--
-- Mudanças:
--   Performance — X          → Performance/X      (barra, como no menu lateral)
--   Fluxo de Caixa Gerencial → Gerencial          (nome curto, como no menu lateral)
--   (Acervo de Documentos NÃO entra aqui — vive na branch v4.34.0.)

UPDATE app.rbac_areas SET rotulo = 'Performance/Geral'       WHERE area = 'performance';
UPDATE app.rbac_areas SET rotulo = 'Performance/Trips'       WHERE area = 'performance/trips';
UPDATE app.rbac_areas SET rotulo = 'Performance/Weddings'    WHERE area = 'performance/weddings';
UPDATE app.rbac_areas SET rotulo = 'Performance/Corporativo' WHERE area = 'performance/corporativo';
UPDATE app.rbac_areas SET rotulo = 'Gerencial'               WHERE area = 'financeiro/gerencial';

-- Reversão (rótulos anteriores):
--   UPDATE app.rbac_areas SET rotulo = 'Performance — Geral'       WHERE area = 'performance';
--   UPDATE app.rbac_areas SET rotulo = 'Performance — Trips'       WHERE area = 'performance/trips';
--   UPDATE app.rbac_areas SET rotulo = 'Performance — Weddings'    WHERE area = 'performance/weddings';
--   UPDATE app.rbac_areas SET rotulo = 'Performance — Corporativo' WHERE area = 'performance/corporativo';
--   UPDATE app.rbac_areas SET rotulo = 'Fluxo de Caixa Gerencial'  WHERE area = 'financeiro/gerencial';
