-- ---------------------------------------------------------------------------
-- 0081 — feat: get_fluxo_caixa_acumulado_v1()
--
-- Mesmo horizonte de 0080 (24 meses atrás + 18 meses à frente).
-- Retorna somas cumulativas de entradas e saídas (efetivadas e previstas)
-- desde o início do horizonte até cada mês M.
--
-- Colunas: mes, acum_entrada_efetivada, acum_entrada_prevista,
--          acum_saida_efetivada, acum_saida_prevista
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_fluxo_caixa_acumulado_v1()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mes_inicio text := TO_CHAR(date_trunc('month', CURRENT_DATE) - INTERVAL '23 months', 'YYYY-MM');
  v_mes_fim    text := TO_CHAR(date_trunc('month', CURRENT_DATE) + INTERVAL '18 months', 'YYYY-MM');
BEGIN
  RETURN (
    SELECT JSON_AGG(row_to_json(r) ORDER BY r.mes)
    FROM (
      SELECT
        mes,
        SUM(entrada_efetivada) OVER (ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acum_entrada_efetivada,
        SUM(entrada_prevista)  OVER (ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acum_entrada_prevista,
        SUM(saida_efetivada)   OVER (ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acum_saida_efetivada,
        SUM(saida_prevista)    OVER (ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acum_saida_prevista
      FROM (
        SELECT
          gs.mes,
          COALESCE(SUM(CASE WHEN v.is_realizado = TRUE  AND v.tipo_movimento = 'entrada' THEN v.valor_unit ELSE 0 END), 0) AS entrada_efetivada,
          COALESCE(SUM(CASE WHEN v.is_realizado = FALSE AND v.tipo_movimento = 'entrada' THEN v.valor_unit ELSE 0 END), 0) AS entrada_prevista,
          COALESCE(SUM(CASE WHEN v.is_realizado = TRUE  AND v.tipo_movimento = 'saida'   THEN v.valor_unit ELSE 0 END), 0) AS saida_efetivada,
          COALESCE(SUM(CASE WHEN v.is_realizado = FALSE AND v.tipo_movimento = 'saida'   THEN v.valor_unit ELSE 0 END), 0) AS saida_prevista
        FROM (
          SELECT TO_CHAR(generate_series(
            (v_mes_inicio || '-01')::date,
            (v_mes_fim    || '-01')::date,
            '1 month'::interval
          ), 'YYYY-MM') AS mes
        ) gs
        LEFT JOIN financeiro.vw_fluxo_caixa_kpis_b v ON v.mes = gs.mes
        GROUP BY gs.mes
      ) monthly
    ) r
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_acumulado_v1() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_acumulado_v1()
  TO anon, authenticated, service_role;
