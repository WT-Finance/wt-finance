-- RPC paramétrica que substitui get_proximos_lancamentos_10d para suportar
-- filtros de 5d, 10d e período personalizado no client component.
CREATE OR REPLACE FUNCTION public.get_proximos_lancamentos(p_dias int DEFAULT 10)
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
        AND fct.vencimento::date
              BETWEEN CURRENT_DATE
              AND     CURRENT_DATE + (p_dias || ' days')::interval
      LIMIT 500
    ) t
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_proximos_lancamentos(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_proximos_lancamentos(int) TO service_role;
