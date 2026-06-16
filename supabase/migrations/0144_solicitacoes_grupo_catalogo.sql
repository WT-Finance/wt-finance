-- ---------------------------------------------------------------------------
-- 0144 — fix(v4.20.0): agrupar os dois níveis de Solicitações no catálogo de áreas.
-- Segue 0143 (ADR-0121).
--
-- DESTRUTIVA (UPDATE em dado pré-existente) → CONFIRMAÇÃO HUMANA antes do db push.
-- É só metadado de EXIBIÇÃO do catálogo (grupo/ordem em app.rbac_areas) — sem perda
-- de dado, sem mexer em grants nem em permissão. Reversível (valores antigos no corpo).
--
-- Motivo: a 0143 pôs a área básica em grupo 'Geral' e a de gestão em 'Administração'.
-- No editor de permissões (modal-role agrupa por `grupo`), as duas apareciam SEPARADAS
-- — não se liam como "os dois níveis de Solicitações". Esta migration junta as duas num
-- grupo dedicado 'Solicitações' (espelhando como 'Performance' reúne seus níveis), com a
-- básica antes da gestão.
--
-- Reversão (manual): básica → grupo 'Geral', ordem 45; gestão → grupo 'Administração',
-- ordem 53 (estado pós-0143).
-- ---------------------------------------------------------------------------

UPDATE app.rbac_areas SET grupo = 'Solicitações', ordem = 53 WHERE area = 'solicitacoes/basico';
UPDATE app.rbac_areas SET grupo = 'Solicitações', ordem = 54 WHERE area = 'solicitacoes';
