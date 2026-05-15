-- ---------------------------------------------------------------------------
-- 0035 - Review fixes pos v3.5
--
-- Objetivos:
--   - preservar metas nos uploads de vendas;
--   - tornar metas idempotentes por upsert real;
--   - evitar situacao de casamento envelhecida em RPCs de leitura;
--   - endurecer RPCs contra parametros invalidos;
--   - adicionar indices para joins/filtros mais frequentes do modulo Weddings.
-- ---------------------------------------------------------------------------

-- Situacao derivada em tempo de consulta. A coluna persistida segue existindo
-- como snapshot do ultimo rebuild, mas RPCs sensiveis a data usam esta funcao.
CREATE OR REPLACE FUNCTION analytics.situacao_por_data_evento(p_data_evento date)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_data_evento IS NULL      THEN 'sem_data'
    WHEN p_data_evento < CURRENT_DATE THEN 'passado'
    ELSE 'futuro'
  END
$$;

-- ---------------------------------------------------------------------------
-- 1. truncate_dynamic_tables()
--    Metas nao sao dados derivados da planilha de vendas; preserva app.meta_setor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.truncate_dynamic_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  TRUNCATE
    analytics.fato_venda_item,
    analytics.fato_venda,
    analytics.dim_produto,
    analytics.dim_pagante,
    analytics.dim_vendedor,
    raw.vendas_excel
  RESTART IDENTITY CASCADE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.truncate_dynamic_tables() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.truncate_dynamic_tables() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. inserir_metas()
