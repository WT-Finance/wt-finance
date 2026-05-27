-- ---------------------------------------------------------------------------
-- 0070 — fix: adicionar resultado_previsto em get_proximos_casamentos
--
-- resultado_previsto = a_receber - a_pagar (campos já existentes em
-- dim_operacao_weddings). Representa o resultado esperado ainda não liquidado.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_proximos_casamentos(
  p_horizonte_meses int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result       jsonb;
  v_ratio        numeric;
  v_margem_hist  numeric;
BEGIN
  SELECT
    AVG(CASE WHEN receita_bruta > 0
          THEN (entradas_total - saidas_total)::numeric / receita_bruta
          ELSE NULL END),
    AVG(CASE WHEN faturamento > 0
          THEN (entradas_total - saidas_total)::numeric / faturamento * 100
          ELSE NULL END)
  INTO v_ratio, v_margem_hist
  FROM analytics.dim_operacao_weddings
  WHERE situacao = 'passado'
    AND receita_bruta > 0
    AND (entradas_total - saidas_total) > 0;

  SELECT jsonb_build_object(
    'horizonte_meses',      p_horizonte_meses,
    'margem_historica_pct', ROUND(COALESCE(v_margem_hist, 0), 1),
    'casamentos', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'data_casamento',           to_char(data_evento, 'YYYY-MM-DD'),
            'casal',                    nome_casal,
            'hotel',                    hotel,
            'faturamento',              faturamento,
            'receita_bruta',            receita_bruta,
            'margem_pct',               margem_bruta_pct,
            'receita_liquida_prevista', ROUND(receita_bruta * COALESCE(v_ratio, 0), 2),
            'resultado_previsto',       ROUND(COALESCE(a_receber, 0) - COALESCE(a_pagar, 0), 2)
          )
          ORDER BY data_evento ASC
        )
        FROM analytics.dim_operacao_weddings
        WHERE situacao = 'futuro'
          AND data_evento <= CURRENT_DATE + (p_horizonte_meses || ' months')::interval
      ),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_proximos_casamentos(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_proximos_casamentos(int)
  TO anon, authenticated, service_role;
