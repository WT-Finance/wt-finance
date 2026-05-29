-- ---------------------------------------------------------------------------
-- 0097 — feat: get_weddings_historico_subsetor(p_from, p_to)
--
-- Série temporal MENSAL de faturamento + receita por subsetor (setor macro
-- Weddings), para os dois gráficos stacked do drawer "Análise Histórica".
--
-- Retorna um array de objetos:
--   [{ mes, subsetor, faturamento, receita }, ...]
--   - mes:         primeiro dia do mês (YYYY-MM-DD), serve de chave + label.
--   - subsetor:    dps.subsetor_detalhado (mesmas chaves de get_sumario_subsetor),
--                  com fallback 'NÃO_CLASSIFICADO'.
--   - faturamento: SUM(valor_total) no mês/subsetor.
--   - receita:     SUM(receitas)    no mês/subsetor.
--
-- Joins / desfanout: idêntico ao padrão de 0077_get_sumario_subsetor_fix_fanout
-- (DISTINCT ON (produto_normalizado) para evitar fan-out por duplicata de casing).
-- Agregação mensal via date_trunc('month', ...), como o branch mensal de
-- get_tendencia_margem (0014). Apenas combinações (mês × subsetor) com vendas
-- são retornadas — o frontend preenche os buracos via merge por mês.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_weddings_historico_subsetor(
  p_from date,
  p_to   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'mes',         to_char(t.mes_inicio, 'YYYY-MM-DD'),
        'subsetor',    t.subsetor,
        'faturamento', t.faturamento,
        'receita',     t.receita
      )
      ORDER BY t.mes_inicio, t.subsetor
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      date_trunc('month', fv.data_venda)::date            AS mes_inicio,
      COALESCE(dps.subsetor_detalhado, 'NÃO_CLASSIFICADO') AS subsetor,
      COALESCE(SUM(fvi.valor_total), 0)                    AS faturamento,
      COALESCE(SUM(fvi.receitas),    0)                    AS receita
    FROM analytics.fato_venda_item  fvi
    JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
    JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
    JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
    JOIN analytics.dim_produto      dp  ON dp.id  = fvi.produto_id
    LEFT JOIN (
      SELECT DISTINCT ON (produto_normalizado)
             produto_normalizado,
             subsetor_detalhado
      FROM   analytics.dim_produto_subsetor
      WHERE  ativo = TRUE
      ORDER  BY produto_normalizado
    ) dps ON dps.produto_normalizado = UPPER(TRIM(dp.nome))
    WHERE fv.data_venda BETWEEN p_from AND p_to
      AND dsm.nome = 'Weddings'
    GROUP BY date_trunc('month', fv.data_venda)::date,
             COALESCE(dps.subsetor_detalhado, 'NÃO_CLASSIFICADO')
  ) t;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_weddings_historico_subsetor(date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_weddings_historico_subsetor(date, date) TO service_role;
