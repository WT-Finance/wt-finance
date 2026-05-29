-- 0094 — Fluxo de Caixa Gerencial — modelo de dados base
-- Cria tabelas analytics.gerencial_lancamentos e analytics.gerencial_saldos
-- Primeira persistência própria da plataforma (v4.6)

-- ── Tabela principal de lançamentos ──────────────────────────────────────────

CREATE TABLE analytics.gerencial_lancamentos (
  id              BIGSERIAL PRIMARY KEY,
  tipo            TEXT NOT NULL CHECK (tipo IN ('A pagar', 'A receber')),
  pessoa          TEXT NOT NULL,
  valor_final     NUMERIC(15,2) NOT NULL CHECK (valor_final >= 0),
  descricao       TEXT,
  conta_previsao  TEXT,
  vencimento      DATE NOT NULL,
  origem          TEXT NOT NULL CHECK (origem IN ('planilha', 'manual')),
  importado_em    TIMESTAMPTZ,
  importado_lote_id UUID,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gerencial_vencimento   ON analytics.gerencial_lancamentos(vencimento);
CREATE INDEX idx_gerencial_origem       ON analytics.gerencial_lancamentos(origem);
CREATE INDEX idx_gerencial_lote         ON analytics.gerencial_lancamentos(importado_lote_id);

-- Trigger para atualizar atualizado_em automaticamente
CREATE OR REPLACE FUNCTION analytics.fn_gerencial_lancamentos_atualizado()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gerencial_lancamentos_atualizado
  BEFORE UPDATE ON analytics.gerencial_lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION analytics.fn_gerencial_lancamentos_atualizado();

-- ── Tabela de saldos iniciais editáveis ──────────────────────────────────────

CREATE TABLE analytics.gerencial_saldos (
  conta        TEXT PRIMARY KEY,
  saldo        NUMERIC(15,2) NOT NULL DEFAULT 0,
  ordem        INT NOT NULL DEFAULT 0,
  ativo        BOOLEAN NOT NULL DEFAULT true,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed inicial das 4 contas da planilha de previsão
INSERT INTO analytics.gerencial_saldos (conta, saldo, ordem) VALUES
  ('Itaú',    0, 1),
  ('Asaas',   0, 2),
  ('Blimboo', 0, 3),
  ('Clara',   0, 4)
ON CONFLICT (conta) DO NOTHING;

-- ── Permissões ────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE
  ON analytics.gerencial_lancamentos TO service_role;

GRANT USAGE, SELECT
  ON SEQUENCE analytics.gerencial_lancamentos_id_seq TO service_role;

GRANT SELECT, UPDATE
  ON analytics.gerencial_saldos TO service_role;
