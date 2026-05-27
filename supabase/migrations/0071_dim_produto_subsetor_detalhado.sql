-- ---------------------------------------------------------------------------
-- 0071 — feat: adicionar subsetor_detalhado em dim_produto_subsetor
--
-- ADR-0069: categoria CONVIDADOS dividida em Hospedagens e Extras.
-- ON CONFLICT (produto) DO UPDATE garante idempotência.
-- ---------------------------------------------------------------------------

ALTER TABLE analytics.dim_produto_subsetor
  ADD COLUMN IF NOT EXISTS subsetor_detalhado TEXT;

-- CONVIDADOS - Hospedagens (somente Diárias)
UPDATE analytics.dim_produto_subsetor
  SET subsetor_detalhado = 'CONVIDADOS - Hospedagens'
  WHERE subsetor = 'CONVIDADOS'
    AND produto = 'Diárias de Hospedagem';

-- CONVIDADOS - Extras (demais produtos de CONVIDADOS)
UPDATE analytics.dim_produto_subsetor
  SET subsetor_detalhado = 'CONVIDADOS - Extras'
  WHERE subsetor = 'CONVIDADOS'
    AND produto != 'Diárias de Hospedagem';

-- Demais subsetores preservam o valor original
UPDATE analytics.dim_produto_subsetor
  SET subsetor_detalhado = subsetor
  WHERE subsetor_detalhado IS NULL;

-- Tornar NOT NULL após backfill
ALTER TABLE analytics.dim_produto_subsetor
  ALTER COLUMN subsetor_detalhado SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dim_produto_subsetor_detalhado
  ON analytics.dim_produto_subsetor(subsetor_detalhado);
