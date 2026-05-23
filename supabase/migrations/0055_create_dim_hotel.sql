-- ---------------------------------------------------------------------------
-- 0055 — feat: dim_hotel normalizada (ADR-0064)
--
-- Cria schema dim e tabela dim.dim_hotel para substituir strings cruas
-- de nome de hotel em queries e componentes.
-- Popula a partir dos valores distintos já materializados em
-- analytics.dim_operacao_weddings.hotel (inclui contratos + fallback M1.2).
-- Campos cidade e pais ficam nulos — preenchimento progressivo.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS dim;

CREATE TABLE dim.dim_hotel (
  hotel_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_canonico   TEXT        NOT NULL UNIQUE,
  nome_completo   TEXT,
  cidade          TEXT,
  pais            TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para lookup por nome (usado nos JOINs de backfill da M1.4)
CREATE INDEX dim_hotel_nome_canonico_idx ON dim.dim_hotel (nome_canonico);

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA dim TO service_role, authenticated, anon;
GRANT SELECT ON dim.dim_hotel TO authenticated, anon;
GRANT ALL    ON dim.dim_hotel TO service_role;

-- ---------------------------------------------------------------------------
-- População inicial: valores distintos de hotel já identificados
-- ---------------------------------------------------------------------------
INSERT INTO dim.dim_hotel (nome_canonico)
SELECT DISTINCT hotel
FROM   analytics.dim_operacao_weddings
WHERE  hotel IS NOT NULL
  AND  hotel <> ''
ORDER BY hotel;
