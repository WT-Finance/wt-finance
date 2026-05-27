-- ---------------------------------------------------------------------------
-- 0068 — fix: refinamento da regra do Bloco 1 em vw_fluxo_caixa_kpis_b
--
-- ADR-0065 Revisão: entradas em contas-cartão (valor > 0) representam
-- receita real (reembolsos de fornecedor, estornos, incentivos) e DEVEM
-- ser incluídas no Bloco 1. A CAP/CAR não registra "Fatura-Entrada" —
-- portanto não há dupla contagem possível com o Bloco 2.
--
-- Regra refinada do Bloco 1:
--   INCLUI: qualquer lançamento liquidado com valor > 0 (entrada), mesmo
--           que a conta seja cartão de crédito.
--   EXCLUI: lançamentos liquidados com valor < 0 (saída) em conta-cartão
--           (esses aparecem agregados no Bloco 2 via Fatura-cartão).
--   EXCLUI: lançamentos sem liquidação.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW financeiro.vw_fluxo_caixa_kpis_b AS
SELECT
  sub.mes,
  sub.is_realizado,
  sub.tipo_movimento,
  sub.fonte,
  sub.valor_unit
FROM (
  -- Bloco 1: Passado liquidado de Lançamentos
  --   Entradas (valor > 0): SEMPRE incluídas, mesmo em cartão
  --   Saídas   (valor < 0): somente se conta NÃO for cartão
  SELECT
    TO_CHAR(f.liquidacao, 'YYYY-MM')                        AS mes,
    TRUE                                                     AS is_realizado,
    CASE WHEN f.valor > 0 THEN 'entrada' ELSE 'saida' END   AS tipo_movimento,
    'lancamentos'::TEXT                                      AS fonte,
    ABS(f.valor)                                            AS valor_unit
  FROM financeiro.fato_lancamentos f
  JOIN financeiro.dim_conta_bancaria dcb ON dcb.id = f.conta_bancaria_id
  WHERE f.liquidacao IS NOT NULL
    AND (
      f.valor > 0                                      -- entradas: sempre incluir
      OR (f.valor < 0 AND dcb.eh_cartao_credito = FALSE)  -- saídas: somente não-cartão
    )

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
