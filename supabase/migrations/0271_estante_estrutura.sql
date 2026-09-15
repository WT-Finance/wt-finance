-- ---------------------------------------------------------------------------
-- 0271 — feat(v5.11.0/M1): schema `estante` — Estante Welcome (estrutura)
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria o schema NOVO `estante` com 1 enum, 2 tabelas (livro,
--     movimentacao), a view de estado derivado, 1 helper de permissão, os
--     triggers do diário genérico da 0199 e as DUAS áreas RBAC novas. As RPCs
--     vêm na 0272 — esta migration é só ESTRUTURA.
--   • ADITIVA / RETROCOMPATÍVEL: só CREATE SCHEMA/TYPE/TABLE/INDEX/VIEW/FUNCTION/
--     TRIGGER e INSERT idempotente (ON CONFLICT DO NOTHING) em tabelas NOVAS. A
--     única escrita em tabela pré-existente é o INSERT de catálogo em
--     app.rbac_areas e app.rbac_role_permissoes — idempotente, sem tocar linha
--     já existente. Superfície 100% nova: nenhuma tela consome nada disto ainda.
--   • MODELO (briefing v5.11.0, invariantes 1 e 2): o RAZÃO é a fonte da verdade.
--     Disponibilidade e portador são DERIVADOS da última movimentação —
--     `estante.livro` NÃO tem status nem portador_id. Livro nasce SEM
--     movimentação: ausência de razão significa "disponível", e um tipo
--     `cadastro` aqui seria cerimônia sem informação (divergência deliberada do
--     Inventário de Ativos, que tem abertura obrigatória).
--   • RBAC em DOIS níveis (molde Acervo/Solicitações): 'gestao-pessoas/estante'
--     = ver e movimentar; 'gestao-pessoas/estante/gestao' = o catálogo, e
--     INCLUI a de uso (a página faz OR das duas). Gate inicial APERTADO: só os
--     roles que já têm 'admin/acessos' recebem as áreas novas; o admin libera os
--     demais pelo editor de roles.
--   • Reversão (manual, destrutiva): DROP SCHEMA estante CASCADE (leva junto os 2
--     triggers do diário, que vivem nas tabelas deste schema), DELETE das linhas
--     de app.rbac_role_permissoes com area IN ('gestao-pessoas/estante',
--     'gestao-pessoas/estante/gestao') e DELETE das 2 linhas de app.rbac_areas.
--     As entradas já gravadas em financeiro.diario_alteracoes permanecem — o
--     diário é append-only e imutável por construção.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS estante;

-- Nenhum papel do PostgREST alcança o schema: todo acesso é por RPC SECURITY
-- DEFINER em `public` (dono postgres). Postura da 0120/0122/0247.
REVOKE ALL ON SCHEMA estante FROM PUBLIC;

COMMENT ON SCHEMA estante IS
  'Estante Welcome (v5.11.0). Razão append-only de empréstimos; disponibilidade e portador são DERIVADOS da última movimentação, nunca colunas em estante.livro.';

-- ── 1. Enum ─────────────────────────────────────────────────────────────────────
-- Dois valores e nada mais: "pegou" e "devolveu". Reserva, baixa e manutenção são
-- fronteira explícita da versão (briefing, seção Fronteira).
CREATE TYPE estante.tipo_movimentacao AS ENUM ('emprestimo', 'devolucao');

