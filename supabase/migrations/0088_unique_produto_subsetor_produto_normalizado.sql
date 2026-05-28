-- 0088 — fix: UNIQUE constraint em analytics.dim_produto_subsetor.produto_normalizado
-- Descoberta em v4.2: produto_normalizado não tinha constraint estrutural.
-- A workaround DISTINCT ON em get_sumario_subsetor_v2 já contorna duplicatas,
-- mas a constraint é necessária para integridade do dado na origem.
-- IMPORTANTE: executar somente se não houver duplicatas ativas.

DO $$
BEGIN
  -- Remove duplicatas via ctid (produto é a PK, mas usar ctid é mais genérico)
  DELETE FROM analytics.dim_produto_subsetor a
  USING analytics.dim_produto_subsetor b
  WHERE a.ctid > b.ctid
    AND a.produto_normalizado = b.produto_normalizado;

  -- Adiciona constraint UNIQUE (idempotente)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dim_produto_subsetor_produto_normalizado_key'
  ) THEN
    ALTER TABLE analytics.dim_produto_subsetor
      ADD CONSTRAINT dim_produto_subsetor_produto_normalizado_key
      UNIQUE (produto_normalizado);
  END IF;
END $$;
