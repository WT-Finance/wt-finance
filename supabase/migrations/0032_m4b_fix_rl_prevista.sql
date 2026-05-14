-- ---------------------------------------------------------------------------
-- 0032 — M4b: Corrige receita_liquida_prevista no RPC get_proximos_casamentos
--
-- Raiz do problema (ADR-0031 addendum):
--   entradas_total / saidas_total dos lançamentos medem fluxo de caixa
--   parcelado ao longo de meses, não o faturamento pontual da venda.
--   Logo (entradas - saidas) / receita_bruta >> 1 para a maioria das
--   operações históricas, tornando o ratio inutilizável como estimador.
--
-- Fix: filtra apenas operações onde resultado_caixa está em [0, receita_bruta].
--   Se nenhuma operação histórica passa no filtro, v_ratio = NULL e
--   receita_liquida_prevista = 0 → componente exibe '—' (honesto).
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
  -- Usa apenas operações onde o fluxo de caixa é plausível:
  -- 0 ≤ resultado_caixa ≤ receita_bruta (caixa líquido não pode superar receita bruta)
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
    AND saidas_total > 0
    AND (entradas_total - saidas_total) >= 0
    AND (entradas_total - saidas_total) <= receita_bruta;

  SELECT jsonb_build_object(
    'horizonte_meses',      p_horizonte_meses,
    'margem_historica_pct', ROUND(COALESCE(v_margem_hist, 0), 1),
    'casamentos', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'data_casamento',          to_char(data_evento, 'YYYY-MM-DD'),
            'casal',                   nome_casal,
            'hotel',                   hotel,
            'faturamento',             faturamento,
            'receita_bruta',           receita_bruta,
            'margem_pct',              margem_bruta_pct,
            'receita_liquida_prevista',
              ROUND(receita_bruta * COALESCE(v_ratio, 0), 2)
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