-- ── 2. Catálogo ─────────────────────────────────────────────────────────────────
-- UM REGISTRO = UM EXEMPLAR (decisão do Yan). Duas cópias do mesmo título são duas
-- linhas; não existe coluna de quantidade. `arquivado_em` nulo = na estante.
CREATE TABLE estante.livro (
  id            bigserial PRIMARY KEY,
  titulo        text NOT NULL CHECK (btrim(titulo) <> ''),
  autor         text,
  editora       text,
  ano           smallint CHECK (ano IS NULL OR ano BETWEEN 1400 AND 2100),
  isbn          text,
  obs           text,
  arquivado_em  timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  criado_por    uuid,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE estante.livro IS
  'Um registro = um EXEMPLAR. Sem status/portador: estado vem de estante.v_estado_atual.';

CREATE INDEX idx_estante_livro_arquivado ON estante.livro(arquivado_em);

-- ── 3. Razão append-only ────────────────────────────────────────────────────────
-- `usuario_id` = QUEM ESTÁ COM O LIVRO (dado de negócio). `registrado_por` = quem
-- operou o sistema (auditoria). Colunas distintas de propósito: a gestão registra
-- em nome de terceiro, e confundir as duas apagaria a diferença.
--
-- FK RESTRICT (não CASCADE): apagar um livro com razão apagaria o registro de quem
-- o levou. A RPC `estante_remover_livro` arquiva nesse caso; o RESTRICT é o backstop
-- do banco caso alguém apague por fora.
CREATE TABLE estante.movimentacao (
  id                  bigserial PRIMARY KEY,
  livro_id            bigint NOT NULL REFERENCES estante.livro(id) ON DELETE RESTRICT,
  tipo                estante.tipo_movimentacao NOT NULL,
  usuario_id          uuid NOT NULL,
  usuario_nome        text,
  data_movimentacao   date NOT NULL DEFAULT CURRENT_DATE
                        CHECK (data_movimentacao >= DATE '2000-01-01'),
  obs                 text,
  registrado_por      uuid,
  registrado_por_nome text,
  criado_em           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE estante.movimentacao IS
  'Append-only. Só `obs` é editável (diário da 0199). Erro se conserta com movimentação NOVA.';
COMMENT ON COLUMN estante.movimentacao.usuario_id IS
  'Quem está com o livro (negócio) — distinto de registrado_por (auditoria).';

-- Ordenação determinística do estado derivado: (data, criado_em, id). A retroativa é
-- liberada de propósito, então a data sozinha não desempata.
CREATE INDEX idx_estante_mov_livro_ordem
  ON estante.movimentacao(livro_id, data_movimentacao DESC, criado_em DESC, id DESC);
CREATE INDEX idx_estante_mov_usuario ON estante.movimentacao(usuario_id);

-- ── 4. Estado derivado (invariante 1) ───────────────────────────────────────────
-- Última movimentação por livro. Livro SEM movimentação não aparece aqui — e o LEFT
-- JOIN das RPCs o lê como disponível, que é o estado correto (invariante 2).
CREATE VIEW estante.v_estado_atual AS
  SELECT DISTINCT ON (m.livro_id)
    m.livro_id,
    m.tipo,
    m.usuario_id,
    m.usuario_nome,
    m.data_movimentacao,
    (m.tipo = 'emprestimo') AS emprestado
  FROM estante.movimentacao m
  ORDER BY m.livro_id, m.data_movimentacao DESC, m.criado_em DESC, m.id DESC;

REVOKE ALL ON estante.v_estado_atual FROM PUBLIC, anon, authenticated;

-- ── 5. Helper de permissão de gestão ────────────────────────────────────────────
-- Chamado SEMPRE depois de `app.exigir_acesso`, que já barrou anônimo e usuário
-- inativo. Nesse ponto, `app.uid_jwt() IS NULL` só acontece para service_role ou
-- conexão de superusuário (migration, `db query`, teste) — os mesmos que o próprio
-- `exigir_acesso` libera por atalho. Tratá-los como gestão mantém as duas funções
-- coerentes; tratá-los como usuário comum tornaria as RPCs de catálogo
-- inalcançáveis à verificação via REST/service_role, que é o padrão do projeto.
CREATE OR REPLACE FUNCTION estante.pode_gerir()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.uid_jwt() IS NULL OR app.tem_area('gestao-pessoas/estante/gestao');
$$;
REVOKE EXECUTE ON FUNCTION estante.pode_gerir() FROM PUBLIC, anon, authenticated;

-- ── 6. RLS deny-by-default ──────────────────────────────────────────────────────
-- Nenhuma policy: o schema não é exposto pelo PostgREST e todo acesso passa por RPC
-- SECURITY DEFINER. O ENABLE é cinto de segurança, não a porta.
ALTER TABLE estante.livro        ENABLE ROW LEVEL SECURITY;
ALTER TABLE estante.movimentacao ENABLE ROW LEVEL SECURITY;

-- ── 7. Diário de alterações (reuso da 0199) ─────────────────────────────────────
-- A função de trigger da 0199 é GENÉRICA (qualquer tabela com PK `id`).
CREATE TRIGGER trg_diario_estante_livro
  AFTER INSERT OR UPDATE OR DELETE ON estante.livro
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_diario_alteracoes();

CREATE TRIGGER trg_diario_estante_movimentacao
  AFTER INSERT OR UPDATE OR DELETE ON estante.movimentacao
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_diario_alteracoes();

-- ── 8. Áreas RBAC (paridade com src/lib/auth/areas.ts) ──────────────────────────
-- rpc-contrato.test.ts exige paridade EXATA entre AREAS e app.rbac_areas.
INSERT INTO app.rbac_areas (area, rotulo, grupo, ordem) VALUES
  ('gestao-pessoas/estante',        'Estante Welcome',           'Gestão de Pessoas', 61),
  ('gestao-pessoas/estante/gestao', 'Estante Welcome (gestão)',  'Gestão de Pessoas', 62)
ON CONFLICT (area) DO NOTHING;

-- Gate APERTADO (padrão 0161/0165/0247): só os roles que já têm 'admin/acessos'.
INSERT INTO app.rbac_role_permissoes (role_id, area)
  SELECT DISTINCT role_id, a.area
  FROM app.rbac_role_permissoes rp
  CROSS JOIN (VALUES ('gestao-pessoas/estante'), ('gestao-pessoas/estante/gestao')) AS a(area)
  WHERE rp.area = 'admin/acessos'
ON CONFLICT (role_id, area) DO NOTHING;
