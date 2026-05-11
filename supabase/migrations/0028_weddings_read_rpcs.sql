-- ---------------------------------------------------------------------------
-- 0028 — RPCs de leitura para Parte 2 da aba Weddings
--
--   public.get_sumario_subsetor(p_from, p_to)
--   public.get_operacoes_weddings(9 params)
--   public.get_operacao_weddings(p_operacao)
--   public.get_pipeline_weddings(p_horizonte_meses)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Sumário por Subsetor (Bloco 2.1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sumario_subsetor(
  p_from date,
  p_to   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subsetores jsonb;
  v_total      jsonb;
  v_fat_total  numeric;
BEGIN
  SELECT COALESCE(SUM(fvi.valor_total), 0)
  INTO v_fat_total
  FROM analytics.fato_venda_item  fvi
  JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
  JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
  JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
  WHERE fv.data_venda BETWEEN p_from AND p_to
    AND dsm.nome = 'Weddings';

  SELECT jsonb_agg(
    jsonb_build_object(
      'subsetor',        sub.subsetor,
      'n_vendas',        sub.n_vendas,
      'faturamento',     sub.faturamento,
      'receita',         sub.receita,
      'margem_pct',      CASE WHEN sub.faturamento > 0
                           THEN ROUND(sub.receita / sub.faturamento * 100, 1)
                           ELSE 0 END,
      'pct_faturamento', CASE WHEN v_fat_total > 0
                           THEN ROUND(sub.faturamento / v_fat_total * 100, 1)
                           ELSE 0 END
    )
    ORDER BY sub.faturamento DESC
  )
  INTO v_subsetores
  FROM (
    SELECT
      COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO') AS subsetor,
      COUNT(DISTINCT fv.id)                       AS n_vendas,
      COALESCE(SUM(fvi.valor_total), 0)           AS faturamento,
      COALESCE(SUM(fvi.receitas),    0)           AS receita
    FROM analytics.fato_venda_item  fvi
    JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
    JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
    JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
    JOIN analytics.dim_produto      dp  ON dp.id  = fvi.produto_id
    LEFT JOIN analytics.dim_produto_subsetor dps
           ON dps.produto_normalizado = UPPER(TRIM(dp.nome))
    WHERE fv.data_venda BETWEEN p_from AND p_to
      AND dsm.nome = 'Weddings'
    GROUP BY COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO')
  ) sub;

  SELECT jsonb_build_object(
    'n_vendas',    COUNT(DISTINCT fv.id),
    'faturamento', COALESCE(SUM(fvi.valor_total), 0),
    'receita',     COALESCE(SUM(fvi.receitas),    0),
    'margem_pct',  CASE WHEN COALESCE(SUM(fvi.valor_total), 0) > 0
                     THEN ROUND(SUM(fvi.receitas) / SUM(fvi.valor_total) * 100, 1)
                     ELSE 0 END
  )
  INTO v_total
  FROM analytics.fato_venda_item  fvi
  JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
  JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
  JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
  WHERE fv.data_venda BETWEEN p_from AND p_to
    AND dsm.nome = 'Weddings';

  RETURN jsonb_build_object(
    'periodo',    jsonb_build_object('inicio', p_from, 'fim', p_to),
    'subsetores', COALESCE(v_subsetores, '[]'::jsonb),
    'total',      COALESCE(v_total,
      '{"n_vendas":0,"faturamento":0,"receita":0,"margem_pct":0}'::jsonb)
  );
END $$;

-- ---------------------------------------------------------------------------
-- 2. Lista de Operações paginada com filtros (Bloco 2.2)
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
  v_total      int;
  v_operacoes  jsonb;
  v_sql        text;
BEGIN
  -- Sanitize order params (whitelist)
  v_order_col := CASE p_ordenar_por
    WHEN 'receita'    THEN 'v_receita'
    WHEN 'margem'     THEN 'v_margem'
    WHEN 'resultado'  THEN 'd_resultado_caixa'
    ELSE 'd_data_evento'
  END;
  v_order_dir := CASE WHEN lower(p_direcao) = 'asc' THEN 'ASC' ELSE 'DESC' END;

  -- Base query as dynamic SQL (needed for column-based ordering)
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
               'operacao',        d_operacao,
               'nome_casal',      d_nome_casal,
               'data_evento',     d_data_evento,
               'situacao',        d_situacao,
               'faturamento',     v_faturamento,
               'receita',         v_receita,
               'margem_pct',      v_margem,
               'resultado_caixa', d_resultado_caixa,
               'ncg',             d_ncg,
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

-- ---------------------------------------------------------------------------
-- 3. Drill-down de uma operação (Bloco 2.3)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_operacao_weddings(p_operacao text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dim         analytics.dim_operacao_weddings%ROWTYPE;
  v_faturamento numeric;
  v_receita     numeric;
  v_decomp      jsonb;
  v_acumulado   jsonb;
  v_lancamentos jsonb;
BEGIN
  SELECT * INTO v_dim
  FROM analytics.dim_operacao_weddings
  WHERE operacao = p_operacao;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Operação não encontrada');
  END IF;

  -- Faturamento e receita das vendas linkadas via lançamentos
  SELECT
    COALESCE(SUM(fvi.valor_total), 0),
    COALESCE(SUM(fvi.receitas),    0)
  INTO v_faturamento, v_receita
  FROM (
    SELECT DISTINCT venda_n::text AS venda_num
    FROM analytics.fato_lancamento_operacao
    WHERE operacao = p_operacao AND venda_n IS NOT NULL
  ) l
  LEFT JOIN analytics.fato_venda      fv  ON fv.venda_numero = l.venda_num
  LEFT JOIN analytics.fato_venda_item fvi ON fvi.fato_venda_id = fv.id;

  -- Decomposição por subsetor (pelo lado da receita das vendas)
  SELECT jsonb_agg(
    jsonb_build_object(
      'subsetor', sub.subsetor,
      'receita',  sub.receita,
      'pct',      CASE WHEN sub.total_receita > 0
                    THEN ROUND(sub.receita / sub.total_receita * 100, 1)
                    ELSE 0 END
    )
    ORDER BY sub.receita DESC
  )
  INTO v_decomp
  FROM (
    SELECT
      COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO')       AS subsetor,
      COALESCE(SUM(fvi.receitas), 0)                   AS receita,
      SUM(COALESCE(SUM(fvi.receitas), 0)) OVER ()      AS total_receita
    FROM (
      SELECT DISTINCT venda_n::text AS venda_num
      FROM analytics.fato_lancamento_operacao
      WHERE operacao = p_operacao AND venda_n IS NOT NULL
    ) l
    LEFT JOIN analytics.fato_venda        fv  ON fv.venda_numero = l.venda_num
    LEFT JOIN analytics.fato_venda_item   fvi ON fvi.fato_venda_id = fv.id
    LEFT JOIN analytics.dim_produto       dp  ON dp.id = fvi.produto_id
    LEFT JOIN analytics.dim_produto_subsetor dps
           ON dps.produto_normalizado = UPPER(TRIM(dp.nome))
    GROUP BY COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO')
  ) sub;

  -- Acumulado mensal (Entradas e Saídas) para gráfico
  SELECT jsonb_agg(
    jsonb_build_object(
      'mes',          TO_CHAR(mes, 'YYYY-MM'),
      'entrada_acum', entrada_acum,
      'saida_acum',   saida_acum
    )
    ORDER BY mes
  )
  INTO v_acumulado
  FROM (
    SELECT
      DATE_TRUNC('month', COALESCE(liquidacao_dt, vencimento_dt)) AS mes,
      SUM(SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE 0 END))
        OVER (ORDER BY DATE_TRUNC('month', COALESCE(liquidacao_dt, vencimento_dt))) AS entrada_acum,
      SUM(SUM(CASE WHEN tipo = 'Saída'   THEN valor ELSE 0 END))
        OVER (ORDER BY DATE_TRUNC('month', COALESCE(liquidacao_dt, vencimento_dt))) AS saida_acum
    FROM analytics.fato_lancamento_operacao
    WHERE operacao = p_operacao
      AND COALESCE(liquidacao_dt, vencimento_dt) IS NOT NULL
    GROUP BY DATE_TRUNC('month', COALESCE(liquidacao_dt, vencimento_dt))
  ) acum;

  -- Lançamentos recentes — últimos 10 por data
  SELECT jsonb_agg(
    jsonb_build_object(
      'data',      COALESCE(liquidacao_dt, vencimento_dt),
      'tipo',      tipo,
      'descricao', descricao,
      'valor',     valor,
      'status',    status
    )
  )
  INTO v_lancamentos
  FROM (
    SELECT liquidacao_dt, vencimento_dt, tipo, descricao, valor, status
    FROM analytics.fato_lancamento_operacao
    WHERE operacao = p_operacao
    ORDER BY COALESCE(liquidacao_dt, vencimento_dt) DESC NULLS LAST
    LIMIT 10
  ) rec;

  RETURN jsonb_build_object(
    'operacao',    v_dim.operacao,
    'nome_casal',  v_dim.nome_casal,
    'data_evento', v_dim.data_evento,
    'situacao',    v_dim.situacao,
    'visao_financeira', jsonb_build_object(
      'faturamento',     v_faturamento,
      'receita_bruta',   v_receita,
      'margem_pct',      CASE WHEN v_faturamento > 0
                           THEN ROUND(v_receita / v_faturamento * 100, 1)
                           ELSE 0 END,
      'entradas_total',  v_dim.entradas_total,
      'recebido',        v_dim.recebido,
      'a_receber',       v_dim.a_receber,
      'saidas_total',    v_dim.saidas_total,
      'pago',            v_dim.pago,
      'a_pagar',         v_dim.a_pagar,
      'resultado_caixa', v_dim.resultado_caixa,
      'resultado_pct',   CASE WHEN v_dim.entradas_total > 0
                           THEN ROUND(v_dim.resultado_caixa / v_dim.entradas_total * 100, 1)
                           ELSE 0 END,
      'ncg',             v_dim.ncg
    ),
    'decomposicao_subsetor', COALESCE(v_decomp,      '[]'::jsonb),
    'acumulado_mensal',      COALESCE(v_acumulado,   '[]'::jsonb),
    'lancamentos_recentes',  COALESCE(v_lancamentos, '[]'::jsonb)
  );
END $$;

-- ---------------------------------------------------------------------------
-- 4. Pipeline de Eventos Futuros (Bloco 2.4)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pipeline_weddings(
  p_horizonte_meses int DEFAULT 18
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_horizonte int := LEAST(GREATEST(COALESCE(p_horizonte_meses, 18), 1), 36);
  v_meses     jsonb;
  v_total     jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'ano_mes',            TO_CHAR(mes, 'YYYY-MM'),
      'n_casamentos',       n_casamentos,
      'receita_total',      receita_total,
      'margem_pct_media',   margem_pct_media,
      'resultado_esperado', resultado_esperado,
      'cor',                CASE
                              WHEN margem_pct_media > 15 THEN 'verde'
                              WHEN margem_pct_media > 10 THEN 'amarelo'
                              ELSE 'vermelho'
                            END
    )
    ORDER BY mes
  )
  INTO v_meses
  FROM (
    SELECT
      DATE_TRUNC('month', d.data_evento)         AS mes,
      COUNT(*)                                    AS n_casamentos,
      COALESCE(SUM(v.faturamento), 0)             AS receita_total,
      CASE WHEN COALESCE(SUM(v.faturamento), 0) > 0
        THEN ROUND(SUM(v.receita) / SUM(v.faturamento) * 100, 1)
        ELSE 0 END                                AS margem_pct_media,
      COALESCE(SUM(d.resultado_caixa), 0)         AS resultado_esperado
    FROM analytics.dim_operacao_weddings d
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(fvi.valor_total), 0) AS faturamento,
        COALESCE(SUM(fvi.receitas),    0) AS receita
      FROM (
        SELECT DISTINCT venda_n::text AS venda_num
        FROM analytics.fato_lancamento_operacao
        WHERE operacao = d.operacao AND venda_n IS NOT NULL
      ) l
      LEFT JOIN analytics.fato_venda      fv  ON fv.venda_numero = l.venda_num
      LEFT JOIN analytics.fato_venda_item fvi ON fvi.fato_venda_id = fv.id
    ) v ON true
    WHERE d.situacao = 'futuro'
      AND d.data_evento >= DATE_TRUNC('month', CURRENT_DATE)
      AND d.data_evento <  DATE_TRUNC('month', CURRENT_DATE)
                           + (v_horizonte || ' months')::interval
    GROUP BY DATE_TRUNC('month', d.data_evento)
  ) meses;

  SELECT jsonb_build_object(
    'n_casamentos',       COUNT(*),
    'receita_total',      COALESCE(SUM(v.faturamento), 0),
    'resultado_esperado', COALESCE(SUM(d.resultado_caixa), 0)
  )
  INTO v_total
  FROM analytics.dim_operacao_weddings d
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(fvi.valor_total), 0) AS faturamento
    FROM (
      SELECT DISTINCT venda_n::text AS venda_num
      FROM analytics.fato_lancamento_operacao
      WHERE operacao = d.operacao AND venda_n IS NOT NULL
    ) l
    LEFT JOIN analytics.fato_venda      fv  ON fv.venda_numero = l.venda_num
    LEFT JOIN analytics.fato_venda_item fvi ON fvi.fato_venda_id = fv.id
  ) v ON true
  WHERE d.situacao = 'futuro'
    AND d.data_evento >= DATE_TRUNC('month', CURRENT_DATE)
    AND d.data_evento <  DATE_TRUNC('month', CURRENT_DATE)
                         + (v_horizonte || ' months')::interval;

  RETURN jsonb_build_object(
    'horizonte', v_horizonte,
    'meses',     COALESCE(v_meses, '[]'::jsonb),
    'total',     COALESCE(v_total,
      '{"n_casamentos":0,"receita_total":0,"resultado_esperado":0}'::jsonb)
  );
END $$;
