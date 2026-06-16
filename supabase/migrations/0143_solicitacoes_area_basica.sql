-- ---------------------------------------------------------------------------
-- 0143 — feat(v4.20.0): permissão de Solicitações em DOIS níveis (básica + gestão).
-- ADR-0121.
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria a área de permissão 'solicitacoes/basico' (rótulo "Solicitações")
--     = acesso BÁSICO (caixa de entrada + minhas solicitações) e a concede a TODOS os
--     roles existentes. A área 'solicitacoes' PERMANECE = GESTÃO (rótulo inalterado
--     "Solicitações (gestão)": Ver todas, Gerenciar solicitações, Movimentações) — NENHUM
--     guard de gestão muda (todos seguem exigindo 'solicitacoes').
--   • ADITIVA / RETROCOMPATÍVEL com a main viva (v4.19.1): só INSERT de catálogo (nova
--     área) + INSERT de grants novos. NÃO faz UPDATE/DELETE/DROP em dado pré-existente.
--     O app v4.19.1 ignora a área desconhecida (checagem por .includes; permissão extra
--     no array é inócua) e segue abrindo /solicitacoes a qualquer autenticado.
--   • NÃO escreve em dados pré-existentes: as linhas atuais de rbac_areas e
--     rbac_role_permissoes ficam intactas; só se ACRESCENTAM linhas (ON CONFLICT DO NOTHING).
--
-- Motivação: hoje /solicitacoes (caixa + minhas) é aberto a QUALQUER autenticado
-- (página = requireArea(null)). O split permite conceder/revogar o acesso básico por
-- role. Backfill a todos os roles = NÃO-QUEBRA (ninguém perde o acesso de hoje; o admin
-- remove depois de quem não deve ter). Decisão do produto (Yan): conceder a todos no deploy.
-- ---------------------------------------------------------------------------

-- 1) Nova área BÁSICA (idempotente). Grupo 'Geral' (feature de usuário, junto de
--    Executiva/Metas); ordem 45 (entre Metas=40 e Upload=50). A área 'solicitacoes'
--    (gestão) fica intacta em 'Administração'/53.
INSERT INTO app.rbac_areas (area, rotulo, grupo, ordem) VALUES
  ('solicitacoes/basico', 'Solicitações', 'Geral', 45)
ON CONFLICT (area) DO NOTHING;

-- 2) Backfill NÃO-QUEBRA: todo role recebe a área básica (admin remove depois).
--    Idempotente (PK (role_id, area) → ON CONFLICT DO NOTHING).
INSERT INTO app.rbac_role_permissoes (role_id, area)
  SELECT id, 'solicitacoes/basico' FROM app.rbac_roles
ON CONFLICT (role_id, area) DO NOTHING;

-- Reversão (manual; seria destrutiva, exigiria confirmação): remover os grants da
-- área 'solicitacoes/basico' em app.rbac_role_permissoes e a própria linha em
-- app.rbac_areas (nessa ordem, pela FK). Não há reversão automática.
