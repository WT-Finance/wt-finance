-- 0095 — RPC get_gerencial_projecao_diaria
-- Agrega lançamentos gerenciais por dia, retorna projeção dos próximos N dias
CREATE OR REPLACE FUNCTION public.get_gerencial_projecao_diaria(
  p_dias INT DEFAULT 90
)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH dias AS (
    SELECT generate_series(
      CURRENT_DATE,
      CURRENT_DATE + (p_dias || ' days')::INTERVAL,
      INTERVAL '1 day'
    )::DATE AS data
  ),
  agregado AS (
    SELECT
      d.data,
      COALESCE(SUM(CASE WHEN g.tipo = 'A receber' THEN g.valor_final ELSE 0 END), 0) AS a_receber,
      COALESCE(SUM(CASE WHEN g.tipo = 'A pagar'   THEN g.valor_final ELSE 0 END), 0) AS a_pagar
    FROM dias d
    LEFT JOIN analytics.gerencial_lancamentos g
      ON g.vencimento = d.data
    GROUP BY d.data
  )
  SELECT json_agg(
    json_build_object(
      'data',       to_char(data, 'YYYY-MM-DD'),
      'a_receber',  a_receber,
      'a_pagar',    a_pagar,
      'resultado',  a_receber - a_pagar
    )
    ORDER BY data
  )
  FROM agregado;
$$;

REVOKE EXECUTE ON FUNCTION public.get_gerencial_projecao_diaria(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_projecao_diaria(INT) TO service_role;
