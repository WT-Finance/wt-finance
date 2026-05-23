-- ---------------------------------------------------------------------------
-- 0057 — feat: schema financeiro + raw tables (ADR-0061 / M2.1)
--
-- Cria schema financeiro para isolar dados financeiros das tabelas Vendas.
-- Cria 3 tabelas raw espelhando as planilhas de upload:
--   raw.lancamentos       ← Lançamentos por categoria
--   raw.vendas_pagamento  ← Vendas por forma de pagamento
--   raw.contas_pagar_receber ← CAP/CAR (tipo_movimento tratado por Yan antes)
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS financeiro;

-- Permissões de schema
GRANT USAGE ON SCHEMA financeiro TO service_role, authenticated, anon;

-- ---------------------------------------------------------------------------
-- raw.lancamentos
-- Espelho fiel do export de Lançamentos (ERP → planilha).
-- Valor: positivo = entrada, negativo = saída.
-- ---------------------------------------------------------------------------
CREATE TABLE raw.lancamentos (
  id                    BIGSERIAL   PRIMARY KEY,
  arquivo_origem        TEXT        NOT NULL,
  carregado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  numero                TEXT,
  venda_no              BIGINT,                   -- Venda Nº (NULL se não vinculado a venda)
  emissao               DATE,
  vencimento            DATE,
  liquidacao            DATE,                     -- NULL = previsto (não realizado)
  pessoa                TEXT,
  descricao             TEXT,
  descricao_categoria   TEXT,
  valor                 NUMERIC(18,2),            -- positivo = entrada, negativo = saída
  categoria             TEXT,
  grupo_categoria       TEXT,
  conta                 TEXT
);

CREATE INDEX lancamentos_vencimento_idx  ON raw.lancamentos (vencimento);
CREATE INDEX lancamentos_liquidacao_idx  ON raw.lancamentos (liquidacao);
CREATE INDEX lancamentos_conta_idx       ON raw.lancamentos (conta);
CREATE INDEX lancamentos_grupo_idx       ON raw.lancamentos (grupo_categoria);

GRANT SELECT, INSERT, DELETE ON raw.lancamentos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE raw.lancamentos_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- raw.vendas_pagamento
-- Espelho das 17 colunas da planilha "Vendas por forma de pagamento".
-- ---------------------------------------------------------------------------
CREATE TABLE raw.vendas_pagamento (
  id                  BIGSERIAL   PRIMARY KEY,
  arquivo_origem      TEXT        NOT NULL,
  carregado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  venda_no            BIGINT,                     -- Venda Nº
  data_venda          DATE,
  vendedor            TEXT,
  pagante             TEXT,
  produto             TEXT,
  setor               TEXT,
  setor_macro         TEXT,
  operacao_propria    TEXT,
  valor_bruto         NUMERIC(18,2),
  desconto            NUMERIC(18,2),
  valor               NUMERIC(18,2),              -- Valor final recebido
  forma_pagamento     TEXT,
  conta               TEXT,
  data_baixa          DATE,
  parcela             TEXT,
  situacao            TEXT,
  observacao          TEXT
);

CREATE INDEX vendas_pagamento_venda_no_idx ON raw.vendas_pagamento (venda_no);
CREATE INDEX vendas_pagamento_conta_idx    ON raw.vendas_pagamento (conta);

GRANT SELECT, INSERT, DELETE ON raw.vendas_pagamento TO service_role;
GRANT USAGE, SELECT ON SEQUENCE raw.vendas_pagamento_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- raw.contas_pagar_receber
-- Espelho do CAP/CAR com tipo_movimento já tratado por Yan antes do upload.
-- ---------------------------------------------------------------------------
CREATE TABLE raw.contas_pagar_receber (
  id                  BIGSERIAL   PRIMARY KEY,
  arquivo_origem      TEXT        NOT NULL,
  carregado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  tipo_movimento      TEXT        NOT NULL CHECK (tipo_movimento IN ('A_RECEBER', 'A_PAGAR')),
  numero              TEXT,
  venda_no            BIGINT,
  emissao             DATE,
  vencimento          DATE,
  liquidacao          DATE,
  valor               NUMERIC(18,2),
  valor_final         NUMERIC(18,2),              -- ajustado por câmbio
  descricao           TEXT,
  categoria           TEXT,
  grupo_categoria     TEXT,
  conta               TEXT,
  pessoa              TEXT,
  fatura_cliente_no   TEXT,
  observacoes         TEXT,
  conferido           BOOLEAN,
  operacao_propria    TEXT
);

CREATE INDEX cpr_vencimento_idx    ON raw.contas_pagar_receber (vencimento);
CREATE INDEX cpr_liquidacao_idx    ON raw.contas_pagar_receber (liquidacao);
CREATE INDEX cpr_tipo_idx          ON raw.contas_pagar_receber (tipo_movimento);
CREATE INDEX cpr_conta_idx         ON raw.contas_pagar_receber (conta);

GRANT SELECT, INSERT, DELETE ON raw.contas_pagar_receber TO service_role;
GRANT USAGE, SELECT ON SEQUENCE raw.contas_pagar_receber_id_seq TO service_role;
