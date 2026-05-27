-- 0088 — fix: UNIQUE constraint em analytics.dim_produto_subsetor.produto_normalizado
-- Descoberta em v4.2: produto_normalizado não tinha constraint estrutural.
-- A workaround DISTINCT ON em get_sumario_subsetor_v2 já contorna duplicatas,
-- mas a constraint é necessária para integridade do dado na origem.
-- IMPORTANTE: executar somente se não houver duplicatas ativas.

DO $$
BEGIN
  -- Remove duplicatas mantendo a linha com menor ID
  DELETE FROM analytics.dim_produto_subsetor
  WHERE id NOT IN (
    SELECT MIN(id)
    FROM analytics.dim_produto_subsetor
    GROUP BY produto_normalizado
  );

  -- Adiciona constraint UNIQUE
  ALTER TABLE analytics.dim_produto_subsetor
    ADD CONSTRAINT dim_produto_subsetor_produto_normalizado_key
    UNIQUE (produto_normalizado);
END $$;
