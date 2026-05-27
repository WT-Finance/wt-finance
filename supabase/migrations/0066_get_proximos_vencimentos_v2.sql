-- ---------------------------------------------------------------------------
-- 0066 — feat: get_proximos_vencimentos_v2 via raw.fluxo_caixa_titulos (M6)
--
-- Substitui get_proximos_vencimentos (fato_lancamentos) pela versão CAP/CAR.
-- Status LIKE '% Futuro' identifica títulos em aberto.
-- Aging: a_vencer / vencido_ate_30d / vencido_30_a_90d / vencido_mais_90d
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_proximos_vencimentos_v2(
  p_limite INT     DEFAULT 50,
  p_offset INT     DEFAULT 0,
  p_tipo   TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT JSON_BUILD_OBJECT(
      'items', (
        SELECT JSON_AGG(row_to_json(t))
        FROM (
          SELECT
            fct.numero,
            fct.vencimento,
            fct.pessoa,
            fct.descricao,
            fct.valor_final,
            fct.tipo,
            fct.status,
            (fct.vencimento::date - CURRENT_DATE) AS dias_para_vencer,
            CASE
              WHEN fct.vencimento::date >= CURRENT_DATE
                THEN 'a_vencer'
              WHEN fct.vencimento::date >= CURRENT_DATE - INTERVAL '30 days'
                THEN 'vencido_ate_30d'
              WHEN fct.vencimento::date >= CURRENT_DATE - INTERVAL '90 days'
                THEN 'vencido_30_a_90d'
              ELSE
                'vencido_mais_90d'
            END AS aging
          FROM raw.fluxo_caixa_titulos fct
          WHERE fct.status LIKE '% Futuro'
            AND fct.vencimento::date >= CURRENT_DATE - INTERVAL '180 days'
            AND (p_tipo IS NULL OR fct.tipo = p_tipo)
          ORDER BY fct.vencimento ASC
          LIMIT p_limite OFFSET p_offset
        ) t
      ),
      'total', (
        SELECT COUNT(*)
        FROM raw.fluxo_caixa_titulos fct
        WHERE fct.status LIKE '% Futuro'
          AND fct.vencimento::date >= CURRENT_DATE - INTERVAL '180 days'
          AND (p_tipo IS NULL OR fct.tipo = p_tipo)
      )
    )
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_proximos_vencimentos_v2(INT, INT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_proximos_vencimentos_v2(INT, INT, TEXT) TO service_role;
