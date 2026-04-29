-- Tabelas do schema app: dados nascidos na plataforma
--
-- meta_setor: metas mensais por setor macro
--   fonte = 'real'    → valores fornecidos pelos gestores (2026)
--   fonte = 'ficticia' → calculados (2024 e 2025 = meta_2026 / 1.15^n)
--
-- meta_setor_historico: criada vazia aqui; será usada na Onda 2
--   para auditoria de alterações de meta

-- ---------------------------------------------------------------------------
-- app.meta_setor
-- ---------------------------------------------------------------------------
CREATE TABLE app.meta_setor (
  id             bigserial      PRIMARY KEY,
  setor_macro_id bigint         NOT NULL REFERENCES analytics.dim_setor_macro(id),
  ano            int            NOT NULL,
  mes            int            NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_meta     numeric(14,2)  NOT NULL,
  fonte          text           NOT NULL CHECK (fonte IN ('real', 'ficticia')),
  criado_em      timestamptz    NOT NULL DEFAULT now(),

  UNIQUE (setor_macro_id, ano, mes)
);

-- ---------------------------------------------------------------------------
-- app.meta_setor_historico  — snapshot de cada alteração (Onda 2)
-- ---------------------------------------------------------------------------
CREATE TABLE app.meta_setor_historico (
  id               bigserial      PRIMARY KEY,
  setor_macro_id   bigint         NOT NULL REFERENCES analytics.dim_setor_macro(id),
  ano              int            NOT NULL,
  mes              int            NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_meta       numeric(14,2)  NOT NULL,
  fonte            text           NOT NULL CHECK (fonte IN ('real', 'ficticia')),
  criado_em        timestamptz    NOT NULL DEFAULT now(),
  alterado_em      timestamptz    NOT NULL DEFAULT now(),
  alterado_por     text,
  valor_anterior   numeric(14,2),
  motivo_alteracao text
);
