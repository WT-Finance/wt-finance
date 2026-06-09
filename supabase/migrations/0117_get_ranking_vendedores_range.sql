-- ---------------------------------------------------------------------------
-- 0117 — feat(v4.12/M4): get_ranking_vendedores_range — ranking por intervalo
--
-- F3: o Top Vendedores chamava get_ranking_vendedores (MENSAL) 1× por mês do
-- período (até 36 chamadas) e agregava no cliente — fan-out N+1. Esta RPC agrega
-- o intervalo de meses NO BANCO, numa única chamada, sobre a mesma MV pré-computada
-- (mv_ranking_vendedores_mensal). A versão mensal é mantida (ainda usada pela API
-- route /api/ranking-vendedores). Grants no padrão das RPCs de UI (anon <3s).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ranking_vendedores_range(
  p_from   date,
  p_to     date,
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
  v_de int := EXTRACT(YEAR FROM p_from)::int * 100 + EXTRACT(MONTH FROM p_from)::int;
  v_ate int := EXTRACT(YEAR FROM p_to)::int   * 100 + EXTRACT(MONTH FROM p_to)::int;
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
    WHERE (rv.ano * 100 + rv.mes) BETWEEN v_de AND v_ate
      AND (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY rv.vendedor_id, dv.nome
    ORDER BY SUM(rv.valor_total) DESC
    LIMIT p_limite
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ranking_vendedores_range(date, date, text, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_ranking_vendedores_range(date, date, text, int) TO anon, authenticated, service_role;
