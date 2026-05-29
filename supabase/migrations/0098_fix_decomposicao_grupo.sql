-- ---------------------------------------------------------------------------
-- 0098 — fix: agregação Composição dos Lançamentos (ADR-0093 / v4.7 M4.1)
--
-- BUG: get_decomposicao_grupo (0059) consumia vw_decomposicao_grupo, que
-- agrupa por (mes, grupo_categoria, sinal). Como o RPC só filtrava por período
-- e devolvia todas as linhas, cada Grupo_de_Categoria aparecia repetido — uma
-- linha por mês — produzindo labels duplicadas nas Entradas/Saídas.
--
-- FIX:
--   1. get_decomposicao_grupo passa a agregar puramente por
--      (grupo_categoria, sinal) no intervalo, somando os meses. Lê direto de
--      fato_lancamentos + dim_categoria (não depende mais da view por-mês).
--      valor_total retorna a MAGNITUDE (ABS) — positiva tanto p/ entradas
--      quanto p/ saídas — porque dentro de um mesmo sinal todos os valores têm
--      o mesmo sinal, e os donuts/proporções precisam de magnitudes positivas.
--   2. NOVO get_decomposicao_categoria(p_from, p_to, p_grupo) — drill-down:
--      categorias de um grupo, mesma regra de período/sinal/magnitude.
--
-- SECURITY DEFINER, SET search_path = '', GRANT service_role. NÃO aplicar aqui.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- get_decomposicao_grupo(p_from, p_to)
-- Entradas/saídas por Grupo de Categoria, agregadas no período.
-- Sinal derivado do valor (>= 0 entrada, < 0 saída). valor_total = ABS(SUM).
-- ---------------------------------------------------------------------------
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
      SELECT
        COALESCE(dc.grupo_categoria, 'Sem Grupo')                       AS grupo_categoria,
        CASE WHEN fl.valor >= 0 THEN 'entrada' ELSE 'saida' END          AS sinal,
        ABS(SUM(fl.valor))                                              AS valor_total,
        COUNT(*)                                                        AS lancamentos_count
      FROM financeiro.fato_lancamentos fl
      JOIN financeiro.dim_categoria     dc ON dc.id = fl.categoria_id
      WHERE COALESCE(fl.liquidacao, fl.vencimento)
              BETWEEN p_from::date AND p_to::date
      GROUP BY
        COALESCE(dc.grupo_categoria, 'Sem Grupo'),
        CASE WHEN fl.valor >= 0 THEN 'entrada' ELSE 'saida' END
      ORDER BY 2, 3 DESC
    ) t
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_decomposicao_grupo(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_decomposicao_grupo(TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- get_decomposicao_categoria(p_from, p_to, p_grupo)
-- Drill-down: categorias de Grupo(s) de Categoria, agregadas no período.
-- Mesma regra de sinal/magnitude.
--   p_grupo = NULL → TODAS as categorias de todos os grupos (prefetch p/ a UI
--                    filtrar client-side ao expandir um grupo).
--   p_grupo = '...' → apenas as categorias do grupo informado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_decomposicao_categoria(
  p_from  TEXT,
  p_to    TEXT,
  p_grupo TEXT DEFAULT NULL
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
      SELECT
        dc.categoria                                                    AS categoria,
        COALESCE(dc.grupo_categoria, 'Sem Grupo')                       AS grupo_categoria,
        CASE WHEN fl.valor >= 0 THEN 'entrada' ELSE 'saida' END          AS sinal,
        ABS(SUM(fl.valor))                                              AS valor_total,
        COUNT(*)                                                        AS lancamentos_count
      FROM financeiro.fato_lancamentos fl
      JOIN financeiro.dim_categoria     dc ON dc.id = fl.categoria_id
      WHERE COALESCE(fl.liquidacao, fl.vencimento)
              BETWEEN p_from::date AND p_to::date
        AND (p_grupo IS NULL
             OR COALESCE(dc.grupo_categoria, 'Sem Grupo') = p_grupo)
      GROUP BY
        dc.categoria,
        COALESCE(dc.grupo_categoria, 'Sem Grupo'),
        CASE WHEN fl.valor >= 0 THEN 'entrada' ELSE 'saida' END
      ORDER BY 2, 3, 4 DESC
    ) t
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_decomposicao_categoria(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_decomposicao_categoria(TEXT, TEXT, TEXT) TO service_role;
