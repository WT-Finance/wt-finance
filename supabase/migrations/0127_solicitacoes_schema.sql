-- ---------------------------------------------------------------------------
-- 0127 — feat(v4.16.0): Módulo de Solicitações — SCHEMA. ADR-0112.
--
-- Pedidos internos ao financeiro (lançamentos avulsos, pagamentos de emergência…)
-- com TIPOS configuráveis pelo admin (campos dinâmicos), abertura por qualquer
-- usuário autenticado, destinatário XOR usuário/role, ciclo de vida com transições
-- legais, e visibilidade por papel. Substitui (em convivência) o form externo + Planner.
--
-- Tudo no schema `app`, RLS deny-by-default (ENABLE RLS + REVOKE ALL, sem policy
-- permissiva) — acesso SÓ via RPCs SECURITY DEFINER (0128). Aditivo e retrocompatível:
-- nenhuma estrutura existente é alterada.
--
-- Decisão de dados (ADR-0112): os VALORES preenchidos são gravados como SNAPSHOT
-- JSONB na própria solicitação (rótulo+tipo+valor capturados na abertura) → imutáveis
-- e legíveis mesmo após editar/arquivar o tipo. A definição viva (solicitacao_campo)
-- só renderiza o formulário de abertura e valida no servidor naquele momento.
-- ---------------------------------------------------------------------------

-- 1. Tipo de solicitação (definido pelo admin).
CREATE TABLE app.solicitacao_tipo (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome          text NOT NULL,
  arquivado     boolean NOT NULL DEFAULT false,  -- some da abertura; histórico íntegro
  criado_por    uuid REFERENCES auth.users(id),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- 2. Campos de um tipo (definição dinâmica, ordenada).
CREATE TABLE app.solicitacao_campo (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo_id     bigint NOT NULL REFERENCES app.solicitacao_tipo(id) ON DELETE CASCADE,
  ordem       int  NOT NULL,
  rotulo      text NOT NULL,
  tipo_campo  text NOT NULL CHECK (tipo_campo IN
                ('texto_curto','texto_longo','numero','moeda','data','selecao','anexo')),
  obrigatorio boolean NOT NULL DEFAULT false,
  -- opções da lista fixa quando tipo_campo='selecao' (array de strings); senão NULL.
  opcoes      jsonb,
  CONSTRAINT solicitacao_campo_selecao_opcoes CHECK (
    (tipo_campo = 'selecao' AND opcoes IS NOT NULL AND jsonb_typeof(opcoes) = 'array' AND jsonb_array_length(opcoes) > 0)
    OR (tipo_campo <> 'selecao')
  )
);
CREATE INDEX idx_solicitacao_campo_tipo ON app.solicitacao_campo (tipo_id, ordem);

-- 3. Solicitação (instância aberta por um usuário).
CREATE TABLE app.solicitacao (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo_id              bigint NOT NULL REFERENCES app.solicitacao_tipo(id),
  solicitante_id       uuid NOT NULL REFERENCES auth.users(id),
  -- Destinatário XOR: exatamente UM de usuário / role.
  destinatario_user_id uuid   REFERENCES auth.users(id),
  destinatario_role_id bigint REFERENCES app.rbac_roles(id),
  data_limite          date NOT NULL,
  descricao            text,
  -- Snapshot imutável das respostas: [{campo_id,rotulo,tipo_campo,obrigatorio,opcoes,valor}].
  respostas            jsonb NOT NULL DEFAULT '[]'::jsonb,
  status               text NOT NULL DEFAULT 'aberta'
                         CHECK (status IN ('aberta','concluida','rejeitada','cancelada')),
  -- Única transição terminal (sem reabertura na v1): quem/quando/justificativa.
  decidido_por         uuid REFERENCES auth.users(id),
  decidido_em          timestamptz,
  justificativa        text,  -- obrigatória só em 'rejeitada' (enforçado na RPC)
  criado_em            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solicitacao_destinatario_xor CHECK (
    (destinatario_user_id IS NOT NULL)::int + (destinatario_role_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT solicitacao_justificativa_rejeitada CHECK (
    status <> 'rejeitada' OR (justificativa IS NOT NULL AND length(btrim(justificativa)) > 0)
  ),
  CONSTRAINT solicitacao_terminal_decidido CHECK (
    status = 'aberta' OR (decidido_por IS NOT NULL AND decidido_em IS NOT NULL)
  )
);
CREATE INDEX idx_solicitacao_solicitante  ON app.solicitacao (solicitante_id, status);
CREATE INDEX idx_solicitacao_dest_user    ON app.solicitacao (destinatario_user_id, status) WHERE destinatario_user_id IS NOT NULL;
CREATE INDEX idx_solicitacao_dest_role    ON app.solicitacao (destinatario_role_id, status) WHERE destinatario_role_id IS NOT NULL;
CREATE INDEX idx_solicitacao_tipo_status  ON app.solicitacao (tipo_id, status, data_limite);

-- 4. Anexos (metadados; binário no Storage bucket privado 'solicitacoes-anexos').
CREATE TABLE app.solicitacao_anexo (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  solicitacao_id bigint NOT NULL REFERENCES app.solicitacao(id) ON DELETE CASCADE,
  campo_id       bigint,  -- qual campo 'anexo' (referência lógica ao snapshot); NULL = geral
  storage_path   text NOT NULL UNIQUE,
  nome_arquivo   text NOT NULL,
  mime           text NOT NULL,
  tamanho_bytes  bigint NOT NULL,
  criado_por     uuid REFERENCES auth.users(id),
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_solicitacao_anexo_sol ON app.solicitacao_anexo (solicitacao_id);

-- ── RLS deny-by-default + REVOKE (acesso SÓ via RPC SECURITY DEFINER) ──────────
ALTER TABLE app.solicitacao_tipo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.solicitacao_campo ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.solicitacao       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.solicitacao_anexo ENABLE ROW LEVEL SECURITY;
-- sem policy permissiva: deny-by-default. O owner (postgres) das RPCs DEFINER ignora RLS.
REVOKE ALL ON app.solicitacao_tipo  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.solicitacao_campo FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.solicitacao       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.solicitacao_anexo FROM PUBLIC, anon, authenticated;

-- ── Área RBAC nova: 'solicitacoes' (gestão = ver todas + administrar tipos) ────
-- A PÁGINA /solicitacoes é de qualquer autenticado (areasDaRota null); esta área
-- gateia a visão total e o admin de tipos. Espelhada em src/lib/auth/areas.ts.
INSERT INTO app.rbac_areas (area, rotulo, grupo, ordem) VALUES
  ('solicitacoes', 'Solicitações (gestão)', 'Administração', 53);

-- ── Storage: bucket privado de anexos (sem policy pública; leitura via signed URL) ─
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'solicitacoes-anexos', 'solicitacoes-anexos', false,
  10485760,  -- 10 MiB por arquivo
  ARRAY['application/pdf','image/png','image/jpeg','image/webp',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv']
)
ON CONFLICT (id) DO NOTHING;
-- Sem policies em storage.objects para este bucket → anon/authenticated negados no
-- acesso direto. Upload e leitura são server-side via service_role (signed URLs).

NOTIFY pgrst, 'reload schema';
