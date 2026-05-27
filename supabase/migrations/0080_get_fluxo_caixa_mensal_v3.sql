-- ---------------------------------------------------------------------------
-- 0080 — feat: get_fluxo_caixa_mensal_v3()
--
-- Retorna horizonte fixo: 24 meses atrás + mês atual + 18 meses à frente
-- (total 43 meses). Sem parâmetros de filtro — substitui get_fluxo_caixa_mensal_b
-- para os gráficos de Fluxo de Caixa.
--
-- Colunas: mes, entrada_efetivada, entrada_prevista,
--          saida_efetivada, saida_prevista, resultado_mensal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_fluxo_caixa_mensal_v3()
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
        gs.mes,
        COALESCE(SUM(CASE WHEN v.is_realizado = TRUE  AND v.tipo_movimento = 'entrada' THEN v.valor_unit ELSE 0 END), 0) AS entrada_efetivada,
        COALESCE(SUM(CASE WHEN v.is_realizado = FALSE AND v.tipo_movimento = 'entrada' THEN v.valor_unit ELSE 0 END), 0) AS entrada_prevista,
        COALESCE(SUM(CASE WHEN v.is_realizado = TRUE  AND v.tipo_movimento = 'saida'   THEN v.valor_unit ELSE 0 END), 0) AS saida_efetivada,
        COALESCE(SUM(CASE WHEN v.is_realizado = FALSE AND v.tipo_movimento = 'saida'   THEN v.valor_unit ELSE 0 END), 0) AS saida_prevista,
        COALESCE(
          SUM(CASE WHEN v.tipo_movimento = 'entrada' THEN v.valor_unit ELSE -v.valor_unit END),
          0
        ) AS resultado_mensal
      FROM (
        SELECT TO_CHAR(generate_series(
          (v_mes_inicio || '-01')::date,
          (v_mes_fim    || '-01')::date,
          '1 month'::interval
        ), 'YYYY-MM') AS mes
      ) gs
      LEFT JOIN financeiro.vw_fluxo_caixa_kpis_b v ON v.mes = gs.mes
      GROUP BY gs.mes
    ) r
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_mensal_v3() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_mensal_v3()
  TO anon, authenticated, service_role;
