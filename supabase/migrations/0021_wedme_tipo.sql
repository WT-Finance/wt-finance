-- V3.1-1: Filtragem de vendedores institucionais no ranking.
-- WEDME é uma conta corporativa interna, não um vendedor pessoa física.
-- Solução: tabela de tipos + coluna em dim_vendedor + filtro no ranking.

-- ---------------------------------------------------------------------------
-- 1. Tabela de tipos de vendedor
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.dim_vendedor_tipo (
  id   bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nome text   NOT NULL UNIQUE
);

INSERT INTO analytics.dim_vendedor_tipo (nome) VALUES
  ('pessoa_fisica'),   -- vendedores reais
  ('institucional'),   -- WEDME, vendas corporativas internas
  ('externo')          -- parceiros, terceiros (uso futuro)
ON CONFLICT (nome) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Coluna tipo_id em dim_vendedor (default: pessoa_fisica = id 1)
-- ---------------------------------------------------------------------------
ALTER TABLE analytics.dim_vendedor
  ADD COLUMN IF NOT EXISTS tipo_id bigint
    REFERENCES analytics.dim_vendedor_tipo(id)
    DEFAULT 1;

-- ---------------------------------------------------------------------------
-- 3. Marcar WEDME (e variações) como institucional
-- ---------------------------------------------------------------------------
UPDATE analytics.dim_vendedor
SET tipo_id = 2
WHERE nome ILIKE '%WEDME%';

-- ---------------------------------------------------------------------------
-- 4. get_ranking_vendedores — filtrar por pessoa_fisica por padrão
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ranking_vendedores(
  p_ano    int,
  p_mes    int,
  p_setor  text DEFAULT 'todos',
  p_limite int  DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(r)
  INTO v_result
  FROM (
    SELECT
      rv.vendedor_id,
      dv.nome,
      SUM(rv.valor_total)        AS valor_total,
      SUM(rv.receitas)           AS receitas,
      SUM(rv.vendas_count)::int  AS vendas_count
    FROM analytics.mv_ranking_vendedores_mensal rv
    JOIN analytics.dim_vendedor    dv  ON dv.id  = rv.vendedor_id
    JOIN analytics.dim_setor_macro dsm ON dsm.id = rv.setor_macro_id
    WHERE rv.ano = p_ano AND rv.mes = p_mes
      AND (p_setor = 'todos' OR dsm.nome = p_setor)
      AND dv.tipo_id = 1  -- apenas pessoa_fisica
    GROUP BY rv.vendedor_id, dv.nome
    ORDER BY SUM(rv.valor_total) DESC
    LIMIT p_limite
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ranking_vendedores(int, int, text, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_ranking_vendedores(int, int, text, int)
  TO anon, authenticated, service_role;

-- RLS para a nova tabela
ALTER TABLE analytics.dim_vendedor_tipo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitura_anon" ON analytics.dim_vendedor_tipo
  FOR SELECT TO anon, authenticated USING (true);
