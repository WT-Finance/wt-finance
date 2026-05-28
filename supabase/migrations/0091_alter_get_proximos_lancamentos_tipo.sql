-- Estende get_proximos_lancamentos com p_tipo para filtrar por tipo de título
-- p_tipo aceita 'A Receber Futuro' / 'A Pagar Futuro' / NULL para ambos
CREATE OR REPLACE FUNCTION public.get_proximos_lancamentos(
  p_dias INT DEFAULT 10,
  p_tipo TEXT DEFAULT NULL
)
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
        AND (p_tipo IS NULL OR fct.status = p_tipo)
      LIMIT 500
    ) t
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_proximos_lancamentos(INT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_proximos_lancamentos(INT, TEXT) TO service_role;
