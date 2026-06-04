-- ---------------------------------------------------------------------------
-- 0113 — fix(v4.9.2): Faturamento/Receita/Contrato/Subsetor das RPCs via Operação Própria
--
-- ⚠️ Backend-only (Operação Própria já ingerida). CREATE OR REPLACE preserva GRANTs.
--
-- A Lista (get_operacoes_weddings) e o drawer (get_operacao_weddings) calculavam
-- faturamento/receita, subsetor e tipo_contrato por conta própria via venda_n
-- (NÃO liam da dim) — logo a 0112 não corrigia a coluna Faturamento visível. Aqui
-- re-baseamos esses cálculos em operacao_propria (a base Vendas), conforme a
-- definição de fontes do usuário: Faturamento/Contrato/Hotel/Conv./Datas ← Vendas;
-- Resultado Previsto ← Lançamentos; Margem = Resultado Previsto ÷ Faturamento.
-- Remove a contaminação por venda_n (ex.: Darlene exibia o faturamento da Daniella).
-- ADR-0101/0102.
--
-- Trocas: get_operacoes_weddings {vendas_op, subsetor_op, tipo_contrato_cte};
--         get_operacao_weddings {v_faturamento/receita, decomposição subsetor, tipo_contrato}.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_operacoes_weddings(p_status text DEFAULT 'todos'::text, p_periodo_inicio date DEFAULT NULL::date, p_periodo_fim date DEFAULT NULL::date, p_subsetor text DEFAULT 'todos'::text, p_busca text DEFAULT NULL::text, p_ordenar_por text DEFAULT 'data_evento'::text, p_direcao text DEFAULT 'desc'::text, p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_offset     int := (GREATEST(p_pagina, 1) - 1) * LEAST(GREATEST(p_por_pagina, 1), 200);
  v_limit      int := LEAST(GREATEST(p_por_pagina, 1), 200);
  v_order_col  text;
  v_order_dir  text;
  v_operacoes  jsonb;
  v_sql        text;
BEGIN
  v_order_col := CASE p_ordenar_por
    WHEN 'nome_casal'    THEN 'd_nome_casal'
    WHEN 'hotel'         THEN 'd_hotel'
    WHEN 'faturamento'   THEN 'v_faturamento'
    WHEN 'receita'       THEN 'v_receita'
    WHEN 'margem'        THEN 'v_margem'
    WHEN 'custos'        THEN 'd_custos_internos'
    WHEN 'resultado'     THEN 'd_resultado_caixa'
    WHEN 'ml'            THEN 'd_margem_liquida'
    WHEN 'duracao'       THEN 'd_duracao'
    WHEN 'tipo_contrato' THEN 'd_tipo_contrato'
    WHEN 'convidados'    THEN 'd_convidados'
    ELSE 'd_data_evento'
  END;
  v_order_dir := CASE WHEN lower(p_direcao) = 'asc' THEN 'ASC' ELSE 'DESC' END;

  v_sql := $q$
    WITH vendas_op AS (
      -- v4.9.2: faturamento/receita por operacao_propria (Vendas), não venda_n.
      SELECT
        r.operacao_propria AS operacao,
        COALESCE(SUM(r.valor_total), 0) AS faturamento,
        COALESCE(SUM(r.receitas),    0) AS receita
      FROM raw.vendas_excel r
      WHERE r.operacao_propria IS NOT NULL AND r.operacao_propria <> ''
      GROUP BY r.operacao_propria
    ),
    subsetor_op AS (
      -- v4.9.2: subsetor predominante por operacao_propria (Vendas).
      SELECT DISTINCT ON (r.operacao_propria)
        r.operacao_propria AS operacao,
        COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO') AS subsetor_predominante
      FROM raw.vendas_excel r
      LEFT JOIN analytics.dim_produto_subsetor dps
             ON dps.produto_normalizado = UPPER(TRIM(r.produto))
      WHERE r.operacao_propria IS NOT NULL AND r.operacao_propria <> ''
      ORDER BY r.operacao_propria,
               SUM(COALESCE(r.valor_total, 0)) OVER (
                 PARTITION BY r.operacao_propria, COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO')
               ) DESC
    ),
    tipo_contrato_cte AS (
      -- v4.9.2: tipo de contrato da linha 'Contrato de casamento' por operacao_propria.
      SELECT DISTINCT ON (v.operacao_propria)
        v.operacao_propria AS operacao,
        v.tipo_contrato
      FROM raw.vendas_excel v
      WHERE v.produto = 'Contrato de casamento'
        AND v.operacao_propria IS NOT NULL AND v.operacao_propria <> ''
      ORDER BY v.operacao_propria, v.data_venda DESC
    ),
    base AS (
      SELECT
        d.operacao                                      AS d_operacao,
        d.nome_casal                                    AS d_nome_casal,
        d.data_evento                                   AS d_data_evento,
        d.situacao                                      AS d_situacao,
        d.entradas_total                                AS d_entradas_total,
        d.saidas_total                                  AS d_saidas_total,
        d.resultado_caixa                               AS d_resultado_caixa,
        d.ncg                                           AS d_ncg,
        d.hotel                                         AS d_hotel,
        d.data_venda_contrato                           AS d_data_venda_contrato,
        tc.tipo_contrato                                AS d_tipo_contrato,
        (d.data_evento - d.data_venda_contrato)         AS d_duracao,
        public.contar_convidados_operacao(d.operacao)   AS d_convidados,
        COALESCE(v.faturamento, 0)                      AS v_faturamento,
        COALESCE(v.receita, 0)                          AS v_receita,
        CASE WHEN COALESCE(v.faturamento, 0) > 0
          THEN ROUND(v.receita / v.faturamento * 100, 1)
          ELSE 0 END                                    AS v_margem,
        -- sem GREATEST: permite negativo para sinalizar anomalia
        -- Rec. Bruta − Custos = Rec. Líq. sempre
        COALESCE(v.receita, 0) - COALESCE(d.resultado_caixa, 0)
                                                        AS d_custos_internos,
        CASE WHEN COALESCE(v.faturamento, 0) > 0
          THEN ROUND(COALESCE(d.resultado_caixa, 0) / v.faturamento * 100, 1)
          ELSE 0 END                                    AS d_margem_liquida
      FROM analytics.dim_operacao_weddings d
      LEFT JOIN vendas_op         v  ON v.operacao  = d.operacao
      LEFT JOIN subsetor_op       sp ON sp.operacao = d.operacao
      LEFT JOIN tipo_contrato_cte tc ON tc.operacao = d.operacao
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
               'operacao',             d_operacao,
               'nome_casal',           d_nome_casal,
               'data_evento',          d_data_evento,
               'situacao',             d_situacao,
               'faturamento',          v_faturamento,
               'receita',              v_receita,
               'margem_pct',           v_margem,
               'entradas_total',       d_entradas_total,
               'saidas_total',         d_saidas_total,
               'resultado_caixa',      d_resultado_caixa,
               'ncg',                  d_ncg,
               'hotel',                d_hotel,
               'custos_internos',      d_custos_internos,
               'margem_liquida_pct',   d_margem_liquida,
               'data_venda_contrato',  to_char(d_data_venda_contrato, 'YYYY-MM-DD'),
               'tipo_contrato',        d_tipo_contrato,
               'convidados',           d_convidados,
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
END $function$;

CREATE OR REPLACE FUNCTION public.get_operacao_weddings(p_operacao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dim           analytics.dim_operacao_weddings%ROWTYPE;
  v_situacao      text;
  v_faturamento   numeric;
  v_receita       numeric;
  v_tipo_contrato text;
  v_convidados    integer;
  v_decomp        jsonb;
  v_acumulado     jsonb;
BEGIN
  SELECT * INTO v_dim FROM analytics.dim_operacao_weddings WHERE operacao = p_operacao;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Operação não encontrada'); END IF;

  v_situacao := analytics.situacao_por_data_evento(v_dim.data_evento);

  -- Faturamento / Receita totais da operação (vendas distintas vinculadas)
  SELECT COALESCE(SUM(valor_total), 0), COALESCE(SUM(receitas), 0)
  INTO v_faturamento, v_receita
  FROM raw.vendas_excel
  WHERE operacao_propria = p_operacao AND operacao_propria <> '';

  -- Tipo de contrato: última venda com contrato=TRUE da operação
  -- (mesma lógica do tipo_contrato_cte de get_operacoes_weddings).
  SELECT v.tipo_contrato
  INTO v_tipo_contrato
  FROM raw.vendas_excel v
  WHERE v.operacao_propria = p_operacao
    AND v.produto = 'Contrato de casamento'
  ORDER BY v.data_venda DESC
  LIMIT 1;

  -- Convidados (mesma função usada na Lista de Operações).
  v_convidados := public.contar_convidados_operacao(p_operacao);

  -- decomposicao_subsetor no formato SumarioSubsetorItem
  -- (faturamento, receita, margem_pct, pct_faturamento) + NÃO_CLASSIFICADO sempre.
  SELECT jsonb_agg(
           jsonb_build_object(
             'subsetor',        sub.subsetor,
             'faturamento',     sub.faturamento,
             'receita',         sub.receita,
             'margem_pct',      CASE WHEN sub.faturamento > 0
                                  THEN ROUND(sub.receita / sub.faturamento * 100, 1)
                                  ELSE 0 END,
             'pct_faturamento', CASE WHEN sub.total_faturamento > 0
                                  THEN ROUND(sub.faturamento / sub.total_faturamento * 100, 1)
                                  ELSE 0 END
           )
           ORDER BY sub.faturamento DESC
         )
  INTO v_decomp
  FROM (
    SELECT
      COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO')               AS subsetor,
      COALESCE(SUM(r.valor_total), 0)                          AS faturamento,
      COALESCE(SUM(r.receitas), 0)                             AS receita,
      SUM(COALESCE(SUM(r.valor_total), 0)) OVER ()             AS total_faturamento
    FROM raw.vendas_excel r
    LEFT JOIN analytics.dim_produto_subsetor dps
           ON dps.produto_normalizado = UPPER(TRIM(r.produto))
    WHERE r.operacao_propria = p_operacao AND r.operacao_propria <> ''
    GROUP BY COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO')
  ) sub;

  -- acumulado_mensal: curva CONTÍNUA, ENTRADAS e SAÍDAS separadas.
  --   • Efetivo  → só lançamentos LIQUIDADOS, agregados por mês de liquidacao_dt;
  --                NULL nos meses futuros (> mês atual).
  --   • Projetado→ por mês de COALESCE(liquidacao_dt, vencimento_dt) (inclui futuro).
  --   • Acumulados (running sum) sobre a série contínua de meses (generate_series
  --     do min..max observado).
  SELECT jsonb_agg(
           jsonb_build_object(
             'mes',               TO_CHAR(s.mes, 'YYYY-MM'),
             'entrada_efetiva',   CASE WHEN s.mes > DATE_TRUNC('month', CURRENT_DATE)
                                       THEN NULL ELSE s.entrada_efetiva END,
             'entrada_projetada', s.entrada_projetada,
             'saida_efetiva',     CASE WHEN s.mes > DATE_TRUNC('month', CURRENT_DATE)
                                       THEN NULL ELSE s.saida_efetiva END,
             'saida_projetada',   s.saida_projetada,
             'eh_futuro',         s.mes > DATE_TRUNC('month', CURRENT_DATE)
           )
           ORDER BY s.mes
         )
  INTO v_acumulado
  FROM (
    SELECT
      gs.mes,
      SUM(COALESCE(pe.entrada_efetiva,   0)) OVER (ORDER BY gs.mes) AS entrada_efetiva,
      SUM(COALESCE(pp.entrada_projetada, 0)) OVER (ORDER BY gs.mes) AS entrada_projetada,
      SUM(COALESCE(pe.saida_efetiva,     0)) OVER (ORDER BY gs.mes) AS saida_efetiva,
      SUM(COALESCE(pp.saida_projetada,   0)) OVER (ORDER BY gs.mes) AS saida_projetada
    FROM (
      SELECT generate_series(r.mes_min, r.mes_max, INTERVAL '1 month')::date AS mes
      FROM (
        SELECT
          DATE_TRUNC('month', MIN(COALESCE(liquidacao_dt, vencimento_dt)))::date AS mes_min,
          DATE_TRUNC('month', MAX(COALESCE(liquidacao_dt, vencimento_dt)))::date AS mes_max
        FROM analytics.fato_lancamento_operacao
        WHERE operacao = p_operacao
          AND COALESCE(liquidacao_dt, vencimento_dt) IS NOT NULL
      ) r
      WHERE r.mes_min IS NOT NULL
    ) gs
    LEFT JOIN (
      -- EFETIVO por mês de liquidação (só liquidados), entradas e saídas separadas
      SELECT
        DATE_TRUNC('month', liquidacao_dt)::date AS mes,
        SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE 0 END) AS entrada_efetiva,
        SUM(CASE WHEN tipo = 'Saída'   THEN valor ELSE 0 END) AS saida_efetiva
      FROM analytics.fato_lancamento_operacao
      WHERE operacao = p_operacao AND liquidacao_dt IS NOT NULL
      GROUP BY DATE_TRUNC('month', liquidacao_dt)::date
    ) pe ON pe.mes = gs.mes
    LEFT JOIN (
      -- PROJETADO por mês de COALESCE(liquidacao, vencimento), entradas e saídas separadas
      SELECT
        DATE_TRUNC('month', COALESCE(liquidacao_dt, vencimento_dt))::date AS mes,
        SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE 0 END) AS entrada_projetada,
        SUM(CASE WHEN tipo = 'Saída'   THEN valor ELSE 0 END) AS saida_projetada
      FROM analytics.fato_lancamento_operacao
      WHERE operacao = p_operacao
        AND COALESCE(liquidacao_dt, vencimento_dt) IS NOT NULL
      GROUP BY DATE_TRUNC('month', COALESCE(liquidacao_dt, vencimento_dt))::date
    ) pp ON pp.mes = gs.mes
  ) s;

  RETURN jsonb_build_object(
    'operacao',            v_dim.operacao,
    'nome_casal',          v_dim.nome_casal,
    'data_evento',         v_dim.data_evento,
    'situacao',            v_situacao,
    'hotel',               v_dim.hotel,
    'tipo_contrato',       v_tipo_contrato,
    'convidados',          v_convidados,
    'data_venda_contrato', TO_CHAR(v_dim.data_venda_contrato, 'YYYY-MM-DD'),
    'visao_financeira', jsonb_build_object(
      'faturamento',        v_faturamento,
      'receita_bruta',      v_receita,
      'margem_pct',         CASE WHEN v_faturamento > 0
                              THEN ROUND(v_receita / v_faturamento * 100, 1) ELSE 0 END,
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
                              THEN ROUND(v_dim.resultado_caixa / v_dim.entradas_total * 100, 1) ELSE 0 END,
      'ncg',                v_dim.ncg
    ),
    'decomposicao_subsetor', COALESCE(v_decomp, '[]'::jsonb),
    'acumulado_mensal',      COALESCE(v_acumulado, '[]'::jsonb)
  );
END $function$;
