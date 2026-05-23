-- ---------------------------------------------------------------------------
-- 0058 — feat: dimensões e fato financeiro (ADR-0061 / M2.2)
--
-- financeiro.dim_categoria      ← Categoria + Grupo (populada em M3 via RPC)
-- financeiro.dim_conta_bancaria ← contas com tipo pré-cadastrado
-- financeiro.fato_lancamentos   ← cópia de raw.lancamentos com FKs
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- dim_categoria
-- Populada via regenerar_dim_categoria() chamada após cada upload (M3).
-- ---------------------------------------------------------------------------
CREATE TABLE financeiro.dim_categoria (
  id              SERIAL      PRIMARY KEY,
  categoria       TEXT        NOT NULL UNIQUE,
  grupo_categoria TEXT        NOT NULL
);

GRANT SELECT ON financeiro.dim_categoria TO authenticated, anon;
GRANT ALL    ON financeiro.dim_categoria TO service_role;
GRANT USAGE, SELECT ON SEQUENCE financeiro.dim_categoria_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- dim_conta_bancaria
-- Tipo: banco | gateway | carteira_interna | caixa_fisico | outro
-- ---------------------------------------------------------------------------
CREATE TABLE financeiro.dim_conta_bancaria (
  id     SERIAL PRIMARY KEY,
  conta  TEXT   NOT NULL UNIQUE,
  tipo   TEXT   NOT NULL CHECK (tipo IN ('banco','gateway','carteira_interna','caixa_fisico','outro'))
);

GRANT SELECT ON financeiro.dim_conta_bancaria TO authenticated, anon;
GRANT ALL    ON financeiro.dim_conta_bancaria TO service_role;
GRANT USAGE, SELECT ON SEQUENCE financeiro.dim_conta_bancaria_id_seq TO service_role;

-- Classificação inicial de contas conhecidas
INSERT INTO financeiro.dim_conta_bancaria (conta, tipo) VALUES
  ('Banco Itau',                      'banco'),
  ('Banco Inter',                     'banco'),
  ('Caixa Economica',                 'banco'),
  ('Bs2',                             'banco'),
  ('Banco Confidence de Cambio',      'banco'),
  ('WISE',                            'banco'),
  ('Blimboo',                         'gateway'),
  ('ASAAS',                           'gateway'),
  ('STONE',                           'gateway'),
  ('Caixa',                           'caixa_fisico'),
  ('Caixa Moedas Estrangeiras',       'caixa_fisico'),
  ('APPLAUSE',                        'outro');

-- WCLARA-* inseridas dinamicamente via trigger/função após upload
-- (nomes nominais variam; tipo carteira_interna para qualquer WCLARA-*)

-- ---------------------------------------------------------------------------
-- fato_lancamentos
-- Cópia enriquecida de raw.lancamentos com FKs para dimensões.
-- ---------------------------------------------------------------------------
CREATE TABLE financeiro.fato_lancamentos (
  id                    BIGSERIAL   PRIMARY KEY,
  raw_id                BIGINT      REFERENCES raw.lancamentos(id),

  numero                TEXT,
  venda_no              BIGINT,
  emissao               DATE,
  vencimento            DATE,
  liquidacao            DATE,
  pessoa                TEXT,
  descricao             TEXT,
  valor                 NUMERIC(18,2) NOT NULL,

  categoria_id          INT         REFERENCES financeiro.dim_categoria(id),
  conta_bancaria_id     INT         REFERENCES financeiro.dim_conta_bancaria(id)
);

CREATE INDEX fato_lanc_emissao_idx      ON financeiro.fato_lancamentos (emissao);
CREATE INDEX fato_lanc_vencimento_idx   ON financeiro.fato_lancamentos (vencimento);
CREATE INDEX fato_lanc_liquidacao_idx   ON financeiro.fato_lancamentos (liquidacao);
CREATE INDEX fato_lanc_conta_idx        ON financeiro.fato_lancamentos (conta_bancaria_id);

GRANT SELECT ON financeiro.fato_lancamentos TO authenticated, anon;
GRANT ALL    ON financeiro.fato_lancamentos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE financeiro.fato_lancamentos_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- Função de regeneração: popula dim_categoria e fato_lancamentos
-- a partir de raw.lancamentos (chamada por finalizarLancamentosAction em M3)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regenerar_financeiro_lancamentos()
RETURNS TABLE (dim_cat_count int, fato_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dim_cat  int;
  v_fato     int;
BEGIN
  -- 1. Sincroniza dim_categoria com categorias distintas do raw
  INSERT INTO financeiro.dim_categoria (categoria, grupo_categoria)
  SELECT DISTINCT
    categoria,
    COALESCE(grupo_categoria, 'Sem Grupo') AS grupo_categoria
  FROM raw.lancamentos
  WHERE categoria IS NOT NULL
  ON CONFLICT (categoria) DO UPDATE
    SET grupo_categoria = EXCLUDED.grupo_categoria;

  GET DIAGNOSTICS v_dim_cat = ROW_COUNT;

  -- 2. Reconstrói fato_lancamentos
  TRUNCATE financeiro.fato_lancamentos;

  INSERT INTO financeiro.fato_lancamentos (
    raw_id, numero, venda_no, emissao, vencimento, liquidacao,
    pessoa, descricao, valor, categoria_id, conta_bancaria_id
  )
  SELECT
    r.id,
    r.numero,
    r.venda_no,
    r.emissao,
    r.vencimento,
    r.liquidacao,
    r.pessoa,
    r.descricao,
    r.valor,
    dc.id  AS categoria_id,
    dcb.id AS conta_bancaria_id
  FROM raw.lancamentos r
  LEFT JOIN financeiro.dim_categoria      dc  ON dc.categoria = r.categoria
  LEFT JOIN financeiro.dim_conta_bancaria dcb ON dcb.conta    = r.conta;

  GET DIAGNOSTICS v_fato = ROW_COUNT;

  RETURN QUERY SELECT v_dim_cat, v_fato;
END $$;

REVOKE EXECUTE ON FUNCTION public.regenerar_financeiro_lancamentos() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.regenerar_financeiro_lancamentos() TO service_role;
