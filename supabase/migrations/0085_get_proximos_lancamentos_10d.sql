-- ---------------------------------------------------------------------------
-- 0085 — feat: get_proximos_lancamentos_10d
--
-- Retorna títulos a vencer nos próximos 10 dias (CURRENT_DATE até +10d),
-- ordenados por vencimento asc, valor desc.
-- Usado pela lista lateral no Fluxo de Caixa Diário.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_proximos_lancamentos_10d()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      JSON_AGG(row_to_json(t) ORDER BY t.vencimento ASC, t.valor_final DESC),
      '[]'::JSON
    )
    FROM (
      SELECT
        fct.numero,
        fct.vencimento,
        fct.pessoa,
        fct.descricao,
        fct.valor_final,
        fct.tipo,
        fct.status,
        (fct.vencimento::date - CURRENT_DATE) AS dias_para_vencer
      FROM raw.fluxo_caixa_titulos fct
      WHERE fct.status LIKE '% Futuro'
        AND fct.vencimento::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '10 days'
      LIMIT 100
    ) t
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_proximos_lancamentos_10d() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_proximos_lancamentos_10d() TO service_role;
