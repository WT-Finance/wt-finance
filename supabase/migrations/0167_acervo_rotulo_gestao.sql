-- ---------------------------------------------------------------------------
-- 0167 — feat(v4.34.0): Acervo de Documentos — rótulo da área de gestão
--
-- DECLARAÇÃO PRÉVIA:
--   • O QUE FAZ: renomeia APENAS o rótulo de exibição da área
--     'financeiro/acervo/gestao' em app.rbac_areas:
--     'Acervo — Adicionar documentos' → 'Acervo de Documentos (gestão)',
--     alinhando ao padrão de 'Solicitações (gestão)'. A tela de Usuários e
--     Acessos lê o rótulo do banco (admin_listar_areas); o espelho
--     AREA_INFO em src/lib/auth/areas.ts foi atualizado em paridade.
--   • CLASSIFICAÇÃO: DESTRUTIVA por definição do regime (UPDATE em linha
--     existente), embora cosmética e mínima — reescreve SÓ o rotulo de UMA
--     linha de catálogo criada pela 0165 desta MESMA versão (v4.34.0, ainda
--     não mergeada). Nenhuma permissão, grant, chave de área ou dado de
--     usuário é alterado (a chave 'financeiro/acervo/gestao' permanece).
--   • APLICAÇÃO: npm run db:migrate -- --destrutiva (confirmação humana no
--     terminal, ADR-0131). Idempotente (re-aplicar não muda nada).
--   • Reversão: UPDATE app.rbac_areas
--       SET rotulo = 'Acervo — Adicionar documentos'
--       WHERE area = 'financeiro/acervo/gestao';
-- ---------------------------------------------------------------------------

UPDATE app.rbac_areas
SET rotulo = 'Acervo de Documentos (gestão)'
WHERE area = 'financeiro/acervo/gestao';

NOTIFY pgrst, 'reload schema';