--    Upsert real: se a meta oficial mudar, o seed/upload atualiza o valor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inserir_metas(p_metas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  meta jsonb;
BEGIN
  FOR meta IN SELECT jsonb_array_elements(p_metas)
  LOOP
    INSERT INTO app.meta_setor (setor_macro_id, ano, mes, valor_meta, fonte)
    SELECT
      dsm.id,
      (meta->>'ano')::int,
      (meta->>'mes')::int,
      (meta->>'valor_meta')::numeric,
      meta->>'fonte'
    FROM analytics.dim_setor_macro dsm
    WHERE dsm.nome = meta->>'setor_macro_nome'
    ON CONFLICT (setor_macro_id, ano, mes) DO UPDATE
      SET valor_meta = EXCLUDED.valor_meta,
          fonte      = EXCLUDED.fonte;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.inserir_metas(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.inserir_metas(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. get_carteira_weddings()
--    Sanitiza metrica e retorna arrays vazios quando nao ha base.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_carteira_weddings(
  p_metric text DEFAULT 'casamentos'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_metric text;
BEGIN
  v_metric := CASE
    WHEN p_metric IN ('casamentos', 'faturamento', 'receita_bruta') THEN p_metric
    ELSE 'casamentos'
  END;

  WITH
  base AS (
    SELECT
      EXTRACT(YEAR FROM data_venda_contrato)::int                AS ano_venda,
      EXTRACT(YEAR FROM data_evento)::int                        AS ano_casamento_num,
      COALESCE(EXTRACT(YEAR FROM data_evento)::text, 'sem_data') AS ano_casamento,
      CASE v_metric
        WHEN 'faturamento'   THEN faturamento
        WHEN 'receita_bruta' THEN receita_bruta
        ELSE 1
      END AS valor
    FROM analytics.dim_operacao_weddings
    WHERE data_venda_contrato IS NOT NULL
  ),
  celulas AS (
    SELECT
      ano_venda,
      ano_casamento_num,
      ano_casamento,
      CASE v_metric
        WHEN 'casamentos' THEN COUNT(*)::numeric
        ELSE SUM(valor)
      END AS v
    FROM base
    GROUP BY ano_venda, ano_casamento_num, ano_casamento
  ),
  anos_casamento_arr AS (
    SELECT array_agg(ano_casamento ORDER BY ano_casamento_num NULLS LAST, ano_casamento) AS arr
    FROM (SELECT DISTINCT ano_casamento, ano_casamento_num FROM celulas) t
  ),
  linhas AS (
    SELECT
      ano_venda::text AS av,
      jsonb_object_agg(ano_casamento, v) AS valores,
      SUM(v) AS total
    FROM celulas
    GROUP BY ano_venda
  ),
  totais_col AS (
    SELECT ano_casamento, SUM(v) AS col_total
    FROM celulas
    GROUP BY ano_casamento
  ),
  total_row AS (
    SELECT
      jsonb_object_agg(ano_casamento, col_total) AS valores,
      SUM(col_total) AS total
    FROM totais_col
  ),
  linhas_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('ano_venda', av, 'valores', valores, 'total', total)
        ORDER BY sort_key, av
      ),
      '[]'::jsonb
    ) AS linhas
    FROM (
      SELECT av, valores, total, 1 AS sort_key FROM linhas
      UNION ALL
      SELECT 'total', valores, total, 2 FROM total_row WHERE total IS NOT NULL
    ) combined
  )
  SELECT jsonb_build_object(
    'metrica',        v_metric,
    'anos_casamento', COALESCE((SELECT to_jsonb(arr) FROM anos_casamento_arr), '[]'::jsonb),
    'linhas',         (SELECT linhas FROM linhas_json)
  )
  INTO v_result;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_carteira_weddings(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_carteira_weddings(text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. get_proximos_casamentos()
--    Filtra por data_evento corrente, nao por situacao persistida.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_proximos_casamentos(
  p_horizonte_meses int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result       jsonb;
  v_ratio        numeric;
  v_margem_hist  numeric;
  v_horizonte    int;
BEGIN
  v_horizonte := LEAST(GREATEST(COALESCE(p_horizonte_meses, 6), 1), 36);

  SELECT
    AVG(CASE WHEN receita_bruta > 0
          THEN (entradas_total - saidas_total)::numeric / receita_bruta
          ELSE NULL END),
    AVG(CASE WHEN faturamento > 0
          THEN (entradas_total - saidas_total)::numeric / faturamento * 100
          ELSE NULL END)
  INTO v_ratio, v_margem_hist
  FROM analytics.dim_operacao_weddings
  WHERE data_evento IS NOT NULL
    AND data_evento < CURRENT_DATE
    AND receita_bruta > 0
    AND saidas_total > 0
    AND (entradas_total - saidas_total) >= 0
    AND (entradas_total - saidas_total) <= receita_bruta;

  SELECT jsonb_build_object(
    'horizonte_meses',      v_horizonte,
    'margem_historica_pct', ROUND(COALESCE(v_margem_hist, 0), 1),
    'casamentos', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'data_casamento',          to_char(data_evento, 'YYYY-MM-DD'),
            'casal',                   nome_casal,
            'hotel',                   hotel,
            'faturamento',             faturamento,
            'receita_bruta',           receita_bruta,
            'margem_pct',              margem_bruta_pct,
            'receita_liquida_prevista',
              ROUND(receita_bruta * COALESCE(v_ratio, 0), 2)
          )
          ORDER BY data_evento ASC
        )
        FROM analytics.dim_operacao_weddings
        WHERE data_evento >= CURRENT_DATE
          AND data_evento <= CURRENT_DATE + make_interval(months => v_horizonte)
      ),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_proximos_casamentos(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_proximos_casamentos(int)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. get_operacoes_weddings()
--    Usa situacao derivada e ordena antes de paginar.
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

  v_sql := format($q$
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
        analytics.situacao_por_data_evento(d.data_evento) AS d_situacao,
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
      WHERE ($1 = 'todos'  OR analytics.situacao_por_data_evento(d.data_evento) = $1)
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
               'operacao',           d_operacao,
               'nome_casal',         d_nome_casal,
               'data_evento',        d_data_evento,
               'situacao',           d_situacao,
               'faturamento',        v_faturamento,
               'receita',            v_receita,
               'margem_pct',         v_margem,
               'resultado_caixa',    d_resultado_caixa,
               'ncg',                d_ncg,
               'hotel',              d_hotel,
               'custos_internos',    d_custos_internos,
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
             ROW_NUMBER() OVER (ORDER BY %I %s NULLS LAST, d_operacao ASC) AS ord
           FROM base
           ORDER BY %I %s NULLS LAST, d_operacao ASC
           LIMIT $8 OFFSET $7
         ) paged
        ),
        '[]'::jsonb
      )
    )
  $q$, v_order_col, v_order_dir, v_order_col, v_order_dir);

  EXECUTE v_sql
  INTO v_operacoes
  USING
    p_status, p_periodo_inicio, p_periodo_fim, p_subsetor, p_busca,
    GREATEST(p_pagina, 1), v_offset, v_limit;

  RETURN v_operacoes;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_operacoes_weddings(text, date, date, text, text, text, text, int, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_operacoes_weddings(text, date, date, text, text, text, text, int, int)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. get_operacao_weddings()
--    Drilldown tambem retorna situacao derivada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_operacao_weddings(p_operacao text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dim         analytics.dim_operacao_weddings%ROWTYPE;
  v_situacao    text;
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

  v_situacao := analytics.situacao_por_data_evento(v_dim.data_evento);

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
    'situacao',    v_situacao,
    'hotel',       v_dim.hotel,
    'visao_financeira', jsonb_build_object(
      'faturamento',        v_faturamento,
      'receita_bruta',      v_receita,
      'margem_pct',         CASE WHEN v_faturamento > 0
                              THEN ROUND(v_receita / v_faturamento * 100, 1)
                              ELSE 0 END,
      'custos_internos',    v_dim.custos_internos,
      'margem_liquida_pct', v_dim.margem_liquida_pct,
      'entradas_total',     v_dim.entradas_total,
      'recebido',           v_dim.recebido,
      'a_receber',          v_dim.a_receber,
      'saidas_total',       v_dim.saidas_total,
      'pago',               v_dim.pago,
      'a_pagar',            v_dim.a_pagar,
      'resultado_caixa',    v_dim.resultado_caixa,
      'resultado_pct',      CASE WHEN v_dim.entradas_total > 0
                              THEN ROUND(v_dim.resultado_caixa / v_dim.entradas_total * 100, 1)
                              ELSE 0 END,
      'ncg',                v_dim.ncg
    ),
    'decomposicao_subsetor', COALESCE(v_decomp,      '[]'::jsonb),
    'acumulado_mensal',      COALESCE(v_acumulado,   '[]'::jsonb),
    'lancamentos_recentes',  COALESCE(v_lancamentos, '[]'::jsonb)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_operacao_weddings(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_operacao_weddings(text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Indices para caminhos quentes das RPCs Weddings.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dim_operacao_weddings_data_evento
  ON analytics.dim_operacao_weddings (data_evento)
  WHERE data_evento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dim_operacao_weddings_data_venda_contrato
  ON analytics.dim_operacao_weddings (data_venda_contrato)
  WHERE data_venda_contrato IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raw_vendas_excel_contrato_venda
  ON raw.vendas_excel (venda_numero)
  WHERE contrato IS TRUE;

CREATE INDEX IF NOT EXISTS idx_fato_lancamento_operacao_operacao_venda
  ON analytics.fato_lancamento_operacao (operacao, venda_n)
  WHERE venda_n IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fato_lancamento_operacao_venda
  ON analytics.fato_lancamento_operacao (venda_n)
  WHERE venda_n IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dim_produto_subsetor_normalizado
  ON analytics.dim_produto_subsetor (produto_normalizado)
  WHERE ativo IS TRUE;
