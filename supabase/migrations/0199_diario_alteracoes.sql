-- 0199 — Diário de alterações genérico (append-only) + trigger em gerencial_lancamentos
-- v5.2.1 / M2 (ADR-0155). Motivação real: um usuário apagou toda a Base de Dados do
-- Gerencial sem reversão possível. Este diário é a base da auditoria + desfazer.
--
-- ADITIVA / retrocompatível com a main viva: cria uma tabela NOVA (financeiro.diario_alteracoes),
-- uma função de trigger NOVA (genérica) e anexa um AFTER trigger a analytics.gerencial_lancamentos.
-- NÃO altera colunas nem dados pré-existentes; quem só edita a Base de Dados continua idêntico —
-- o diário é camada em volta (cada escrita passa a gerar UMA entrada de auditoria, na mesma
-- transação). INVARIANTE: o diário é APPEND-ONLY e IMUTÁVEL — nenhum UPDATE/DELETE nele, nem pelo
-- desfazer (o undo gera NOVA entrada, e é auditado via `origem_undo`). RLS nega escrita direta;
-- só o trigger (SECURITY DEFINER, dono postgres) escreve; leitura só via RPC SECURITY DEFINER.

-- ── 1. Tabela genérica de auditoria ────────────────────────────────────────────
CREATE TABLE financeiro.diario_alteracoes (
  id            BIGSERIAL PRIMARY KEY,
  tabela_alvo   TEXT        NOT NULL,                                   -- 'schema.tabela' (ex.: analytics.gerencial_lancamentos)
  operacao      CHAR(1)     NOT NULL CHECK (operacao IN ('I','U','D')), -- Insert/Update/Delete
  registro_id   TEXT        NOT NULL,                                   -- PK da linha alvo, como texto (genérico p/ qualquer tipo de PK)
  dados_antes   JSONB,                                                  -- NULL em INSERT
  dados_depois  JSONB,                                                  -- NULL em DELETE
  usuario_id    UUID,                                                   -- auth.uid() do autor; NULL em operação de sistema/service_role (ex.: importação)
  usuario_nome  TEXT,                                                   -- nome DENORMALIZADO (retenção total: sobrevive à exclusão do usuário)
  lote_id       BIGINT      NOT NULL,                                   -- txid_current(): agrupa todas as linhas de UMA transação (a "ação")
  origem_undo   BIGINT,                                                 -- se esta entrada foi gerada por um DESFAZER, o lote_id que ela reverteu (auditoria do undo)
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices do painel de histórico (agrupado por lote, mais recentes primeiro) e da reversão por linha.
CREATE INDEX idx_diario_tabela_criado ON financeiro.diario_alteracoes (tabela_alvo, criado_em DESC);
CREATE INDEX idx_diario_lote          ON financeiro.diario_alteracoes (lote_id);
CREATE INDEX idx_diario_registro      ON financeiro.diario_alteracoes (tabela_alvo, registro_id);

COMMENT ON TABLE financeiro.diario_alteracoes IS
  'Diário de alterações append-only (v5.2.1/ADR-0155). Imutável: só o trigger escreve; RLS nega escrita direta. Desenho genérico (qualquer tabela editável); nesta versão anexado só a analytics.gerencial_lancamentos.';

-- ── 2. Função de trigger GENÉRICA ──────────────────────────────────────────────
-- Reutilizável em qualquer tabela cuja PK seja a coluna `id` (as tabelas editáveis do
-- projeto seguem esse padrão). Captura antes/depois como jsonb, o autor (auth.uid() + nome
-- denormalizado) e o lote (txid). `origem_undo` vem de um GUC transacional que a RPC de
-- desfazer seta (SET LOCAL app.diario_undo_de = <lote>) — assim o undo fica auditado sem
-- quebrar o append-only. SECURITY DEFINER (dono postgres) para escrever apesar da RLS.
CREATE OR REPLACE FUNCTION financeiro.fn_diario_alteracoes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid   := auth.uid();
  v_nome   text;
  v_op     char(1);
  v_antes  jsonb;
  v_depois jsonb;
  v_regid  text;
  v_undo   bigint := nullif(current_setting('app.diario_undo_de', true), '')::bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_op := 'I'; v_antes := NULL;            v_depois := to_jsonb(NEW); v_regid := to_jsonb(NEW)->>'id';
  ELSIF TG_OP = 'UPDATE' THEN
    v_op := 'U'; v_antes := to_jsonb(OLD);   v_depois := to_jsonb(NEW); v_regid := to_jsonb(NEW)->>'id';
  ELSE -- DELETE
    v_op := 'D'; v_antes := to_jsonb(OLD);   v_depois := NULL;          v_regid := to_jsonb(OLD)->>'id';
  END IF;

  -- Genérico assume PK na coluna `id` (todas as tabelas editáveis do projeto seguem isso). Se um dia
  -- for anexado a uma tabela SEM `id`, falha AQUI com mensagem legível, não com um erro críptico de
  -- NOT NULL — é o ponto de generalização a revisitar quando promover o padrão a outra tabela.
  IF v_regid IS NULL THEN
    RAISE EXCEPTION 'diario_alteracoes: tabela %.% sem coluna id — o trigger genérico exige PK "id".', TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  -- Nome do autor: denormalizado no momento do fato (retenção total). Sem linha → NULL (não falha).
  SELECT u.nome INTO v_nome FROM app.rbac_usuarios u WHERE u.user_id = v_uid;

  INSERT INTO financeiro.diario_alteracoes
    (tabela_alvo, operacao, registro_id, dados_antes, dados_depois, usuario_id, usuario_nome, lote_id, origem_undo)
  VALUES
    (TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, v_op, v_regid, v_antes, v_depois, v_uid, v_nome, txid_current(), v_undo);

  RETURN NULL; -- AFTER trigger: retorno ignorado
END;
$$;

-- ── 3. Anexa o diário a analytics.gerencial_lancamentos ─────────────────────────
-- AFTER (não BEFORE): captura os valores finais, depois do trigger BEFORE que já setou
-- atualizado_em (0094). FOR EACH ROW: uma entrada por linha; a exclusão em massa (um único
-- DELETE ... WHERE id = ANY) gera N entradas no MESMO lote (txid) — o painel agrupa por lote.
CREATE TRIGGER trg_diario_gerencial_lancamentos
  AFTER INSERT OR UPDATE OR DELETE ON analytics.gerencial_lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION financeiro.fn_diario_alteracoes();

-- ── 4. Segurança: RLS on, escrita só pelo trigger, sem acesso a anon/authenticated ─
-- (A tabela nasce sem grants a PUBLIC/anon/authenticated no Postgres; o REVOKE é defensivo e
--  espelha a postura da 0120. O loop deny-default da 0120 rodou UMA vez — tabela nova não é
--  varrida por ele, então habilitamos RLS explicitamente aqui.)
ALTER TABLE financeiro.diario_alteracoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financeiro.diario_alteracoes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE financeiro.diario_alteracoes_id_seq FROM PUBLIC, anon, authenticated;
-- Sem policy = deny-all para não-donos. O trigger (SECURITY DEFINER dono postgres) escreve
-- apesar da RLS; a leitura vem só de RPCs SECURITY DEFINER (M3). Nenhum GRANT a service_role:
-- app nunca toca a tabela direto (zero .from()); financeiro não é exposto pelo PostgREST.
