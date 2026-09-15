# Estante Welcome (v5.11.0) — Plano de Implementação

> **Para executores:** este plano é implementado tarefa a tarefa. Os passos usam checkbox (`- [ ]`). Cada tarefa termina com gate próprio e commit.

**Goal:** dar à empresa um registro de quem está com cada livro da estante — catálogo de livros e razão append-only de empréstimos/devoluções, em `/gestao-pessoas/estante`.

**Architecture:** schema novo `estante` com duas tabelas (`livro`, `movimentacao`); disponibilidade e portador **derivados** da última movimentação, nunca colunas. Toda regra vive em RPC `SECURITY DEFINER` no schema `public`, gated por `app.exigir_acesso`; as Server Actions só traduzem erro para frase. Tela RSC + Server Actions + `router.refresh()`, molde do Inventário de Ativos (v5.6.0).

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Supabase/Postgres (migrations SQL numeradas), Zod (`parseRpc`), Vitest, Tailwind + tokens do DS Janus.

**Spec:** `docs/briefings/briefing-v5-11-0-estante-welcome.md` — leia antes da Tarefa 1; as invariantes 1–13 de lá valem para todas as tarefas.

## Global Constraints

- **Branch:** `feat/v5-11-0-estante-welcome`, base `ec112be` (merge da v5.10.3). **Versão alvo:** `5.11.0`.
- **Migrations livres:** `0271` e `0272`. Renumerar com `git mv` se alguém ocupar antes. Aplicação **só** pelo wrapper `npm run db:migrate` (backup-gate, ADR-0119) — nunca `supabase db push` direto.
- **Áreas RBAC novas (strings exatas):** `gestao-pessoas/estante` e `gestao-pessoas/estante/gestao`. Rótulos: `Estante Welcome` e `Estante Welcome (gestão)`; grupo `Gestão de Pessoas`; ordem `61` e `62`.
- **Paridade banco↔app obrigatória:** toda área declarada em `src/lib/auth/areas.ts` tem de existir em `app.rbac_areas` e vice-versa (`src/lib/rpc-contrato.test.ts:752`). As duas pontas viram **na mesma tarefa** ou o gate quebra.
- **Zero hex em componente** — só `var(--token)` via classes `[var(--token)]`. Lint `wt/no-cor-hardcoded`.
- **`supabase-js`:** nunca destacar `db.rpc` numa variável (perde o `this`). Use o helper `rpcEstante` da Tarefa 6.
- **Retorno de `.rpc()` é *thenable*:** tem `.then`, **não** tem `.catch`. Use `Promise.allSettled`.
- **Toda escrita em teste** roda em `BEGIN … ROLLBACK` com `SET LOCAL lock_timeout = '5s'`, sem `COMMIT`, e o arquivo é declarado em `ESCREVEM_E_REVERTEM_HOJE` de `src/lib/sonda-teste-escreve-banco.test.ts`.
- **Gates:** `npx tsc --noEmit` e `npm run lint` ao fim de cada tarefa; `npm run build` e `npm test` ao fim das Tarefas 5, 9 e 10.

---

## Estrutura de arquivos

**Criar**
- `supabase/migrations/0271_estante_estrutura.sql` — schema, enum, 2 tabelas, view de estado, helper de permissão, triggers do diário, áreas RBAC + seed.
- `supabase/migrations/0272_estante_rpcs.sql` — as 7 RPCs `public.estante_*`.
- `src/lib/estante/rpc-estante.ts` — helper de chamada tipada frouxa.
- `src/lib/estante/carregar.ts` — leitura agregada fail-safe para o RSC.
- `src/lib/estante/estante-rpcs.test.ts` — prova comportamental das RPCs (escreve e reverte).
- `src/components/gestao-pessoas/estante/tipos.ts` — tipos compartilhados da tela.
- `src/components/gestao-pessoas/estante/estado-badge.tsx` — pill Disponível/Emprestado.
- `src/components/gestao-pessoas/estante/estante-content.tsx` — casca de abas (client).
- `src/components/gestao-pessoas/estante/acervo-tab.tsx` — tabela do acervo.
- `src/components/gestao-pessoas/estante/livro-form-modal.tsx` — cadastro/edição.
- `src/components/gestao-pessoas/estante/remover-livro-modal.tsx` — apagar × arquivar.
- `src/components/gestao-pessoas/estante/movimentacao-modal.tsx` — pegar/devolver.
- `src/components/gestao-pessoas/estante/ficha-drawer.tsx` — ficha + razão do exemplar.
- `src/components/gestao-pessoas/estante/historico-tab.tsx` — razão completo.
- `src/app/gestao-pessoas/estante/page.tsx`, `loading.tsx`, `actions.ts`.
- `docs/adr/0174-estante-welcome-razao-de-emprestimos.md`.

**Modificar**
- `src/lib/auth/areas.ts` — `AREAS`, `AREA_INFO`, `areasDaRota` (desdobrar `/gestao-pessoas`).
- `src/lib/auth/areas.test.ts` — casos das rotas novas.
- `src/components/layout/nav-model.ts` — sub-item na sidebar.
- `src/lib/schemas-rpc.ts` — `estanteLivrosSchema`, `estanteMovimentacoesSchema`.
- `src/lib/sonda-teste-escreve-banco.test.ts` — registrar o teste novo.
- `package.json`, `docs/changelog.md`, `src/data/changelog-diretoria.ts`, `docs/WORKING-CONTEXT.md`.

---

### Task 1: Migration 0271 — estrutura do schema `estante`

**Files:**
- Create: `supabase/migrations/0271_estante_estrutura.sql`

**Interfaces:**
- Consumes: `financeiro.fn_diario_alteracoes()` (0199), `app.rbac_areas`, `app.rbac_role_permissoes`, `app.uid_jwt()`, `app.tem_area(text)` (0128).
- Produces: `estante.tipo_movimentacao` (enum `emprestimo`/`devolucao`), `estante.livro`, `estante.movimentacao`, `estante.v_estado_atual` (colunas `livro_id, tipo, usuario_id, usuario_nome, data_movimentacao, emprestado`), `estante.pode_gerir() → boolean`, áreas `gestao-pessoas/estante` e `gestao-pessoas/estante/gestao`.

- [ ] **Step 1: Escrever a migration**

```sql
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
--   • Reversão (manual, destrutiva): DROP SCHEMA estante CASCADE (leva os 2
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
```

- [ ] **Step 2: Conferir a sintaxe sem aplicar**

Não aplique ainda (a aplicação é a Tarefa 3, com o revisor-db no meio). Rode só a checagem de que o arquivo é SQL válido e está numerado certo:

```bash
ls supabase/migrations | tail -4
grep -c "CREATE" supabase/migrations/0271_estante_estrutura.sql
```

Esperado: `0271_estante_estrutura.sql` como último; contagem ≥ 10.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0271_estante_estrutura.sql
git commit -m "feat(v5.11.0/M1): 0271 — estrutura do schema estante"
```

---

### Task 2: Migration 0272 — RPCs da Estante

**Files:**
- Create: `supabase/migrations/0272_estante_rpcs.sql`

**Interfaces:**
- Consumes: tudo o que a Tarefa 1 produz, mais `app.exigir_acesso(text[])`, `app.uid_jwt()`, `app.norm_nome(text)`, `app.rbac_usuarios`.
- Produces (assinaturas que o front consome nas Tarefas 6–9):
  - `public.estante_listar_livros(p_busca text, p_estado text, p_incluir_arquivados boolean) → jsonb` (array)
  - `public.estante_detalhe_livro(p_id bigint) → jsonb` (`{livro, movimentacoes}`)
  - `public.estante_criar_livro(p_titulo text, p_autor text, p_editora text, p_ano smallint, p_isbn text, p_obs text) → jsonb` (`{id, titulo}`)
  - `public.estante_atualizar_livro(p_id bigint, p_titulo text, p_autor text, p_editora text, p_ano smallint, p_isbn text, p_obs text) → jsonb` (`{id, titulo}`)
  - `public.estante_remover_livro(p_id bigint) → jsonb` (`{id, acao}` com `acao ∈ {'apagado','arquivado'}`)
  - `public.estante_registrar_movimentacao(p_livro_id bigint, p_tipo text, p_usuario_id uuid, p_data_movimentacao date, p_obs text) → jsonb` (`{id, emprestado}`)
  - `public.estante_listar_movimentacoes(p_limite integer) → jsonb` (array)

- [ ] **Step 1: Escrever a migration**

```sql
-- ---------------------------------------------------------------------------
-- 0272 — feat(v5.11.0/M1): RPCs da Estante Welcome
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria 7 RPCs NOVAS em `public`, todas gated. LEITURA (área de uso
--     OU de gestão): estante_listar_livros, estante_detalhe_livro,
--     estante_listar_movimentacoes. ESCRITA DE CATÁLOGO (só gestão):
--     estante_criar_livro, estante_atualizar_livro, estante_remover_livro.
--     ESCRITA DE RAZÃO (área de uso): estante_registrar_movimentacao.
--   • ADITIVA: só CREATE FUNCTION + REVOKE/GRANT. Nenhuma função pré-existente é
--     alterada; toda escrita acontece em tabelas criadas na 0271, hoje VAZIAS e
--     sem consumidor.
--   • ORÇAMENTO DE TEMPO: rodam como `authenticated` (teto de 8s, ADR-0122). O
--     volume é uma estante de escritório (dezenas de linhas) — sem risco de N+1.
--   • Reversão (manual, destrutiva): DROP das 7 funções `public.estante_*`.
-- ---------------------------------------------------------------------------

