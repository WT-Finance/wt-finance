-- V4-1: Tabelas de autenticação e convites
--
-- app.usuarios: vincula auth.users ao perfil interno (role + setor).
-- app.convites:  convites pendentes — deletados quando o convidado aceita.
--
-- Funções SQL utilitárias com SECURITY DEFINER para uso em RLS (V4-4)
-- e em queries internas sem expor a tabela diretamente.

-- ---------------------------------------------------------------------------
-- Tabela app.usuarios
-- ---------------------------------------------------------------------------
CREATE TABLE app.usuarios (
  id             uuid         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          text         NOT NULL UNIQUE,
  nome           text,
  role           text         NOT NULL,
  setor_id       bigint       REFERENCES analytics.dim_setor_macro(id),
  criado_em      timestamptz  NOT NULL DEFAULT now(),
  atualizado_em  timestamptz  NOT NULL DEFAULT now(),
  ultimo_acesso  timestamptz,
  ativo          boolean      NOT NULL DEFAULT true
);

-- Role válida
ALTER TABLE app.usuarios
  ADD CONSTRAINT chk_role
  CHECK (role IN ('financeiro', 'gestor'));

-- Coerência: gestor tem setor, financeiro não tem
ALTER TABLE app.usuarios
  ADD CONSTRAINT chk_setor_role
  CHECK (
    (role = 'financeiro' AND setor_id IS NULL) OR
    (role = 'gestor'     AND setor_id IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- Tabela app.convites
-- ---------------------------------------------------------------------------
CREATE TABLE app.convites (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text         NOT NULL UNIQUE,
  role           text         NOT NULL,
  setor_id       bigint       REFERENCES analytics.dim_setor_macro(id),
  convidado_por  uuid         REFERENCES app.usuarios(id),
  criado_em      timestamptz  NOT NULL DEFAULT now(),
  expira_em      timestamptz  NOT NULL DEFAULT (now() + interval '7 days'),
  aceito_em      timestamptz
);

-- Mesmas constraints de coerência
ALTER TABLE app.convites
  ADD CONSTRAINT chk_role
  CHECK (role IN ('financeiro', 'gestor'));

ALTER TABLE app.convites
  ADD CONSTRAINT chk_setor_role
  CHECK (
    (role = 'financeiro' AND setor_id IS NULL) OR
    (role = 'gestor'     AND setor_id IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- Funções utilitárias SQL
-- Usadas em políticas RLS (V4-4) e em queries internas.
-- SECURITY DEFINER: rodam com privilégios do dono (postgres), não do usuário —
-- necessário porque RLS impediria o usuário de ler a própria linha em app.usuarios.
-- SET search_path = '': padrão do projeto para evitar search_path injection.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.current_user_setor_id()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT setor_id FROM app.usuarios
  WHERE id = auth.uid()
  AND ativo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app.current_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT role FROM app.usuarios
  WHERE id = auth.uid()
  AND ativo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app.is_financeiro()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT app.current_user_role() = 'financeiro';
$$;

-- ---------------------------------------------------------------------------
-- RLS — habilitar em ambas as tabelas
-- Políticas granulares de analytics/audit ficam para V4-4.
-- Policies mínimas de app.usuarios criadas aqui para o middleware (V4-2)
-- conseguir ler o perfil do usuário logado.
-- ---------------------------------------------------------------------------

ALTER TABLE app.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.convites ENABLE ROW LEVEL SECURITY;

-- Usuário pode ler própria linha (necessário para middleware V4-2)
CREATE POLICY "usuarios_select_self"
  ON app.usuarios FOR SELECT
  USING (id = auth.uid());

-- Financeiro pode ler todos (necessário para página /usuarios em V4-3)
CREATE POLICY "usuarios_select_financeiro"
  ON app.usuarios FOR SELECT
  USING (app.is_financeiro());
