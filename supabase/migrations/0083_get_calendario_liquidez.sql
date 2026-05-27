-- 0083: get_calendario_liquidez — retorna grade do calendário para o mês de referência
-- Inclui dias de semanas parciais (dom anterior e sab posterior) para preencher grid 7 colunas

CREATE OR REPLACE FUNCTION public.get_calendario_liquidez(
  p_mes_referencia DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mes_inicio DATE := date_trunc('month', p_mes_referencia)::date;
  v_mes_fim    DATE := (date_trunc('month', p_mes_referencia) + INTERVAL '1 month - 1 day')::date;
  -- DOW: 0=Domingo, 1=Segunda, ..., 6=Sábado
  -- Grade começa no domingo anterior (ou no próprio dia se já for domingo)
  v_grid_inicio DATE := v_mes_inicio - (EXTRACT(DOW FROM v_mes_inicio)::int);
  -- Grade termina no sábado seguinte (ou no próprio dia se já for sábado)
  v_grid_fim    DATE := v_mes_fim + (6 - EXTRACT(DOW FROM v_mes_fim)::int);
BEGIN
  RETURN (
    SELECT JSON_AGG(row_to_json(r) ORDER BY r.data)
    FROM (
      SELECT
        d.data::text AS data,
        EXTRACT(DAY FROM d.data)::int AS dia,
        d.data = CURRENT_DATE AS eh_hoje,
        (d.data < v_mes_inicio OR d.data > v_mes_fim) AS fora_do_mes,
        COALESCE(SUM(CASE
          WHEN fct.status IN ('Entrada', 'A Receber Futuro') THEN fct.valor_final
          ELSE 0
        END), 0) AS entradas_dia,
        COALESCE(SUM(CASE
          WHEN fct.status IN ('Saída', 'A Pagar Futuro') THEN fct.valor_final
          ELSE 0
        END), 0) AS saidas_dia,
        COALESCE(SUM(CASE
          WHEN fct.status IN ('Entrada', 'A Receber Futuro') THEN fct.valor_final
          WHEN fct.status IN ('Saída', 'A Pagar Futuro')    THEN -fct.valor_final
          ELSE 0
        END), 0) AS saldo_dia
      FROM generate_series(v_grid_inicio, v_grid_fim, '1 day'::interval) AS d(data)
      LEFT JOIN raw.fluxo_caixa_titulos fct
        ON fct.vencimento = d.data::date
        AND fct.status IN ('Entrada', 'Saída', 'A Receber Futuro', 'A Pagar Futuro')
      GROUP BY d.data, v_mes_inicio, v_mes_fim
    ) r
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_calendario_liquidez(DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_calendario_liquidez(DATE) TO anon, authenticated, service_role;
