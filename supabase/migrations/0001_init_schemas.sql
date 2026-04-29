-- Cria os 4 schemas da plataforma e a tabela de ingestão bruta
--
-- raw      → espelho das planilhas, gravado apenas pelo seed
-- analytics → dimensões e fatos, lidos pelo frontend
-- app       → metas e configurações, nascidos na plataforma
-- audit     → logs de carga e operações

CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS audit;

-- Remove acesso público herdado; grants explícitos ficam em 0007_rls_policies.sql
REVOKE ALL ON SCHEMA raw       FROM PUBLIC;
REVOKE ALL ON SCHEMA analytics FROM PUBLIC;
REVOKE ALL ON SCHEMA app       FROM PUBLIC;
REVOKE ALL ON SCHEMA audit     FROM PUBLIC;

-- service_role precisa de USAGE em todos os schemas para o script seed funcionar
GRANT USAGE ON SCHEMA raw       TO service_role;
GRANT USAGE ON SCHEMA analytics TO service_role;
GRANT USAGE ON SCHEMA app       TO service_role;
GRANT USAGE ON SCHEMA audit     TO service_role;

-- ---------------------------------------------------------------------------
-- raw.vendas_excel
-- Espelho fiel das planilhas Excel exportadas do Monde via RPA.
-- Uma linha = uma linha da planilha (exceto coluna Intermediário, descontinuada).
-- Nunca alterada pela aplicação; apenas pelo script seed.
-- ---------------------------------------------------------------------------
CREATE TABLE raw.vendas_excel (
  id             bigserial    PRIMARY KEY,
  arquivo_origem text         NOT NULL,
  linha_origem   int          NOT NULL,
  carregado_em   timestamptz  NOT NULL DEFAULT now(),

  -- colunas das planilhas
  venda_numero   text,
  data_venda     date,
  vendedor       text,
  pagante        text,
  setor          text,
  produto        text,
  receitas       numeric(14,2),
  valor_total    numeric(14,2),
  semana         int,
  setor_macro    text,
  mes            text,
  setor_micro    text,
  contrato       boolean,
  taxa_servico   boolean
);