-- Áreas que abrem a LEITURA: gestão inclui o uso (invariante 8 do briefing).
-- Repetido em cada RPC de propósito: `exigir_acesso` recebe o array literal, e um
-- helper que devolvesse o array esconderia de quem lê a RPC quem pode chamá-la.

-- ── 1. Lista do acervo com estado DERIVADO ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.estante_listar_livros(
  p_busca               text    DEFAULT NULL,
  p_estado              text    DEFAULT NULL,
  p_incluir_arquivados  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v   jsonb;
  v_q text := app.norm_nome(coalesce(p_busca, ''));
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao']);

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'titulo'), '[]'::jsonb) INTO v
  FROM (
    SELECT jsonb_build_object(
      'id',                 l.id,
      'titulo',             l.titulo,
      'autor',              l.autor,
      'editora',            l.editora,
      'ano',                l.ano,
      'isbn',               l.isbn,
      'obs',                l.obs,
      'arquivado',          (l.arquivado_em IS NOT NULL),
      -- Livro sem movimentação não está em v_estado_atual: `coalesce(false)` é o
      -- estado CORRETO (invariante 2), não um fallback defensivo.
      'emprestado',         coalesce(e.emprestado, false),
      'portador_id',        CASE WHEN coalesce(e.emprestado, false) THEN e.usuario_id END,
      -- Nome VIVO do cadastro, com o snapshot da movimentação como retaguarda para
      -- quem já saiu da plataforma.
      'portador_nome',      CASE WHEN coalesce(e.emprestado, false)
                                 THEN coalesce(u.nome, e.usuario_nome, u.email) END,
      'desde',              CASE WHEN coalesce(e.emprestado, false) THEN e.data_movimentacao END,
      'tem_historico',      EXISTS (SELECT 1 FROM estante.movimentacao m WHERE m.livro_id = l.id)
    ) AS x
    FROM estante.livro l
    LEFT JOIN estante.v_estado_atual e ON e.livro_id = l.id
    LEFT JOIN app.rbac_usuarios u      ON u.user_id  = e.usuario_id
    WHERE (p_incluir_arquivados OR l.arquivado_em IS NULL)
      AND (p_estado IS NULL
           OR (p_estado = 'emprestado' AND coalesce(e.emprestado, false))
           OR (p_estado = 'disponivel' AND NOT coalesce(e.emprestado, false)))
      AND (
        v_q = '' OR
        app.norm_nome(l.titulo)                LIKE '%' || v_q || '%' OR
        app.norm_nome(coalesce(l.autor, ''))   LIKE '%' || v_q || '%' OR
        app.norm_nome(coalesce(l.editora, '')) LIKE '%' || v_q || '%' OR
        app.norm_nome(coalesce(u.nome, e.usuario_nome, '')) LIKE '%' || v_q || '%'
      )
  ) s;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_listar_livros(text, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_listar_livros(text, text, boolean) TO authenticated, service_role;

-- ── 2. Ficha + razão do exemplar numa ÚNICA leitura (invariante 10) ─────────────
CREATE OR REPLACE FUNCTION public.estante_detalhe_livro(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao']);

  -- O livro volta no MESMO formato de `estante_listar_livros` (não `to_jsonb` cru): uma
  -- forma só para os dois caminhos, senão ficha e lista divergiriam de tipo no front.
  SELECT jsonb_build_object(
    'livro', (
      SELECT jsonb_build_object(
        'id',            l.id,
        'titulo',        l.titulo,
        'autor',         l.autor,
        'editora',       l.editora,
        'ano',           l.ano,
        'isbn',          l.isbn,
        'obs',           l.obs,
        'arquivado',     (l.arquivado_em IS NOT NULL),
        'emprestado',    coalesce(e.emprestado, false),
        'portador_id',   CASE WHEN coalesce(e.emprestado, false) THEN e.usuario_id END,
        'portador_nome', CASE WHEN coalesce(e.emprestado, false)
                              THEN coalesce(u.nome, e.usuario_nome, u.email) END,
        'desde',         CASE WHEN coalesce(e.emprestado, false) THEN e.data_movimentacao END,
        'tem_historico', EXISTS (SELECT 1 FROM estante.movimentacao m WHERE m.livro_id = l.id)
      )
      FROM estante.livro l
      LEFT JOIN estante.v_estado_atual e ON e.livro_id = l.id
      LEFT JOIN app.rbac_usuarios u      ON u.user_id  = e.usuario_id
      WHERE l.id = p_id
    ),
    'movimentacoes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',                m.id,
        'livro_id',          m.livro_id,
        'tipo',              m.tipo,
        'usuario_id',        m.usuario_id,
        'usuario_nome',      coalesce(u.nome, m.usuario_nome, u.email),
        'data_movimentacao', m.data_movimentacao,
        'obs',               m.obs,
        'criado_em',         m.criado_em
      ) ORDER BY m.data_movimentacao DESC, m.criado_em DESC, m.id DESC), '[]'::jsonb)
      FROM estante.movimentacao m
      LEFT JOIN app.rbac_usuarios u ON u.user_id = m.usuario_id
      WHERE m.livro_id = p_id
    )
  ) INTO v;

  IF v->'livro' IS NULL OR v->'livro' = 'null'::jsonb THEN
    RAISE EXCEPTION 'LIVRO_NAO_ENCONTRADO: livro % não existe', p_id USING ERRCODE = '22023';
  END IF;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_detalhe_livro(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_detalhe_livro(bigint) TO authenticated, service_role;

-- ── 3. Razão completo ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.estante_listar_movimentacoes(p_limite integer DEFAULT 2000)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao']);

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'data_movimentacao') DESC, (x->>'id')::bigint DESC), '[]'::jsonb)
  INTO v
  FROM (
    SELECT jsonb_build_object(
      'id',                m.id,
      'livro_id',          m.livro_id,
      'livro_titulo',      l.titulo,
      'tipo',              m.tipo,
      'usuario_id',        m.usuario_id,
      'usuario_nome',      coalesce(u.nome, m.usuario_nome, u.email),
      'data_movimentacao', m.data_movimentacao,
      'obs',               m.obs,
      'criado_em',         m.criado_em
    ) AS x
    FROM estante.movimentacao m
    JOIN estante.livro l          ON l.id      = m.livro_id
    LEFT JOIN app.rbac_usuarios u ON u.user_id = m.usuario_id
    ORDER BY m.data_movimentacao DESC, m.criado_em DESC, m.id DESC
    LIMIT greatest(coalesce(p_limite, 2000), 1)
  ) s;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_listar_movimentacoes(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_listar_movimentacoes(integer) TO authenticated, service_role;

-- ── 4. Cadastrar livro (só GESTÃO) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.estante_criar_livro(
  p_titulo  text,
  p_autor   text     DEFAULT NULL,
  p_editora text     DEFAULT NULL,
  p_ano     smallint DEFAULT NULL,
  p_isbn    text     DEFAULT NULL,
  p_obs     text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_titulo text := nullif(btrim(coalesce(p_titulo, '')), '');
  v_id     bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante/gestao']);

  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'TITULO_OBRIGATORIO: informe o título do livro' USING ERRCODE = '22023';
  END IF;
  IF p_ano IS NOT NULL AND (p_ano < 1400 OR p_ano > 2100) THEN
    RAISE EXCEPTION 'ANO_INVALIDO: % está fora do intervalo aceito', p_ano USING ERRCODE = '22023';
  END IF;

  INSERT INTO estante.livro (titulo, autor, editora, ano, isbn, obs, criado_por)
  VALUES (
    v_titulo,
    nullif(btrim(coalesce(p_autor, '')), ''),
    nullif(btrim(coalesce(p_editora, '')), ''),
    p_ano,
    nullif(btrim(coalesce(p_isbn, '')), ''),
    nullif(btrim(coalesce(p_obs, '')), ''),
    app.uid_jwt()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'titulo', v_titulo);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_criar_livro(text, text, text, smallint, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_criar_livro(text, text, text, smallint, text, text) TO authenticated, service_role;

-- ── 5. Editar livro (só GESTÃO) ─────────────────────────────────────────────────
-- Edita só a FICHA. Não existe campo de estado aqui: quem está com o livro muda por
-- movimentação, nunca por correção de cadastro (mesma fronteira da invariante 3 do
-- Inventário). Como `estante.livro` não tem coluna de estado, a trava é estrutural.
CREATE OR REPLACE FUNCTION public.estante_atualizar_livro(
  p_id      bigint,
  p_titulo  text,
  p_autor   text     DEFAULT NULL,
  p_editora text     DEFAULT NULL,
  p_ano     smallint DEFAULT NULL,
  p_isbn    text     DEFAULT NULL,
  p_obs     text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_titulo text := nullif(btrim(coalesce(p_titulo, '')), '');
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante/gestao']);

  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'TITULO_OBRIGATORIO: informe o título do livro' USING ERRCODE = '22023';
  END IF;
  IF p_ano IS NOT NULL AND (p_ano < 1400 OR p_ano > 2100) THEN
    RAISE EXCEPTION 'ANO_INVALIDO: % está fora do intervalo aceito', p_ano USING ERRCODE = '22023';
  END IF;

  UPDATE estante.livro SET
    titulo        = v_titulo,
    autor         = nullif(btrim(coalesce(p_autor, '')), ''),
    editora       = nullif(btrim(coalesce(p_editora, '')), ''),
    ano           = p_ano,
    isbn          = nullif(btrim(coalesce(p_isbn, '')), ''),
    obs           = nullif(btrim(coalesce(p_obs, '')), ''),
    atualizado_em = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIVRO_NAO_ENCONTRADO: livro % não existe', p_id USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('id', p_id, 'titulo', v_titulo);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_atualizar_livro(bigint, text, text, text, smallint, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_atualizar_livro(bigint, text, text, text, smallint, text, text) TO authenticated, service_role;

-- ── 6. Remover livro: apaga OU arquiva (invariante 6) ───────────────────────────
-- Livro virgem some de verdade; livro com razão é ARQUIVADO. Apagar um livro com
-- histórico apagaria o registro de quem o levou — e o RESTRICT da FK da 0271 é o
-- backstop para quem tentar por fora. A RPC devolve qual dos dois aconteceu para a
-- tela contar a verdade ao usuário.
CREATE OR REPLACE FUNCTION public.estante_remover_livro(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_tem_historico boolean;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante/gestao']);

  IF NOT EXISTS (SELECT 1 FROM estante.livro l WHERE l.id = p_id) THEN
    RAISE EXCEPTION 'LIVRO_NAO_ENCONTRADO: livro % não existe', p_id USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM estante.movimentacao m WHERE m.livro_id = p_id)
    INTO v_tem_historico;

  IF v_tem_historico THEN
    UPDATE estante.livro SET arquivado_em = now(), atualizado_em = now()
     WHERE id = p_id AND arquivado_em IS NULL;
    RETURN jsonb_build_object('id', p_id, 'acao', 'arquivado');
  END IF;

  DELETE FROM estante.livro WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'acao', 'apagado');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_remover_livro(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_remover_livro(bigint) TO authenticated, service_role;

-- ── 7. Registrar movimentação ───────────────────────────────────────────────────
-- As cinco recusas desta função SÃO a regra de negócio da versão; nada disto se
-- duplica no TypeScript (invariante 7).
CREATE OR REPLACE FUNCTION public.estante_registrar_movimentacao(
  p_livro_id          bigint,
  p_tipo              text,
  p_usuario_id        uuid DEFAULT NULL,
  p_data_movimentacao date DEFAULT NULL,
  p_obs               text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tipo       estante.tipo_movimentacao;
  v_uid        uuid    := app.uid_jwt();
  v_alvo       uuid    := coalesce(p_usuario_id, app.uid_jwt());
  v_gestao     boolean := estante.pode_gerir();
  v_data       date    := coalesce(p_data_movimentacao, CURRENT_DATE);
  v_emprestado boolean;
  v_portador   uuid;
  v_arquivado  boolean;
  v_nome       text;
  v_id         bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao']);

  BEGIN
    v_tipo := p_tipo::estante.tipo_movimentacao;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: "%" não é um tipo de movimentação', p_tipo USING ERRCODE = '22023';
  END;

  SELECT (l.arquivado_em IS NOT NULL) INTO v_arquivado FROM estante.livro l WHERE l.id = p_livro_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIVRO_NAO_ENCONTRADO: livro % não existe', p_livro_id USING ERRCODE = '22023';
  END IF;
  IF v_arquivado THEN
    RAISE EXCEPTION 'LIVRO_ARQUIVADO: livro arquivado não aceita movimentação' USING ERRCODE = '22023';
  END IF;

  -- Sem JWT (service_role/superusuário) o alvo tem de vir explícito: `usuario_id` é
  -- NOT NULL e não há de quem derivá-lo.
  IF v_alvo IS NULL THEN
    RAISE EXCEPTION 'USUARIO_OBRIGATORIO: informe de quem é a movimentação' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.rbac_usuarios u WHERE u.user_id = v_alvo AND u.ativo) THEN
    RAISE EXCEPTION 'USUARIO_DESCONHECIDO: pessoa sem cadastro ativo no Janus' USING ERRCODE = '42501';
  END IF;

  IF v_data < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'DATA_INVALIDA: % está fora do intervalo aceito — confira o ano', v_data
      USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(e.emprestado, false), e.usuario_id INTO v_emprestado, v_portador
  FROM estante.livro l
  LEFT JOIN estante.v_estado_atual e ON e.livro_id = l.id
  WHERE l.id = p_livro_id;

  IF v_tipo = 'emprestimo' THEN
    IF v_emprestado THEN
      RAISE EXCEPTION 'JA_EMPRESTADO: este livro já está com outra pessoa' USING ERRCODE = '22023';
    END IF;
    -- Registrar empréstimo em nome de terceiro é ato de gestão (alguém pegou o
    -- livro e não registrou). Para si mesmo, qualquer um da área de uso.
    IF v_alvo <> coalesce(v_uid, v_alvo) AND NOT v_gestao THEN
      RAISE EXCEPTION 'EMPRESTIMO_PARA_OUTRO: só a gestão registra empréstimo em nome de outra pessoa'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT v_emprestado THEN
      RAISE EXCEPTION 'NAO_EMPRESTADO: este livro já está na estante' USING ERRCODE = '22023';
    END IF;
    -- A devolução é SEMPRE do portador atual — o razão não aceita devolução em nome
    -- de quem não estava com o livro.
    v_alvo := v_portador;
    IF v_portador <> coalesce(v_uid, v_portador) AND NOT v_gestao THEN
      RAISE EXCEPTION 'DEVOLUCAO_DE_OUTRO: este livro está com outra pessoa — só a gestão devolve por ela'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT u.nome INTO v_nome FROM app.rbac_usuarios u WHERE u.user_id = v_alvo;

  INSERT INTO estante.movimentacao (
    livro_id, tipo, usuario_id, usuario_nome, data_movimentacao, obs,
    registrado_por, registrado_por_nome
  ) VALUES (
    p_livro_id, v_tipo, v_alvo, v_nome, v_data,
    nullif(btrim(coalesce(p_obs, '')), ''),
    v_uid, (SELECT u.nome FROM app.rbac_usuarios u WHERE u.user_id = v_uid)
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'emprestado', v_tipo = 'emprestimo');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_registrar_movimentacao(bigint, text, uuid, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_registrar_movimentacao(bigint, text, uuid, date, text) TO authenticated, service_role;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0272_estante_rpcs.sql
git commit -m "feat(v5.11.0/M1): 0272 — RPCs da Estante Welcome"
```

---

### Task 3: Revisão de banco e aplicação das migrations

**Files:** nenhum arquivo novo — é o gate de banco.

**Interfaces:**
- Produces: as 7 RPCs vivas em produção; sem isso as Tarefas 4 e 6–9 não têm o que chamar.

- [ ] **Step 1: Despachar o `revisor-db`**

Obrigatório antes de aplicar (há migration e RPC). Passe ao agente: os dois arquivos SQL, o briefing, e peça atenção a — cobertura dos GRANT/REVOKE; `search_path = ''` em todas; se `estante.pode_gerir()` pode liberar alguém que não deveria; se a ordenação da view é determinística; se o RESTRICT da FK cobre o caminho de fora.

- [ ] **Step 2: Corrigir o que o revisor apontar**

Corrija **no arquivo da migration** (ainda não aplicada, então não precisa de migration corretiva) e commite.

- [ ] **Step 3: Aplicar**

```bash
npm run db:migrate
```

O wrapper faz o backup-gate e pede confirmação. **Nunca** `supabase db push` direto.

- [ ] **Step 4: Verificar EXECUTANDO via REST**

Introspecção não prova execução. Com `.env.local` carregado:

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/estante_listar_livros" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{}'
```

Esperado: `[]` (HTTP 200) — acervo vazio, RPC viva.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(v5.11.0/M1): migrations 0271/0272 aplicadas e verificadas via REST"
```

---

### Task 4: Prova comportamental das RPCs

**Files:**
- Create: `src/lib/estante/estante-rpcs.test.ts`
- Modify: `src/lib/sonda-teste-escreve-banco.test.ts` (lista `ESCREVEM_E_REVERTEM_HOJE`)

**Interfaces:**
- Consumes: as 7 RPCs da Tarefa 2, `SUPABASE_DB_URL`.
- Produces: nada que outra tarefa importe — é gate.

Escreve na base viva dentro de `BEGIN … ROLLBACK`, padrão da skill `banco-e-rpc` §6. O truque que faz as travas de permissão serem testáveis: `SET LOCAL request.jwt.claims` dentro da transação faz `app.uid_jwt()` e `app.tem_area` responderem como um usuário real.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest'

// ── v5.11.0 (0271/0272) — Estante Welcome: as recusas SÃO a regra de negócio ─────
// Prova COMPORTAMENTAL contra a base viva, em transação REVERTIDA (`BEGIN … ROLLBACK`,
// `pg` direto — contrato da skill `banco-e-rpc` §6). Cada caso monta o cenário dentro
// da transação, chama a RPC e confere; nada persiste.
//
// `SET LOCAL request.jwt.claims` é o que torna as travas de permissão testáveis: sem
// isso a conexão é superusuário, `app.uid_jwt()` devolve NULL e `estante.pode_gerir()`
// responde `true` por atalho — os ramos de recusa nunca seriam exercitados.

const DB_URL = process.env.SUPABASE_DB_URL

type Linha = Record<string, unknown>
type Cliente = { query: (q: string, p?: unknown[]) => Promise<{ rows: Linha[] }> }

async function emTransacaoRevertida<T>(f: (c: Cliente) => Promise<T>): Promise<T> {
  const { createRequire } = await import('node:module')
  const pg = createRequire(process.cwd() + '/')('pg')
  const c: Cliente & { connect: () => Promise<void>; end: () => Promise<void> } =
    new pg.Client({ connectionString: DB_URL })
  await c.connect()
  await c.query('BEGIN')
  await c.query(`SET LOCAL lock_timeout = '5s'`)
  try { return await f(c) } finally {
    await c.query('ROLLBACK')
    await c.end()
  }
}

/** Assume a identidade de um usuário real dentro da transação. */
async function comoUsuario(c: Cliente, uid: string): Promise<void> {
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: uid, role: 'authenticated' })])
}

/** Volta a ser superusuário (sem claims). */
async function comoServico(c: Cliente): Promise<void> {
  await c.query(`SELECT set_config('request.jwt.claims', '', true)`)
}

/** Chama a RPC sob SAVEPOINT: erro não derruba a transação do teste. */
async function chamar(c: Cliente, sql: string, p: unknown[]):
  Promise<{ ok: true; v: Linha } | { ok: false; msg: string }> {
  await c.query('SAVEPOINT chamada')
  try {
    const r = await c.query(sql, p)
    return { ok: true, v: r.rows[0] }
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT chamada')
    return { ok: false, msg: (e as Error).message }
  }
}

/** Dois usuários ativos QUAISQUER da base — sem depender de uuid fixo. */
async function doisUsuarios(c: Cliente): Promise<[string, string]> {
  const r = await c.query(
    `SELECT user_id FROM app.rbac_usuarios WHERE ativo ORDER BY criado_em LIMIT 2`)
  expect(r.rows.length).toBe(2)
  return [String(r.rows[0].user_id), String(r.rows[1].user_id)]
}

/** Dá as duas áreas da Estante à role do usuário, DENTRO da transação. */
async function darAreas(c: Cliente, uid: string, areas: string[]): Promise<void> {
  await c.query(
    `INSERT INTO app.rbac_role_permissoes (role_id, area)
     SELECT u.role_id, a FROM app.rbac_usuarios u, unnest($2::text[]) a
      WHERE u.user_id = $1
     ON CONFLICT DO NOTHING`, [uid, areas])
}

/** Tira as áreas da role do usuário, DENTRO da transação. */
async function tirarAreas(c: Cliente, uid: string, areas: string[]): Promise<void> {
  await c.query(
    `DELETE FROM app.rbac_role_permissoes rp
      USING app.rbac_usuarios u
      WHERE u.user_id = $1 AND rp.role_id = u.role_id AND rp.area = ANY($2::text[])`,
    [uid, areas])
}

async function criarLivro(c: Cliente, titulo: string): Promise<number> {
  const r = await c.query(`SELECT public.estante_criar_livro($1) AS v`, [titulo])
  return Number((r.rows[0].v as { id: number }).id)
}

const USO = 'gestao-pessoas/estante'
const GESTAO = 'gestao-pessoas/estante/gestao'
const MOV = `SELECT public.estante_registrar_movimentacao($1::bigint, $2::text, $3::uuid, $4::date, $5::text) AS v`

describe.skipIf(!DB_URL)('RPCs da Estante Welcome (0271/0272)', () => {
  it('livro sem movimentação nasce DISPONÍVEL', async () => {
    await emTransacaoRevertida(async c => {
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Essencialismo')
      const r = await c.query(`SELECT public.estante_listar_livros() AS v`)
      const linha = (r.rows[0].v as Array<{ id: number; emprestado: boolean; tem_historico: boolean }>)
        .find(l => Number(l.id) === id)
      expect(linha?.emprestado).toBe(false)
      expect(linha?.tem_historico).toBe(false)
    })
  })

  it('emprestar livro já emprestado ⇒ JA_EMPRESTADO', async () => {
    await emTransacaoRevertida(async c => {
      const [a, b] = await doisUsuarios(c)
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Mindset')
      const ok = await chamar(c, MOV, [id, 'emprestimo', a, null, null])
      expect(ok.ok).toBe(true)
      const dup = await chamar(c, MOV, [id, 'emprestimo', b, null, null])
      expect(dup.ok).toBe(false)
      if (!dup.ok) expect(dup.msg).toContain('JA_EMPRESTADO')
    })
  })

  it('devolver livro que está na estante ⇒ NAO_EMPRESTADO', async () => {
    await emTransacaoRevertida(async c => {
      const [a] = await doisUsuarios(c)
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Sapiens')
      const r = await chamar(c, MOV, [id, 'devolucao', a, null, null])
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.msg).toContain('NAO_EMPRESTADO')
    })
  })

  it('devolução de livro alheio: recusada SEM gestão, aceita COM gestão', async () => {
    await emTransacaoRevertida(async c => {
      const [a, b] = await doisUsuarios(c)
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Do Zero ao Um')
      await chamar(c, MOV, [id, 'emprestimo', a, null, null])   // A pegou (como serviço)

      // B só com a área de USO: recusado.
      await darAreas(c, b, [USO])
      await tirarAreas(c, b, [GESTAO])
      await comoUsuario(c, b)
      const semGestao = await chamar(c, MOV, [id, 'devolucao', null, null, null])
      expect(semGestao.ok).toBe(false)
      if (!semGestao.ok) expect(semGestao.msg).toContain('DEVOLUCAO_DE_OUTRO')

      // B com gestão: aceito, e a devolução fica no nome de QUEM ESTAVA com o livro.
      await comoServico(c)
      await darAreas(c, b, [GESTAO])
      await comoUsuario(c, b)
      const comGestao = await chamar(c, MOV, [id, 'devolucao', null, null, null])
      expect(comGestao.ok).toBe(true)

      await comoServico(c)
      const dono = await c.query(
        `SELECT usuario_id FROM estante.movimentacao
          WHERE livro_id = $1 AND tipo = 'devolucao' ORDER BY id DESC LIMIT 1`, [id])
      expect(String(dono.rows[0].usuario_id)).toBe(a)
    })
  })

  it('usuário só com a área de USO não cadastra livro', async () => {
    await emTransacaoRevertida(async c => {
      const [, b] = await doisUsuarios(c)
      await darAreas(c, b, [USO])
      await tirarAreas(c, b, [GESTAO])
      await comoUsuario(c, b)
      const r = await chamar(c, `SELECT public.estante_criar_livro($1) AS v`, ['ZZ_TESTE_0271 Proibido'])
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.msg).toContain('PERMISSAO_NEGADA')
    })
  })

  it('remover: livro virgem APAGA, livro com razão ARQUIVA e o histórico sobrevive', async () => {
    await emTransacaoRevertida(async c => {
      const [a] = await doisUsuarios(c)

      const virgem = await criarLivro(c, 'ZZ_TESTE_0271 Nunca Emprestado')
      const r1 = await c.query(`SELECT public.estante_remover_livro($1::bigint) AS v`, [virgem])
      expect((r1.rows[0].v as { acao: string }).acao).toBe('apagado')
      const sumiu = await c.query(`SELECT 1 FROM estante.livro WHERE id = $1`, [virgem])
      expect(sumiu.rows.length).toBe(0)

      const usado = await criarLivro(c, 'ZZ_TESTE_0271 Já Rodou')
      await chamar(c, MOV, [usado, 'emprestimo', a, null, null])
      const r2 = await c.query(`SELECT public.estante_remover_livro($1::bigint) AS v`, [usado])
      expect((r2.rows[0].v as { acao: string }).acao).toBe('arquivado')
      const razao = await c.query(`SELECT count(*) AS n FROM estante.movimentacao WHERE livro_id = $1`, [usado])
      expect(Number(razao.rows[0].n)).toBe(1)
    })
  })

  it('livro arquivado não aceita movimentação', async () => {
    await emTransacaoRevertida(async c => {
      const [a] = await doisUsuarios(c)
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Arquivado')
      await chamar(c, MOV, [id, 'emprestimo', a, null, null])
      await c.query(`SELECT public.estante_remover_livro($1::bigint)`, [id])
      const r = await chamar(c, MOV, [id, 'devolucao', a, null, null])
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.msg).toContain('LIVRO_ARQUIVADO')
    })
  })

  it('devolução com data ANTERIOR ao empréstimo não inverte o estado (desempate por criado_em)', async () => {
    await emTransacaoRevertida(async c => {
      const [a] = await doisUsuarios(c)
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Retroativo')
      await chamar(c, MOV, [id, 'emprestimo', a, '2026-09-10', null])
      // Devolução datada ANTES: a data manda, então o livro fica emprestado de novo?
      // Não — a ordenação é (data DESC, criado_em DESC, id DESC) e o empréstimo é o
      // mais recente por data. Este teste PRENDE esse comportamento.
      await chamar(c, MOV, [id, 'devolucao', a, '2026-09-01', null])
      const r = await c.query(`SELECT emprestado FROM estante.v_estado_atual WHERE livro_id = $1`, [id])
      expect(r.rows[0].emprestado).toBe(true)
    })
  })

  it('ano fora do intervalo ⇒ ANO_INVALIDO', async () => {
    await emTransacaoRevertida(async c => {
      const r = await chamar(c,
        `SELECT public.estante_criar_livro($1, NULL, NULL, $2::smallint) AS v`,
        ['ZZ_TESTE_0271 Ano Ruim', 1200])
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.msg).toContain('ANO_INVALIDO')
    })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar se a migration não estiver aplicada**

```bash
npx vitest run src/lib/estante/estante-rpcs.test.ts
```

Esperado **antes** da Tarefa 3: erro de função inexistente. **Depois** da Tarefa 3: todos passam (ou pulam, offline).

- [ ] **Step 3: Registrar na sonda de escrita**

Em `src/lib/sonda-teste-escreve-banco.test.ts`, acrescente à lista `ESCREVEM_E_REVERTEM_HOJE`:

```ts
  'src/lib/estante/estante-rpcs.test.ts', // v5.11.0 (0271/0272) — recusas da Estante
```

- [ ] **Step 4: Rodar a sonda e a suíte**

```bash
npx vitest run src/lib/sonda-teste-escreve-banco.test.ts src/lib/estante/estante-rpcs.test.ts
```

Esperado: PASS nos dois. A sonda reclama se o arquivo novo não estiver declarado — é esse o ponto dela.

> **Gatilho de reavaliação:** a lista `ESCREVEM_E_REVERTEM_HOJE` passa a ter **3** arquivos. A skill `banco-e-rpc` §6 manda reabrir a decisão de ambiente de teste próprio "à 3ª ou 4ª RPC testada assim" — registre a contagem no out-briefing (Tarefa 10) e diga ao Yan que o gatilho foi tocado.

- [ ] **Step 5: Commit**

```bash
git add src/lib/estante/estante-rpcs.test.ts src/lib/sonda-teste-escreve-banco.test.ts
git commit -m "test(v5.11.0/M1): prova comportamental das RPCs da Estante"
```

---

### Task 5: Áreas, rota e sidebar

**Files:**
- Modify: `src/lib/auth/areas.ts`, `src/lib/auth/areas.test.ts`, `src/components/layout/nav-model.ts`

**Interfaces:**
- Produces: as áreas `'gestao-pessoas/estante'` e `'gestao-pessoas/estante/gestao'` no tipo `Area`; `areasDaRota('/gestao-pessoas/estante')` devolvendo as duas.

> **Invariante 9 do briefing — a armadilha desta tarefa.** Hoje `areasDaRota` casa `/gestao-pessoas` inteiro com `['gestao-pessoas/inventario']`. Se a regra nova for acrescentada **depois** dela, nunca é alcançada: prefix-match vai do mais específico ao mais genérico, e a genérica casa primeiro.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/auth/areas.test.ts`, dentro do `describe` de `areasDaRota`:

```ts
  it('Estante e Inventário não se confundem dentro de /gestao-pessoas', () => {
    expect(areasDaRota('/gestao-pessoas/estante')).toEqual([
      'gestao-pessoas/estante', 'gestao-pessoas/estante/gestao',
    ])
    expect(areasDaRota('/gestao-pessoas/inventario')).toEqual(['gestao-pessoas/inventario'])
  })
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/lib/auth/areas.test.ts
```

Esperado: FAIL — `/gestao-pessoas/estante` devolve `['gestao-pessoas/inventario']`.

- [ ] **Step 3: Declarar as áreas**

Em `src/lib/auth/areas.ts`, no array `AREAS`, depois de `'gestao-pessoas/inventario'`:

```ts
  'gestao-pessoas/estante',
  'gestao-pessoas/estante/gestao',
```

E em `AREA_INFO`:

```ts
  // Gestão de Pessoas · Estante Welcome (v5.11.0, migration 0271). DOIS níveis, molde de
  // Acervo/Solicitações: 'gestao-pessoas/estante' = ver a estante e registrar que pegou ou
  // devolveu; '/gestao' = o catálogo (incluir/editar/excluir livro) e devolver em nome de
  // outra pessoa — e INCLUI a de uso, porque a página faz OR das duas. Gate inicial
  // apertado no seed (só quem já tinha 'admin/acessos').
  'gestao-pessoas/estante':        { rotulo: 'Estante Welcome',          grupo: 'Gestão de Pessoas', ordem: 61 },
  'gestao-pessoas/estante/gestao': { rotulo: 'Estante Welcome (gestão)', grupo: 'Gestão de Pessoas', ordem: 62 },
```

- [ ] **Step 4: Desdobrar a rota**

Em `areasDaRota`, **substitua** a linha genérica de `/gestao-pessoas` por (ordem importa — a específica primeiro):

```ts
  // Gestão de Pessoas tem DOIS módulos desde a v5.11.0: a regra genérica que existia aqui
  // mandava /gestao-pessoas inteiro para o Inventário, o que faria a Estante nascer gated
  // pela área errada (usuário só de Estante cairia em /sem-acesso). Específicas primeiro.
  if (p.startsWith('/gestao-pessoas/estante'))    return ['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao']
  if (p.startsWith('/gestao-pessoas/inventario')) return ['gestao-pessoas/inventario']
  // Raiz da seção (só o item-pai da sidebar; não há página em /gestao-pessoas): qualquer
  // módulo da seção libera.
  if (p.startsWith('/gestao-pessoas'))            return ['gestao-pessoas/inventario', 'gestao-pessoas/estante', 'gestao-pessoas/estante/gestao']
```

- [ ] **Step 5: Rodar os testes**

```bash
npx vitest run src/lib/auth/areas.test.ts
```

Esperado: PASS (inclusive `AREA_INFO cobre exatamente AREAS`).

- [ ] **Step 6: Sidebar**

Em `src/components/layout/nav-model.ts`, importe `BookOpen` de `lucide-react` (junto dos outros ícones) e acrescente a `GESTAO_PESSOAS_SUBS`:

```ts
  // v5.11.0 — 2º módulo da seção. `areasAny`: a área de gestão INCLUI a de uso, então
  // qualquer uma das duas faz o item aparecer.
  { href: '/gestao-pessoas/estante', label: 'Estante Welcome', icon: BookOpen, area: 'gestao-pessoas/estante', areasAny: ['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao'] },
```

Se `NavSubItem` não tiver `areasAny`, confira como `NAV_ITEMS` o usa em `/solicitacoes` (`src/components/layout/nav-model.ts:105`) e espelhe o mesmo campo no tipo do sub-item; o filtro de render já é genérico.

- [ ] **Step 7: Gates e paridade banco↔app**

```bash
npx tsc --noEmit && npm run lint && npx vitest run src/components/layout/nav-model.test.ts src/lib/rpc-contrato.test.ts
```

Esperado: PASS. O teste `catálogo de áreas: banco ↔ app` só passa porque a Tarefa 3 já aplicou a 0271 — as duas pontas viram juntas.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/areas.ts src/lib/auth/areas.test.ts src/components/layout/nav-model.ts
git commit -m "feat(v5.11.0/M2): areas, rota desdobrada e sidebar da Estante"
```

---

### Task 6: Camada de contrato — tipos, schemas, helper e leitura

**Files:**
- Create: `src/components/gestao-pessoas/estante/tipos.ts`, `src/lib/estante/rpc-estante.ts`, `src/lib/estante/carregar.ts`
- Modify: `src/lib/schemas-rpc.ts`

**Interfaces:**
- Consumes: RPCs da Tarefa 2.
- Produces: `LivroLista`, `MovimentacaoEstante`, `TipoMovimentacaoEstante`, `rpcEstante(db, fn, args)`, `carregarEstante(): Promise<DadosEstante>` com `{ livros, movimentacoes, erro }`, `estanteLivrosSchema`, `estanteMovimentacoesSchema`.

- [ ] **Step 1: Tipos**

`src/components/gestao-pessoas/estante/tipos.ts`:

```ts
// Tipos da Estante Welcome (v5.11.0). Espelham o jsonb das RPCs `estante_*` (0272);
// a validação de shape é dos schemas Zod em @/lib/schemas-rpc.

export type TipoMovimentacaoEstante = 'emprestimo' | 'devolucao'

/** Uma linha do acervo, com o estado DERIVADO da última movimentação. */
export interface LivroLista {
  id: number
  titulo: string
  autor: string | null
  editora: string | null
  ano: number | null
  isbn: string | null
  obs: string | null
  arquivado: boolean
  emprestado: boolean
  /** Só preenchidos quando `emprestado`. */
  portador_id: string | null
  portador_nome: string | null
  desde: string | null
  /** Já teve movimentação ⇒ excluir vai ARQUIVAR, não apagar. */
  tem_historico: boolean
}

/** Uma linha do razão. `livro_titulo` só vem do razão global — daí opcional. */
export interface MovimentacaoEstante {
  id: number
  livro_id: number
  livro_titulo?: string
  tipo: TipoMovimentacaoEstante
  usuario_id: string
  usuario_nome: string | null
  data_movimentacao: string
  obs: string | null
  criado_em: string
}
```

- [ ] **Step 2: Schemas Zod**

Em `src/lib/schemas-rpc.ts`, ao lado dos `patrimonio*`:

```ts
/** Uma linha do acervo, com o estado DERIVADO da última movimentação. `estante_detalhe_livro`
 *  devolve o livro NESTE mesmo formato (não `to_jsonb` cru) — uma forma só para os dois
 *  caminhos, senão a ficha e a lista divergiriam de tipo. */
export const estanteLivroSchema = z.object({
  id:            z.number(),
  titulo:        z.string(),
  autor:         z.string().nullable(),
  editora:       z.string().nullable(),
  ano:           z.number().nullable(),
  isbn:          z.string().nullable(),
  obs:           z.string().nullable(),
  arquivado:     z.boolean(),
  emprestado:    z.boolean(),
  portador_id:   z.string().nullable(),
  portador_nome: z.string().nullable(),
  desde:         z.string().nullable(),
  tem_historico: z.boolean(),
}).passthrough()

/** estante_listar_livros → o acervo inteiro. */
export const estanteLivrosSchema = z.array(estanteLivroSchema)

/** estante_listar_movimentacoes / detalhe. `livro_titulo` só vem do razão global:
 *  `.optional()`, não `.nullable()` — a chave AUSENTE reprovaria um schema só nullable. */
export const estanteMovimentacoesSchema = z.array(z.object({
  id:                z.number(),
  livro_id:          z.number(),
  livro_titulo:      z.string().optional(),
  tipo:              z.enum(['emprestimo', 'devolucao']),
  usuario_id:        z.string(),
  usuario_nome:      z.string().nullable(),
  data_movimentacao: z.string(),
  obs:               z.string().nullable(),
  criado_em:         z.string(),
}).passthrough())

/** estante_detalhe_livro → ficha + razão do exemplar, numa única leitura (invariante 10). */
export const estanteFichaSchema = z.object({
  livro:         estanteLivroSchema,
  movimentacoes: estanteMovimentacoesSchema,
})
```

- [ ] **Step 3: Helper de RPC**

`src/lib/estante/rpc-estante.ts`:

```ts
import type { ServerClient } from '@/lib/supabase/server'
import type { RpcLike } from '@/lib/rpc'

// As RPCs da Estante (0272) não estão no `database.ts` gerado — que está CONGELADO desde
// ~v4.29. Mesma convenção de patrimônio/acervo/metas: helper de tipagem frouxa, e o SHAPE
// do retorno validado por `parseRpc` no call-site.
//
// ⚠️ O `.call(db, …)` não é enfeite: `SupabaseClient.rpc` é método de PROTÓTIPO cujo corpo é
// `this.rest.rpc(...)`. Guardar a referência numa variável DESTACA o método e o `this` vira
// undefined em runtime (custou 18 dias de solicitações perdidas na v5.3.5).
export function rpcEstante(
  db: ServerClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RpcLike> {
  const call = db.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<RpcLike>
  return call.call(db, fn, args)
}
```

- [ ] **Step 4: Leitura agregada**

`src/lib/estante/carregar.ts`:

```ts
import { getServerClient } from '@/lib/supabase/server'
import { rpcEstante } from '@/lib/estante/rpc-estante'
import { parseRpc, estanteLivrosSchema, estanteMovimentacoesSchema } from '@/lib/schemas-rpc'
import type { LivroLista, MovimentacaoEstante } from '@/components/gestao-pessoas/estante/tipos'

// Leitura da Estante Welcome (v5.11.0/M3): duas RPCs, uma ida ao banco cada, disparadas juntas.
//
// ⚠️ `Promise.allSettled`, NUNCA `.catch()` encadeado: o retorno de `.rpc()` do supabase-js é
// *thenable* (tem `.then`, NÃO tem `.catch`) — encadear compila e estoura em runtime, com
// todos os gates verdes (custou a página da DRE inteira na v5.3.0).
//
// FAIL-SAFE (invariante 12): RPC que falha degrada para vazio e a página continua viva; o flag
// `erro` é o que permite a UI dizer "não foi possível carregar" em vez de fingir estante vazia.

export interface DadosEstante {
  livros: LivroLista[]
  movimentacoes: MovimentacaoEstante[]
  /** Alguma das leituras falhou (≠ estante legitimamente vazia). */
  erro: boolean
}

export async function carregarEstante(): Promise<DadosEstante> {
  const db = await getServerClient()

  const [rLivros, rMovs] = await Promise.allSettled([
    // Sem filtros de propósito: uma estante de escritório são dezenas de linhas, então o
    // acervo inteiro vem uma vez e busca/filtro rodam no cliente (instantâneos). Os
    // parâmetros da RPC seguem disponíveis para quem precisar paginar.
    rpcEstante(db, 'estante_listar_livros'),
    rpcEstante(db, 'estante_listar_movimentacoes', { p_limite: 2000 }),
  ])

  const livros = rLivros.status === 'fulfilled'
    ? parseRpc(estanteLivrosSchema, rLivros.value, 'estante_listar_livros')
    : null
  const movs = rMovs.status === 'fulfilled'
    ? parseRpc(estanteMovimentacoesSchema, rMovs.value, 'estante_listar_movimentacoes')
    : null

  return {
    livros: livros ?? [],
    movimentacoes: movs ?? [],
    erro: livros === null || movs === null,
  }
}
```

- [ ] **Step 5: Gate**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/components/gestao-pessoas/estante/tipos.ts src/lib/estante src/lib/schemas-rpc.ts
git commit -m "feat(v5.11.0/M3): contrato da Estante — tipos, schemas, helper e leitura"
```

---

### Task 7: Página e Server Actions

**Files:**
- Create: `src/app/gestao-pessoas/estante/page.tsx`, `loading.tsx`, `actions.ts`

**Interfaces:**
- Consumes: `carregarEstante`, `rpcEstante`, `requireArea`/`requireAreaAction`.
- Produces: `Resultado`, `criarLivro(entrada)`, `atualizarLivro(id, entrada)`, `removerLivro(id)`, `registrarMovimentacao(entrada)`, `carregarFicha(id)` — consumidos pelos componentes das Tarefas 8 e 9. `LivroEntrada`, `MovimentacaoEntrada`, `Ficha`.

- [ ] **Step 1: `actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireAreaAction } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { rpcEstante } from '@/lib/estante/rpc-estante'
import { parseRpc, estanteFichaSchema } from '@/lib/schemas-rpc'
import type {
  LivroLista, MovimentacaoEstante, TipoMovimentacaoEstante,
} from '@/components/gestao-pessoas/estante/tipos'

// Escrita da Estante Welcome (v5.11.0/M3-M4). DOIS níveis: catálogo exige
// 'gestao-pessoas/estante/gestao'; movimentação, a área de uso.
//
// Nenhuma regra de negócio vive aqui. As RPCs da 0272 são a barreira (já emprestado, não
// emprestado, arquivado, devolução alheia) e estas actions só traduzem o erro delas para
// uma frase que o usuário entende. Duplicar a validação no TS criaria uma segunda verdade
// que envelhece — a do banco é a que vale.

const ROTA = '/gestao-pessoas/estante'
const USO = ['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao'] as const
const GESTAO = 'gestao-pessoas/estante/gestao' as const

export type Resultado =
  | { ok: true; id: number; mensagem?: string }
  | { ok: false; erro: string }

export interface LivroEntrada {
  titulo: string
  autor: string | null
  editora: string | null
  ano: number | null
  isbn: string | null
  obs: string | null
}

export interface MovimentacaoEntrada {
  livro_id: number
  tipo: TipoMovimentacaoEstante
  data_movimentacao: string | null
  obs: string | null
}

/**
 * Erro da RPC → frase para o usuário. Os prefixos são o contrato combinado com a 0272; o
 * `else` genérico existe porque mensagem crua de Postgres na tela não ajuda ninguém.
 *
 * O caminho genérico é LOGADO no servidor de propósito: sem isso, um erro que ninguém
 * previu viraria "tente novamente" na tela e NADA no log.
 */
function traduzirErro(msg: string): string {
  if (msg.includes('TITULO_OBRIGATORIO'))    return 'Informe o título do livro.'
  if (msg.includes('ANO_INVALIDO'))          return 'Ano fora do intervalo aceito — confira o número.'
  if (msg.includes('LIVRO_NAO_ENCONTRADO'))  return 'Este livro não existe mais. Recarregue a página.'
  if (msg.includes('LIVRO_ARQUIVADO'))       return 'Este livro foi arquivado e não aceita movimentação.'
  if (msg.includes('JA_EMPRESTADO'))         return 'Este livro já está com outra pessoa.'
  if (msg.includes('NAO_EMPRESTADO'))        return 'Este livro já está na estante.'
  if (msg.includes('DEVOLUCAO_DE_OUTRO'))    return 'Este livro está com outra pessoa — só quem administra a estante devolve por ela.'
  if (msg.includes('EMPRESTIMO_PARA_OUTRO')) return 'Só quem administra a estante registra empréstimo em nome de outra pessoa.'
  if (msg.includes('USUARIO_DESCONHECIDO'))  return 'Pessoa sem cadastro ativo no Janus.'
  if (msg.includes('USUARIO_OBRIGATORIO'))   return 'Não foi possível identificar de quem é a movimentação. Recarregue a página.'
  if (msg.includes('DATA_INVALIDA'))         return 'Data fora do intervalo aceito — confira o ano.'
  if (msg.includes('TIPO_INVALIDO'))         return 'Tipo de movimentação inválido.'
  if (msg.includes('USUARIO_INATIVO'))       return 'Seu acesso foi desativado. Recarregue a página.'
  if (msg.includes('PERMISSAO_NEGADA') || msg.includes('AUTH'))
    return 'Sem permissão para esta ação na Estante.'
  console.error('[estante] erro não previsto da RPC:', msg)
  return 'Não foi possível concluir. Tente novamente.'
}

function idDe(data: unknown): number | null {
  const v = (data as { id?: unknown } | null)?.id
  return typeof v === 'number' ? v : null
}

export async function criarLivro(entrada: LivroEntrada): Promise<Resultado> {
  await requireAreaAction(GESTAO)
  const db = await getServerClient()
  const { data, error } = await rpcEstante(db, 'estante_criar_livro', {
    p_titulo: entrada.titulo, p_autor: entrada.autor, p_editora: entrada.editora,
    p_ano: entrada.ano, p_isbn: entrada.isbn, p_obs: entrada.obs,
  })
  // ⚠️ O SDK do Supabase NÃO lança: o erro vem no campo `error`. Checar só o try/catch
  // deixaria a falha passar como sucesso (lição da v5.9.1).
  if (error) return { ok: false, erro: traduzirErro(error.message) }
  const id = idDe(data)
  if (id === null) return { ok: false, erro: 'Não foi possível cadastrar o livro.' }
  revalidatePath(ROTA)
  return { ok: true, id }
}

export async function atualizarLivro(id: number, entrada: LivroEntrada): Promise<Resultado> {
  await requireAreaAction(GESTAO)
  const db = await getServerClient()
  const { error } = await rpcEstante(db, 'estante_atualizar_livro', {
    p_id: id, p_titulo: entrada.titulo, p_autor: entrada.autor, p_editora: entrada.editora,
    p_ano: entrada.ano, p_isbn: entrada.isbn, p_obs: entrada.obs,
  })
  if (error) return { ok: false, erro: traduzirErro(error.message) }
  revalidatePath(ROTA)
  return { ok: true, id }
}

export async function removerLivro(id: number): Promise<Resultado> {
  await requireAreaAction(GESTAO)
  const db = await getServerClient()
  const { data, error } = await rpcEstante(db, 'estante_remover_livro', { p_id: id })
  if (error) return { ok: false, erro: traduzirErro(error.message) }
  const acao = (data as { acao?: unknown } | null)?.acao
  revalidatePath(ROTA)
  return {
    ok: true,
    id,
    mensagem: acao === 'arquivado'
      ? 'Livro arquivado: ele já teve empréstimo, e o histórico continua registrado.'
      : 'Livro excluído.',
  }
}

export interface Ficha {
  livro: LivroLista
  movimentacoes: MovimentacaoEstante[]
}

/**
 * Ficha + razão do exemplar numa ÚNICA leitura (invariante 10 do briefing). O drawer
 * NÃO reaproveita a lista já carregada: entre o render da página e a abertura do drawer
 * alguém pode ter pegado o livro, e mostrar razão defasado numa tela cujo propósito é
 * dizer "quem está com isto" seria o pior lugar para estar desatualizado.
 */
export async function carregarFicha(id: number): Promise<Ficha | null> {
  await requireAreaAction([...USO])
  const db = await getServerClient()
  const r = await rpcEstante(db, 'estante_detalhe_livro', { p_id: id })
  if (r.error) {
    console.error('[estante] estante_detalhe_livro:', r.error.message)
    return null
  }
  return parseRpc(estanteFichaSchema, r, 'estante_detalhe_livro')
}

export async function registrarMovimentacao(entrada: MovimentacaoEntrada): Promise<Resultado> {
  await requireAreaAction([...USO])
  const db = await getServerClient()
  // `p_usuario_id` fica de fora: a RPC deriva do JWT. Só a gestão pode informar outra
  // pessoa, e essa porta não é aberta pela UI desta versão.
  const { data, error } = await rpcEstante(db, 'estante_registrar_movimentacao', {
    p_livro_id: entrada.livro_id,
    p_tipo: entrada.tipo,
    p_data_movimentacao: entrada.data_movimentacao,
    p_obs: entrada.obs,
  })
  if (error) return { ok: false, erro: traduzirErro(error.message) }
  const id = idDe(data)
  if (id === null) return { ok: false, erro: 'Não foi possível registrar a movimentação.' }
  revalidatePath(ROTA)
  return { ok: true, id }
}
```

- [ ] **Step 2: `page.tsx`**

```tsx
import { requireArea } from '@/lib/auth/sessao'
import { carregarEstante } from '@/lib/estante/carregar'
import EstanteContent from '@/components/gestao-pessoas/estante/estante-content'

// Gestão de Pessoas · Estante Welcome (v5.11.0).
//
// DOIS níveis (migration 0271): a página abre com a área de uso OU a de gestão — a de
// gestão inclui a de uso. O que a gestão libera a mais (cadastrar, editar, excluir,
// devolver em nome de outra pessoa) é decidido por `podeGerir`, e o banco é o backstop:
// as RPCs de catálogo exigem a área de gestão por conta própria.
export const dynamic = 'force-dynamic'

export default async function EstantePage() {
  const sessao = await requireArea(['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao'])
  const dados = await carregarEstante()

  return (
    <EstanteContent
      livros={dados.livros}
      movimentacoes={dados.movimentacoes}
      erroDeLeitura={dados.erro}
      podeGerir={sessao.permissoes.includes('gestao-pessoas/estante/gestao')}
      meuId={sessao.userId}
    />
  )
}
```

- [ ] **Step 3: `loading.tsx`**

Copie `src/app/gestao-pessoas/inventario/loading.tsx` trocando o texto do título para "Estante Welcome" (ADR-0144: toda rota pesada tem skeleton).

- [ ] **Step 4: Gate**

```bash
npx tsc --noEmit
```

Esperado: erro **só** de `estante-content` inexistente (é a Tarefa 8). Confirme que não há nenhum outro.

- [ ] **Step 5: Commit**

```bash
git add src/app/gestao-pessoas/estante
git commit -m "feat(v5.11.0/M3): rota e server actions da Estante"
```

---

### Task 8: Acervo — casca, tabela, ficha e catálogo

**Files:**
- Create: `src/components/gestao-pessoas/estante/estado-badge.tsx`, `estante-content.tsx`, `acervo-tab.tsx`, `livro-form-modal.tsx`, `remover-livro-modal.tsx`, `ficha-drawer.tsx`

**Interfaces:**
- Consumes: `LivroLista`, `MovimentacaoEstante`, as actions da Tarefa 7.
- Produces: `EstanteContent` (default export) com props `{ livros: LivroLista[]; movimentacoes: MovimentacaoEstante[]; erroDeLeitura: boolean; podeGerir: boolean; meuId: string | null }`.

**Moldes a copiar (não reinventar):** `src/components/gestao-pessoas/inventario/inventario-content.tsx` (abas sempre montadas, alternando por `hidden`), `ativos-tab.tsx` (tabela densa + busca), `ativo-form-modal.tsx` (modal de formulário), `ficha-drawer.tsx` (drawer), `status-badge.tsx` (pill). Leia as skills `ui-design-system` e `tabela-densa` antes do primeiro `className`.

- [ ] **Step 1: `estado-badge.tsx`**

```tsx
import type { LivroLista } from './tipos'

// Pill de estado do exemplar. Dois estados só (a versão não tem manutenção nem baixa).
// Cores por TOKEN semântico — zero hex (lint wt/no-cor-hardcoded).
export default function EstadoBadge({ livro }: { livro: LivroLista }) {
  if (!livro.emprestado) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-[var(--positive-soft)] text-[var(--positive)]">
        Disponível
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-[var(--warning-soft)] text-[var(--warning)]">
      Emprestado
    </span>
  )
}
```

Confirme os nomes dos tokens em `src/app/globals.css` antes de commitar; se `--positive-soft`/`--warning-soft` não existirem, use os equivalentes que `status-badge.tsx` do Inventário já usa — **não** crie token novo.

- [ ] **Step 2: `estante-content.tsx`**

Componente `'use client'` com:
- estado `aba: 'acervo' | 'historico'`, as duas abas **sempre montadas** alternando por `hidden` (molde `inventario-content.tsx`);
- estado `livroAberto: LivroLista | null` (drawer), `livroEmEdicao`, `livroParaRemover`, `livroParaMovimentar`;
- banner de erro quando `erroDeLeitura` (texto: "Não foi possível carregar a estante. Tente recarregar a página.");
- botão primário "Cadastrar livro" **só** quando `podeGerir`;
- `const router = useRouter()` e, após cada action bem-sucedida, `router.refresh()`.

- [ ] **Step 3: `acervo-tab.tsx`**

Tabela densa (skill `tabela-densa`: `border-separate`, cabeçalho sticky com fundo **na célula** sem alfa, sem caixa alta, sem negrito). Colunas: **Título** (com autor em linha secundária), **Ano**, **Estado** (`EstadoBadge`), **Com quem** (`portador_nome` + "desde " `desde` formatado por `fmtDataSP`; travessão quando disponível), **Ações**.

Busca livre no cliente filtrando por título, autor e `portador_nome` (o acervo inteiro já veio); filtro de estado com as pills compartilhadas.

O botão de ação da linha é derivado do estado — esta é a regra que o teste da Tarefa 9 prende:

```tsx
// Livro disponível: qualquer um pega. Emprestado a MIM: eu devolvo. Emprestado a
// OUTRA pessoa: só a gestão devolve — para os demais, nenhum botão (e não um botão
// que erra quando clicado).
const acao = !livro.emprestado
  ? 'pegar'
  : livro.portador_id === meuId || podeGerir
    ? 'devolver'
    : null
```

- [ ] **Step 4: `livro-form-modal.tsx`**

Campos: Título (obrigatório), Autor, Editora, Ano (numérico), ISBN, Observação. Chama `criarLivro` ou `atualizarLivro`; erro da action renderizado **dentro do modal**, junto do botão (lição da v5.4.3: erro fora da vista não é visto). Sem nenhum campo de estado/portador — quem está com o livro muda só por movimentação.

- [ ] **Step 5: `remover-livro-modal.tsx`**

Confirmação que diz a verdade **antes** de agir, usando `livro.tem_historico`:
- sem histórico: "Excluir **{título}**? O livro nunca foi emprestado, então some da estante para sempre."
- com histórico: "Arquivar **{título}**? Ele já teve empréstimos, então sai da estante mas o histórico continua registrado."

Após o `ok`, mostre `resultado.mensagem` (a action devolve qual dos dois o banco fez — a RPC é a verdade, não o palpite da tela).

- [ ] **Step 6: `ficha-drawer.tsx`**

Grade de dados do livro + razão daquele exemplar, mais recente primeiro, cada linha "Fulano pegou / devolveu · 12/09/2026" com `obs` quando houver. Molde: `inventario/ficha-drawer.tsx` (ADR-0092).

O conteúdo vem de `carregarFicha(id)` **ao abrir**, não da lista já carregada: entre o render da página e o clique, alguém pode ter pegado o livro, e defasagem numa tela cujo propósito é dizer "quem está com isto" é o pior lugar para estar desatualizado. Enquanto a promessa não resolve, skeleton; se voltar `null`, a frase "Não foi possível carregar a ficha." — a página segue viva (invariante 12).

- [ ] **Step 7: Gate**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: sem erro (o `historico-tab` ainda não existe — deixe a aba Histórico renderizando um placeholder vazio e substitua na Tarefa 9, ou crie as duas juntas se preferir).

- [ ] **Step 8: Commit**

```bash
git add src/components/gestao-pessoas/estante
git commit -m "feat(v5.11.0/M3): acervo da Estante — tabela, ficha e catálogo"
```

---

### Task 9: Movimentação e histórico

**Files:**
- Create: `src/components/gestao-pessoas/estante/movimentacao-modal.tsx`, `historico-tab.tsx`, `acao-da-linha.ts`, `acao-da-linha.test.ts`
- Modify: `acervo-tab.tsx`, `estante-content.tsx` (ligar o modal e a aba)

**Interfaces:**
- Consumes: `registrarMovimentacao` (Tarefa 7), `MovimentacaoEstante`.
- Produces: `acaoDaLinha(livro, meuId, podeGerir): 'pegar' | 'devolver' | null` — extraída para módulo próprio para ser testável sem render.

- [ ] **Step 1: Escrever o teste da regra do botão**

`src/components/gestao-pessoas/estante/acao-da-linha.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { acaoDaLinha } from './acao-da-linha'
import type { LivroLista } from './tipos'

// A regra do botão da linha é a face visível das travas da 0272. Se ela oferecer
// "Devolver" para quem o banco vai recusar, o usuário leva um erro que a tela podia
// ter evitado — e a recíproca (esconder de quem PODE) esconde função de gestão.

const base: LivroLista = {
  id: 1, titulo: 'Essencialismo', autor: null, editora: null, ano: null, isbn: null,
  obs: null, arquivado: false, emprestado: false, portador_id: null, portador_nome: null,
  desde: null, tem_historico: false,
}
const EU = 'uuid-eu'
const OUTRO = 'uuid-outro'

describe('acaoDaLinha', () => {
  it('livro disponível: qualquer um pega', () => {
    expect(acaoDaLinha(base, EU, false)).toBe('pegar')
  })

  it('livro comigo: eu devolvo', () => {
    expect(acaoDaLinha({ ...base, emprestado: true, portador_id: EU }, EU, false)).toBe('devolver')
  })

  it('livro com outra pessoa, sem gestão: nenhum botão', () => {
    expect(acaoDaLinha({ ...base, emprestado: true, portador_id: OUTRO }, EU, false)).toBe(null)
  })

  it('livro com outra pessoa, COM gestão: devolve por ela', () => {
    expect(acaoDaLinha({ ...base, emprestado: true, portador_id: OUTRO }, EU, true)).toBe('devolver')
  })

  it('sessão sem id não oferece devolução de livro alheio', () => {
    expect(acaoDaLinha({ ...base, emprestado: true, portador_id: OUTRO }, null, false)).toBe(null)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/components/gestao-pessoas/estante/acao-da-linha.test.ts
```

Esperado: FAIL — módulo `./acao-da-linha` não existe.

- [ ] **Step 3: Implementar**

`src/components/gestao-pessoas/estante/acao-da-linha.ts`:

```ts
import type { LivroLista } from './tipos'

export type AcaoLinha = 'pegar' | 'devolver' | null

/**
 * Qual botão a linha oferece. Espelha as travas da RPC `estante_registrar_movimentacao`
 * (0272): `JA_EMPRESTADO` e `DEVOLUCAO_DE_OUTRO`. A tela não DECIDE nada — o banco continua
 * sendo a barreira; ela só evita oferecer o que será recusado.
 */
export function acaoDaLinha(
  livro: LivroLista,
  meuId: string | null,
  podeGerir: boolean,
): AcaoLinha {
  if (livro.arquivado) return null
  if (!livro.emprestado) return 'pegar'
  if (podeGerir) return 'devolver'
  return meuId !== null && livro.portador_id === meuId ? 'devolver' : null
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/components/gestao-pessoas/estante/acao-da-linha.test.ts
```

Esperado: PASS (5 casos).

- [ ] **Step 5: `movimentacao-modal.tsx`**

Modal curto: título do livro, o que vai acontecer em uma frase ("Registrar que você pegou **Essencialismo**" / "Registrar a devolução de **Essencialismo**, que está com Ana"), campo de data (default hoje, retroativa liberada) e `obs` opcional. Chama `registrarMovimentacao`; erro renderizado dentro do modal; sucesso fecha e chama `router.refresh()`.

- [ ] **Step 6: `historico-tab.tsx`**

Tabela densa do razão completo: Data, Livro (clique abre a ficha), Quem, O que (pill "Pegou"/"Devolveu"), Observação. Filtro por tipo e busca por livro/pessoa, ambos no cliente.

- [ ] **Step 7: Ligar em `acervo-tab.tsx` e `estante-content.tsx`**

Troque a expressão inline do botão pela chamada a `acaoDaLinha`, e substitua o placeholder da aba Histórico por `<HistoricoTab …>`.

- [ ] **Step 8: Gates cheios**

```bash
npx tsc --noEmit && npm run lint && npm run build && npm test
```

Esperado: tudo verde. A suíte sobe de 1.225 para ~1.239 testes (9 de RPC + 5 da regra do botão).

- [ ] **Step 9: Commit**

```bash
git add src/components/gestao-pessoas/estante
git commit -m "feat(v5.11.0/M4): movimentacao e historico da Estante"
```

---

### Task 10: Revisão, verificação visual e fechamento

**Files:**
- Create: `docs/adr/0174-estante-welcome-razao-de-emprestimos.md`
- Modify: `package.json`, `docs/changelog.md`, `src/data/changelog-diretoria.ts`, `docs/WORKING-CONTEXT.md`

- [ ] **Step 1: Despachar os revisores**

`revisor` (sempre) e `verificador-visual` (a versão toca UI: as duas abas, drawer, três modais, estados vazio e de erro, passe por teclado). O `revisor-db` já rodou na Tarefa 3.

- [ ] **Step 2: Corrigir os achados**

Trate CRÍTICO e ALTO antes do PR; registre MÉDIO/BAIXO no out-briefing se não forem tratados.

- [ ] **Step 3: ADR-0174**

Registre as quatro decisões que um leitor futuro não deduz do código: (a) razão append-only com estado derivado, e por que **não** há movimentação de abertura aqui, ao contrário do Inventário; (b) um registro = um exemplar, sem quantidade; (c) dois níveis de permissão e por que a devolução alheia é ato de gestão; (d) excluir vira arquivar a partir da primeira movimentação, com o RESTRICT da FK como backstop.

- [ ] **Step 4: Bump e changelogs**

`package.json` → `5.11.0`. `docs/changelog.md` com a data **real** do dia. `src/data/changelog-diretoria.ts`: "a empresa passou a ter registro de quem está com cada livro da estante".

- [ ] **Step 5: Gates finais e PR**

```bash
npx tsc --noEmit && npm run lint && npm run build && npm test
```

Depois abra o PR com o out-briefing (o que mudou, o que o Yan precisa conferir, achados não tratados, e o aviso do **gatilho da skill `banco-e-rpc` §6** — a lista de testes que escrevem-e-revertem chegou a 3 arquivos).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(v5.11.0): fechamento — ADR-0174, changelogs e bump"
```

---

## Checkpoint do Yan (depois do PR, antes do merge)

Da seção *Checkpoint* do briefing: cadastrar 3–5 livros reais; pegar um pela própria conta e conferir "Com Yan desde hoje"; tentar devolver, por uma conta **sem** gestão, livro de outra pessoa (tem de recusar) e depois **com** gestão (tem de aceitar, no nome de quem estava com ele); excluir um livro nunca emprestado (some) e um com histórico (arquiva, histórico legível); abrir o Inventário de Ativos e confirmar que navegação e permissão não regrediram; passe por teclado nas duas abas.
