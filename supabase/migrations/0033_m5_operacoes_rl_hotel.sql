-- ---------------------------------------------------------------------------
-- 0033 — M5: Adiciona hotel, custos_internos e margem_liquida_pct ao RPC
--          get_operacoes_weddings, expondo Receita Líquida na lista
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_operacoes_weddings(
  p_status         text    DEFAULT 'todos',
  p_periodo_inicio date    DEFAULT NULL,
  p_periodo_fim    date    DEFAULT NULL,
  p_subsetor       text    DEFAULT 'todos',
  p_busca          text    DEFAULT NULL,
  p_ordenar_por    text    DEFAULT 'data_evento',
  p_direcao        text    DEFAULT 'desc',
  p_pagina         int     DEFAULT 1,
  p_por_pagina     int     DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offset     int := (GREATEST(p_pagina, 1) - 1) * LEAST(GREATEST(p_por_pagina, 1), 200);
  v_limit      int := LEAST(GREATEST(p_por_pagina, 1), 200);
  v_order_col  text;
  v_order_dir  text;
  v_operacoes  jsonb;
  v_sql        text;
BEGIN
  v_order_col := CASE p_ordenar_por
    WHEN 'receita'    THEN 'v_receita'
    WHEN 'margem'     THEN 'v_margem'
    WHEN 'resultado'  THEN 'd_resultado_caixa'
    WHEN 'ml'         THEN 'd_margem_liquida'
    ELSE 'd_data_evento'
  END;
  v_order_dir := CASE WHEN lower(p_direcao) = 'asc' THEN 'ASC' ELSE 'DESC' END;

  v_sql := $q$
    WITH vendas_op AS (
      SELECT
        l.operacao,
        COALESCE(SUM(fvi.valor_total), 0) AS faturamento,
        COALESCE(SUM(fvi.receitas),    0) AS receita
      FROM (
        SELECT DISTINCT operacao, venda_n::text AS venda_num
        FROM analytics.fato_lancamento_operacao
        WHERE venda_n IS NOT NULL
      ) l
      LEFT JOIN analytics.fato_venda      fv  ON fv.venda_numero = l.venda_num
      LEFT JOIN analytics.fato_venda_item fvi ON fvi.fato_venda_id = fv.id
      GROUP BY l.operacao
    ),
    subsetor_op AS (
      SELECT DISTINCT ON (l.operacao)
        l.operacao,
        COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO') AS subsetor_predominante
      FROM (
        SELECT DISTINCT operacao, venda_n::text AS venda_num
        FROM analytics.fato_lancamento_operacao
        WHERE venda_n IS NOT NULL
      ) l
      LEFT JOIN analytics.fato_venda        fv  ON fv.venda_numero = l.venda_num
      LEFT JOIN analytics.fato_venda_item   fvi ON fvi.fato_venda_id = fv.id
      LEFT JOIN analytics.dim_produto       dp  ON dp.id = fvi.produto_id
      LEFT JOIN analytics.dim_produto_subsetor dps
             ON dps.produto_normalizado = UPPER(TRIM(dp.nome))
      ORDER BY l.operacao,
               SUM(COALESCE(fvi.valor_total, 0)) OVER (
                 PARTITION BY l.operacao, COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO')
               ) DESC
    ),
    base AS (
      SELECT
        d.operacao                                      AS d_operacao,
        d.nome_casal                                    AS d_nome_casal,
        d.data_evento                                   AS d_data_evento,
        d.situacao                                      AS d_situacao,
        d.resultado_caixa                               AS d_resultado_caixa,
        d.ncg                                           AS d_ncg,
        d.hotel                                         AS d_hotel,
        d.custos_internos                               AS d_custos_internos,
        d.margem_liquida_pct                            AS d_margem_liquida,
        COALESCE(v.faturamento, 0)                      AS v_faturamento,
        COALESCE(v.receita, 0)                          AS v_receita,
        CASE WHEN COALESCE(v.faturamento, 0) > 0
          THEN ROUND(v.receita / v.faturamento * 100, 1)
          ELSE 0 END                                    AS v_margem
      FROM analytics.dim_operacao_weddings d
      LEFT JOIN vendas_op   v  ON v.operacao  = d.operacao
      LEFT JOIN subsetor_op sp ON sp.operacao = d.operacao
      WHERE ($1 = 'todos'  OR d.situacao = $1)
        AND ($2 IS NULL    OR d.data_evento >= $2)
        AND ($3 IS NULL    OR d.data_evento <= $3)
        AND ($4 = 'todos'  OR sp.subsetor_predominante = $4)
        AND ($5 IS NULL    OR d.nome_casal ILIKE '%' || $5 || '%')
    )
    SELECT jsonb_build_object(
      'total',      (SELECT COUNT(*) FROM base),
      'pagina',     $6,
      'por_pagina', $8,
      'operacoes',  COALESCE(
        (SELECT jsonb_agg(row_data ORDER BY ord)
         FROM (
           SELECT
             jsonb_build_object(
               'operacao',          d_operacao,
               'nome_casal',        d_nome_casal,
               'data_evento',       d_data_evento,
               'situacao',          d_situacao,
               'faturamento',       v_faturamento,
               'receita',           v_receita,
               'margem_pct',        v_margem,
               'resultado_caixa',   d_resultado_caixa,
               'ncg',               d_ncg,
               'hotel',             d_hotel,
               'custos_internos',   d_custos_internos,
               'margem_liquida_pct', d_margem_liquida,
               'flags', (
                 SELECT COALESCE(jsonb_agg(f), '[]'::jsonb)
                 FROM unnest(ARRAY[
                   CASE WHEN v_margem < 0 THEN 'margem_negativa' END,
                   CASE WHEN d_ncg > 50000 THEN 'ncg_alto' END,
                   CASE WHEN v_margem > 50 OR v_margem < -20 THEN 'outlier' END
                 ]) AS f WHERE f IS NOT NULL
               )
             ) AS row_data,
             ROW_NUMBER() OVER (ORDER BY $q$ || v_order_col || $q$ $q$ || v_order_dir || $q$ NULLS LAST) AS ord
           FROM base
           LIMIT $8 OFFSET $7
         ) paged
        ),
        '[]'::jsonb
      )
    )
  $q$;

  EXECUTE v_sql
  INTO v_operacoes
  USING
    p_status, p_periodo_inicio, p_periodo_fim, p_subsetor, p_busca,
    p_pagina, v_offset, v_limit;

  RETURN v_operacoes;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_operacoes_weddings(text, date, date, text, text, text, text, int, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_operacoes_weddings(text, date, date, text, text, text, text, int, int)
  TO anon, authenticated, service_role;
