-- ---------------------------------------------------------------------------
-- 0059 — feat: views analíticas financeiro (ADR-0061 / M2.3)
--
-- vw_fluxo_caixa_mensal    ← mês × grupo, realizado vs previsto
-- vw_proximos_vencimentos  ← títulos em aberto por vencimento + aging
-- vw_posicao_por_conta     ← saldo realizado agregado por conta bancária
-- vw_decomposicao_grupo    ← entrada/saída por Grupo de Categoria
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- vw_fluxo_caixa_mensal
-- Realizado: liquidacao não nula → agrupa por mês de liquidacao.
-- Previsto:  liquidacao nula     → agrupa por mês de vencimento.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW financeiro.vw_fluxo_caixa_mensal AS
SELECT
  DATE_TRUNC('month', COALESCE(fl.liquidacao, fl.vencimento))::date AS mes,
  dc.grupo_categoria,
  CASE WHEN fl.liquidacao IS NOT NULL THEN 'realizado' ELSE 'previsto' END AS tipo,
  SUM(fl.valor)                                                             AS valor_total,
  COUNT(*)                                                                  AS lancamentos_count
FROM financeiro.fato_lancamentos fl
JOIN financeiro.dim_categoria     dc  ON dc.id = fl.categoria_id
WHERE COALESCE(fl.liquidacao, fl.vencimento) IS NOT NULL
GROUP BY 1, 2, 3;

GRANT SELECT ON financeiro.vw_fluxo_caixa_mensal TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- vw_proximos_vencimentos
-- Títulos ainda não liquidados, com aging bucket.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW financeiro.vw_proximos_vencimentos AS
SELECT
  fl.id,
  fl.numero,
  fl.vencimento,
  fl.venda_no,
  fl.pessoa,
  fl.descricao,
  fl.valor,
  dc.categoria,
  dc.grupo_categoria,
  dcb.conta,
  dcb.tipo AS tipo_conta,
  CASE
    WHEN fl.vencimento >= CURRENT_DATE               THEN 'a_vencer'
    WHEN fl.vencimento >= CURRENT_DATE - INTERVAL '30 days' THEN 'vencido_30d'
    WHEN fl.vencimento >= CURRENT_DATE - INTERVAL '90 days' THEN 'vencido_30_90d'
    ELSE                                                         'vencido_90d_mais'
  END AS aging
FROM financeiro.fato_lancamentos   fl
LEFT JOIN financeiro.dim_categoria      dc  ON dc.id  = fl.categoria_id
LEFT JOIN financeiro.dim_conta_bancaria dcb ON dcb.id = fl.conta_bancaria_id
WHERE fl.liquidacao IS NULL
  AND fl.vencimento IS NOT NULL;

GRANT SELECT ON financeiro.vw_proximos_vencimentos TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- vw_posicao_por_conta
-- Saldo realizado (liquidacao não nula) agregado por conta bancária.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW financeiro.vw_posicao_por_conta AS
SELECT
  dcb.conta,
  dcb.tipo AS tipo_conta,
  SUM(fl.valor) AS saldo
FROM financeiro.fato_lancamentos   fl
JOIN financeiro.dim_conta_bancaria dcb ON dcb.id = fl.conta_bancaria_id
WHERE fl.liquidacao IS NOT NULL
GROUP BY dcb.conta, dcb.tipo;

GRANT SELECT ON financeiro.vw_posicao_por_conta TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- vw_decomposicao_grupo
-- Entrada/saída por Grupo de Categoria, filtrável por período.
-- Sinal derivado do valor: positivo = entrada, negativo = saída.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW financeiro.vw_decomposicao_grupo AS
SELECT
  DATE_TRUNC('month', COALESCE(fl.liquidacao, fl.vencimento))::date AS mes,
  dc.grupo_categoria,
  CASE WHEN fl.valor >= 0 THEN 'entrada' ELSE 'saida' END           AS sinal,
  SUM(fl.valor)                                                       AS valor_total,
  COUNT(*)                                                            AS lancamentos_count
FROM financeiro.fato_lancamentos fl
JOIN financeiro.dim_categoria     dc  ON dc.id = fl.categoria_id
WHERE COALESCE(fl.liquidacao, fl.vencimento) IS NOT NULL
GROUP BY 1, 2, 3;

GRANT SELECT ON financeiro.vw_decomposicao_grupo TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Wrapper RPCs públicos (SECURITY DEFINER para service_role)
-- Retornam JSON para consumo pelo Next.js
-- ---------------------------------------------------------------------------

-- get_fluxo_caixa_mensal(p_from, p_to)
CREATE OR REPLACE FUNCTION public.get_fluxo_caixa_mensal(
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
    SELECT JSON_AGG(row_to_json(t))
    FROM (
      SELECT mes, grupo_categoria, tipo, valor_total, lancamentos_count
      FROM financeiro.vw_fluxo_caixa_mensal
      WHERE mes BETWEEN p_from::date AND p_to::date
      ORDER BY mes, grupo_categoria, tipo
    ) t
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_mensal(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_mensal(TEXT, TEXT) TO service_role;

-- get_proximos_vencimentos(p_limite, p_offset)
CREATE OR REPLACE FUNCTION public.get_proximos_vencimentos(
  p_limite INT DEFAULT 50,
  p_offset INT DEFAULT 0
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
          SELECT id, numero, vencimento, venda_no, pessoa, descricao,
                 valor, categoria, grupo_categoria, conta, tipo_conta, aging
          FROM financeiro.vw_proximos_vencimentos
          ORDER BY vencimento
          LIMIT p_limite OFFSET p_offset
        ) t
      ),
      'total', (SELECT COUNT(*) FROM financeiro.vw_proximos_vencimentos)
    )
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_proximos_vencimentos(INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_proximos_vencimentos(INT, INT) TO service_role;

-- get_posicao_por_conta()
CREATE OR REPLACE FUNCTION public.get_posicao_por_conta()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT JSON_AGG(row_to_json(t))
    FROM (
      SELECT conta, tipo_conta, saldo
      FROM financeiro.vw_posicao_por_conta
      ORDER BY tipo_conta, conta
    ) t
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_posicao_por_conta() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_posicao_por_conta() TO service_role;

-- get_decomposicao_grupo(p_from, p_to)
CREATE OR REPLACE FUNCTION public.get_decomposicao_grupo(
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
    SELECT JSON_AGG(row_to_json(t))
    FROM (
      SELECT mes, grupo_categoria, sinal, valor_total, lancamentos_count
      FROM financeiro.vw_decomposicao_grupo
      WHERE mes BETWEEN p_from::date AND p_to::date
      ORDER BY mes, grupo_categoria, sinal
    ) t
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_decomposicao_grupo(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_decomposicao_grupo(TEXT, TEXT) TO service_role;
