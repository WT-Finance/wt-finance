-- ---------------------------------------------------------------------------
-- 0073 — feat: tipo_contrato + passageiros em raw.vendas_excel,
--              função contar_convidados_operacao, get_operacoes_weddings v2
-- ---------------------------------------------------------------------------

-- 1. Novas colunas em raw.vendas_excel
ALTER TABLE raw.vendas_excel
  ADD COLUMN IF NOT EXISTS tipo_contrato TEXT,
  ADD COLUMN IF NOT EXISTS passageiros   TEXT;

-- 2. Verificar/habilitar extensão unaccent
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA pg_catalog;

-- 3. Função contar_convidados_operacao
CREATE OR REPLACE FUNCTION public.contar_convidados_operacao(p_operacao TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH vendas_operacao AS (
    SELECT DISTINCT flo.venda_n
    FROM analytics.fato_lancamento_operacao flo
    WHERE flo.operacao = p_operacao
  ),
  passageiros_raw AS (
    SELECT unnest(string_to_array(v.passageiros, ',')) AS nome
    FROM raw.vendas_excel v
    JOIN vendas_operacao vo ON vo.venda_n = v.venda_numero::bigint
    WHERE v.produto = 'Diárias de Hospedagem'
      AND v.passageiros IS NOT NULL
      AND trim(v.passageiros) != ''
  ),
  normalizados AS (
    SELECT DISTINCT
      regexp_replace(
        lower(pg_catalog.unaccent(trim(nome))),
        '\s+', ' ', 'g'
      ) AS nome_norm
    FROM passageiros_raw
    WHERE trim(nome) != ''
  )
  SELECT COUNT(*)::INTEGER FROM normalizados;
$$;

REVOKE EXECUTE ON FUNCTION public.contar_convidados_operacao(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.contar_convidados_operacao(text) TO service_role;

-- 4. inserir_lote_raw v3: inclui tipo_contrato e passageiros
CREATE OR REPLACE FUNCTION public.inserir_lote_raw(p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linha jsonb;
BEGIN
  FOR linha IN SELECT jsonb_array_elements(p_linhas)
  LOOP
    INSERT INTO raw.vendas_excel (
      arquivo_origem,
      linha_origem,
      venda_numero,
      data_venda,
      vendedor,
      pagante,
      setor_macro,
      setor,
      setor_micro,
      produto,
      valor_total,
      receitas,
      contrato,
      taxa_servico,
      semana,
      mes,
      data_inicio_evento,
      fornecedor,
      situacao,
      tipo_contrato,
      passageiros
    ) VALUES (
      linha->>'arquivo_origem',
      (linha->>'linha_origem')::int,
      linha->>'venda_numero',
      (linha->>'data_venda')::date,
      linha->>'vendedor',
      linha->>'pagante',
      linha->>'setor_macro',
      linha->>'setor',
      linha->>'setor_micro',
      linha->>'produto',
      (linha->>'valor_total')::numeric,
      (linha->>'receitas')::numeric,
      (linha->>'contrato')::boolean,
      (linha->>'taxa_servico')::boolean,
      NULLIF(linha->>'semana', '')::int,
      linha->>'mes',
      NULLIF(linha->>'data_inicio_evento', '')::date,
      linha->>'fornecedor',
      NULLIF(linha->>'situacao', ''),
      NULLIF(linha->>'tipo_contrato', ''),
      NULLIF(linha->>'passageiros', '')
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.inserir_lote_raw(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_raw(jsonb) TO service_role;

-- 5. get_operacoes_weddings v2: adiciona tipo_contrato e convidados
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
    WHEN 'nome_casal'  THEN 'd_nome_casal'
    WHEN 'hotel'       THEN 'd_hotel'
    WHEN 'faturamento' THEN 'v_faturamento'
    WHEN 'receita'     THEN 'v_receita'
    WHEN 'margem'      THEN 'v_margem'
    WHEN 'custos'      THEN 'd_custos_internos'
    WHEN 'resultado'   THEN 'd_resultado_caixa'
    WHEN 'ml'          THEN 'd_margem_liquida'
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
    tipo_contrato_cte AS (
      SELECT DISTINCT ON (flo.operacao)
        flo.operacao,
        v.tipo_contrato
      FROM analytics.fato_lancamento_operacao flo
      JOIN raw.vendas_excel v ON v.venda_numero = flo.venda_n::text AND v.contrato = TRUE
      ORDER BY flo.operacao, v.data_venda DESC
    ),
    passageiros_cte AS (
      SELECT DISTINCT ON (flo.operacao)
        flo.operacao,
        v.passageiros
      FROM analytics.fato_lancamento_operacao flo
      JOIN raw.vendas_excel v ON v.venda_numero = flo.venda_n::text
        AND v.produto = 'Diárias de Hospedagem'
        AND v.passageiros IS NOT NULL
        AND trim(v.passageiros) != ''
      ORDER BY flo.operacao, v.id ASC
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
        tc.tipo_contrato                                AS d_tipo_contrato,
        pc.passageiros                                  AS d_passageiros,
        COALESCE(v.faturamento, 0)                      AS v_faturamento,
        COALESCE(v.receita, 0)                          AS v_receita,
        CASE WHEN COALESCE(v.faturamento, 0) > 0
          THEN ROUND(v.receita / v.faturamento * 100, 1)
          ELSE 0 END                                    AS v_margem
      FROM analytics.dim_operacao_weddings d
      LEFT JOIN vendas_op         v  ON v.operacao  = d.operacao
      LEFT JOIN subsetor_op       sp ON sp.operacao = d.operacao
      LEFT JOIN tipo_contrato_cte tc ON tc.operacao = d.operacao
      LEFT JOIN passageiros_cte   pc ON pc.operacao = d.operacao
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
               'tipo_contrato',     d_tipo_contrato,
               'passageiros_raw',   d_passageiros,
               'convidados',        public.contar_convidados_operacao(d_operacao),
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
