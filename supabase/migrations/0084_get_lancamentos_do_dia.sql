-- 0084: get_lancamentos_do_dia — retorna títulos com vencimento numa data específica

CREATE OR REPLACE FUNCTION public.get_lancamentos_do_dia(
  p_data DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT JSON_AGG(row_to_json(r) ORDER BY r.valor_final DESC)
    FROM (
      SELECT
        numero,
        pessoa,
        descricao,
        valor_final,
        conta_previsao,
        tipo,
        status
      FROM raw.fluxo_caixa_titulos
      WHERE vencimento = p_data
        AND status IN ('Entrada', 'Saída', 'A Receber Futuro', 'A Pagar Futuro')
      LIMIT 100
    ) r
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_lancamentos_do_dia(DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_lancamentos_do_dia(DATE) TO anon, authenticated, service_role;
