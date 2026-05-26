-- ---------------------------------------------------------------------------
-- 0065 — feat: vw_fluxo_caixa_kpis_b + RPCs Abordagem B (ADR-0065 / M4)
--
-- View 4-blocos unificando Lançamentos e CAP/CAR com tratamento de cartões.
-- Blocos:
--   1. Lançamentos liquidados exceto contas-cartão
--   2. Faturas-cartão realizadas da CAP/CAR (substituem os lançamentos de cartão)
--   3. CAP/CAR futuros exceto conta_previsao = cartão
--   4. Faturas-cartão futuras (A Pagar Futuro com descricao 'Fatura X')
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW financeiro.vw_fluxo_caixa_kpis_b AS
SELECT
  sub.mes,
  sub.is_realizado,
  sub.tipo_movimento,
  sub.fonte,
  sub.valor_unit
FROM (
  -- Bloco 1: Passado liquidado de Lançamentos, exceto contas-cartão
  SELECT
    TO_CHAR(f.liquidacao, 'YYYY-MM')                        AS mes,
    TRUE                                                     AS is_realizado,
    CASE WHEN f.valor > 0 THEN 'entrada' ELSE 'saida' END   AS tipo_movimento,
    'lancamentos'::TEXT                                      AS fonte,
    ABS(f.valor)                                            AS valor_unit
  FROM financeiro.fato_lancamentos f
  JOIN financeiro.dim_conta_bancaria dcb ON dcb.id = f.conta_bancaria_id
  WHERE f.liquidacao IS NOT NULL
    AND dcb.eh_cartao_credito = FALSE

  UNION ALL

  -- Bloco 2: Passado, Faturas-cartão realizadas da CAP/CAR
  SELECT
    fct.mes_ano                                              AS mes,
    TRUE                                                     AS is_realizado,
    CASE WHEN fct.tipo = 'Entrada' THEN 'entrada' ELSE 'saida' END AS tipo_movimento,
    'fluxo_caixa_titulos'::TEXT                              AS fonte,
    fct.valor_final                                         AS valor_unit
  FROM raw.fluxo_caixa_titulos fct
  WHERE fct.status IN ('Entrada', 'Saída')
    AND (
      fct.descricao ILIKE 'Fatura WCLARA%'
      OR fct.descricao ILIKE 'Fatura CC ASAAS%'
      OR fct.descricao ILIKE 'Fatura CCAB%'
      OR fct.descricao ILIKE 'Fatura CCMV%'
      OR fct.descricao ILIKE 'Fatura VISA WT%'
      OR fct.descricao ILIKE 'Fatura MASTERCARD WT%'
    )

  UNION ALL

  -- Bloco 3: Futuro, CAP/CAR exceto conta_previsao cartão
  SELECT
    fct.mes_ano                                              AS mes,
    FALSE                                                    AS is_realizado,
    CASE WHEN fct.tipo = 'Entrada' THEN 'entrada' ELSE 'saida' END AS tipo_movimento,
    'fluxo_caixa_titulos'::TEXT                              AS fonte,
    fct.valor_final                                         AS valor_unit
  FROM raw.fluxo_caixa_titulos fct
  LEFT JOIN financeiro.dim_conta_bancaria dcb ON dcb.conta = fct.conta_previsao
  WHERE fct.status IN ('A Receber Futuro', 'A Pagar Futuro')
    AND COALESCE(dcb.eh_cartao_credito, FALSE) = FALSE

  UNION ALL

  -- Bloco 4: Futuro, Faturas-cartão previstas (saídas)
  SELECT
    fct.mes_ano                                              AS mes,
    FALSE                                                    AS is_realizado,
    'saida'::TEXT                                            AS tipo_movimento,
    'fluxo_caixa_titulos'::TEXT                              AS fonte,
    fct.valor_final                                         AS valor_unit
  FROM raw.fluxo_caixa_titulos fct
  WHERE fct.status = 'A Pagar Futuro'
    AND (
      fct.descricao ILIKE 'Fatura WCLARA%'
      OR fct.descricao ILIKE 'Fatura CC ASAAS%'
      OR fct.descricao ILIKE 'Fatura CCAB%'
      OR fct.descricao ILIKE 'Fatura CCMV%'
      OR fct.descricao ILIKE 'Fatura VISA WT%'
      OR fct.descricao ILIKE 'Fatura MASTERCARD WT%'
    )
) sub;

GRANT SELECT ON financeiro.vw_fluxo_caixa_kpis_b TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- RPC: get_fluxo_caixa_kpis_b(p_from, p_to)
-- Retorna JSON com KPIs agregados (entradas/saidas realizadas e previstas).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_fluxo_caixa_kpis_b(
  p_from TEXT,
  p_to   TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT JSON_BUILD_OBJECT(
      'entradas_realizadas',  COALESCE(SUM(CASE WHEN     is_realizado AND tipo_movimento = 'entrada' THEN valor_unit ELSE 0 END), 0),
      'saidas_realizadas',    COALESCE(SUM(CASE WHEN     is_realizado AND tipo_movimento = 'saida'   THEN valor_unit ELSE 0 END), 0),
      'saldo_realizado',      COALESCE(SUM(CASE WHEN     is_realizado AND tipo_movimento = 'entrada' THEN  valor_unit
                                               WHEN     is_realizado AND tipo_movimento = 'saida'   THEN -valor_unit
                                               ELSE 0 END), 0),
      'entradas_previstas',   COALESCE(SUM(CASE WHEN NOT is_realizado AND tipo_movimento = 'entrada' THEN valor_unit ELSE 0 END), 0),
      'saidas_previstas',     COALESCE(SUM(CASE WHEN NOT is_realizado AND tipo_movimento = 'saida'   THEN valor_unit ELSE 0 END), 0),
      'saldo_previsto',       COALESCE(SUM(CASE WHEN NOT is_realizado AND tipo_movimento = 'entrada' THEN  valor_unit
                                               WHEN NOT is_realizado AND tipo_movimento = 'saida'   THEN -valor_unit
                                               ELSE 0 END), 0)
    )
    FROM financeiro.vw_fluxo_caixa_kpis_b
    WHERE mes >= TO_CHAR(p_from::date, 'YYYY-MM')
      AND mes <= TO_CHAR(p_to::date, 'YYYY-MM')
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_kpis_b(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_kpis_b(TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: get_fluxo_caixa_mensal_b(p_from, p_to)
-- Retorna série mensal: mes, is_realizado, entradas, saidas, saldo_acumulado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_fluxo_caixa_mensal_b(
  p_from TEXT,
  p_to   TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT JSON_AGG(row_to_json(final) ORDER BY final.mes)
    FROM (
      SELECT
        sub.mes,
        sub.is_realizado,
        sub.entradas,
        sub.saidas,
        SUM(sub.entradas - sub.saidas) OVER (
          ORDER BY sub.mes
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS saldo_acumulado
      FROM (
        SELECT
          mes,
          bool_or(is_realizado)                                                         AS is_realizado,
          COALESCE(SUM(CASE WHEN tipo_movimento = 'entrada' THEN valor_unit ELSE 0 END), 0) AS entradas,
          COALESCE(SUM(CASE WHEN tipo_movimento = 'saida'   THEN valor_unit ELSE 0 END), 0) AS saidas
        FROM financeiro.vw_fluxo_caixa_kpis_b
        WHERE mes >= TO_CHAR(p_from::date, 'YYYY-MM')
          AND mes <= TO_CHAR(p_to::date, 'YYYY-MM')
        GROUP BY mes
      ) sub
    ) final
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_mensal_b(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_mensal_b(TEXT, TEXT) TO service_role;
