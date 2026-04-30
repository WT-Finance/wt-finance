-- Funções de leitura para a Aba Performance (V2-3).
-- SECURITY DEFINER para acessar analytics sem expor o schema via REST.

-- ---------------------------------------------------------------------------
-- 1. get_tendencia_margem(p_from, p_to, p_setor)
--    Série temporal de margem com granularidade adaptativa:
--    ≤30 dias → diária | 31-90 dias → semanal | ≥91 dias → mensal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tendencia_margem(
  p_from  date,
  p_to    date,
  p_setor text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dias          int := (p_to - p_from) + 1;
  v_granularidade text;
  v_result        jsonb;
BEGIN
  v_granularidade := CASE
    WHEN v_dias <= 30 THEN 'diaria'
    WHEN v_dias <= 90 THEN 'semanal'
    ELSE                   'mensal'
  END;

  IF v_granularidade = 'diaria' THEN
    -- Um ponto por dia
    WITH serie AS (
      SELECT d::date AS data_inicio
      FROM generate_series(p_from, p_to, '1 day'::interval) d
    ),
    vendas AS (
      SELECT
        vd.data_venda,
        SUM(vd.valor_total) AS faturamento,
        SUM(vd.receitas)    AS receita
      FROM analytics.mv_vendas_diarias vd
      JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
      WHERE vd.data_venda BETWEEN p_from AND p_to
        AND (p_setor = 'todos' OR dsm.nome = p_setor)
      GROUP BY vd.data_venda
    )
    SELECT jsonb_build_object(
      'granularidade', 'diaria',
      'pontos', jsonb_agg(
        jsonb_build_object(
          'label',        to_char(s.data_inicio, 'DD/MM'),
          'data_inicio',  to_char(s.data_inicio, 'YYYY-MM-DD'),
          'faturamento',  COALESCE(v.faturamento, 0),
          'receita',      COALESCE(v.receita,    0),
          'margem_pct',   CASE WHEN COALESCE(v.faturamento, 0) > 0
                            THEN ROUND((COALESCE(v.receita, 0) / v.faturamento * 100)::numeric, 2)
                            ELSE NULL END
        )
        ORDER BY s.data_inicio
      )
    )
    INTO v_result
    FROM serie s
    LEFT JOIN vendas v ON v.data_venda = s.data_inicio;

  ELSIF v_granularidade = 'semanal' THEN
    -- Um ponto por semana ISO
    WITH semanas AS (
      SELECT
        date_trunc('week', d)::date AS semana_inicio,
        (date_trunc('week', d) + interval '6 days')::date AS semana_fim
      FROM generate_series(
        date_trunc('week', p_from),
        date_trunc('week', p_to),
        '1 week'::interval
      ) d
      GROUP BY 1, 2
    ),
    vendas AS (
      SELECT
        date_trunc('week', vd.data_venda)::date AS semana_inicio,
        SUM(vd.valor_total) AS faturamento,
        SUM(vd.receitas)    AS receita
      FROM analytics.mv_vendas_diarias vd
      JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
      WHERE vd.data_venda BETWEEN p_from AND p_to
        AND (p_setor = 'todos' OR dsm.nome = p_setor)
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'granularidade', 'semanal',
      'pontos', jsonb_agg(
        jsonb_build_object(
          'label',        'Sem ' || to_char(s.semana_inicio, 'WW'),
          'data_inicio',  to_char(s.semana_inicio, 'YYYY-MM-DD'),
          'faturamento',  COALESCE(v.faturamento, 0),
          'receita',      COALESCE(v.receita,    0),
          'margem_pct',   CASE WHEN COALESCE(v.faturamento, 0) > 0
                            THEN ROUND((COALESCE(v.receita, 0) / v.faturamento * 100)::numeric, 2)
                            ELSE NULL END
        )
        ORDER BY s.semana_inicio
      )
    )
    INTO v_result
    FROM semanas s
    LEFT JOIN vendas v ON v.semana_inicio = s.semana_inicio;

  ELSE
    -- Mensal
    WITH meses AS (
      SELECT
        date_trunc('month', d)::date AS mes_inicio
      FROM generate_series(
        date_trunc('month', p_from),
        date_trunc('month', p_to),
        '1 month'::interval
      ) d
    ),
    vendas AS (
      SELECT
        date_trunc('month', vd.data_venda)::date AS mes_inicio,
        SUM(vd.valor_total) AS faturamento,
        SUM(vd.receitas)    AS receita
      FROM analytics.mv_vendas_diarias vd
      JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
      WHERE vd.data_venda BETWEEN p_from AND p_to
        AND (p_setor = 'todos' OR dsm.nome = p_setor)
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'granularidade', 'mensal',
      'pontos', jsonb_agg(
        jsonb_build_object(
          'label',        to_char(s.mes_inicio, 'Mon/YY'),
          'data_inicio',  to_char(s.mes_inicio, 'YYYY-MM-DD'),
          'faturamento',  COALESCE(v.faturamento, 0),
          'receita',      COALESCE(v.receita,    0),
          'margem_pct',   CASE WHEN COALESCE(v.faturamento, 0) > 0
                            THEN ROUND((COALESCE(v.receita, 0) / v.faturamento * 100)::numeric, 2)
                            ELSE NULL END
        )
        ORDER BY s.mes_inicio
      )
    )
    INTO v_result
    FROM meses s
    LEFT JOIN vendas v ON v.mes_inicio = s.mes_inicio;
  END IF;

  RETURN COALESCE(v_result, jsonb_build_object('granularidade', v_granularidade, 'pontos', '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tendencia_margem(date, date, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_tendencia_margem(date, date, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. get_mix_produto(p_from, p_to, p_setor, p_limite)
--    Top N produtos por faturamento + agregado 'Outros'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mix_produto(
  p_from   date,
  p_to     date,
  p_setor  text DEFAULT 'todos',
  p_limite int  DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fat_total  numeric := 0;
  v_rec_total  numeric := 0;
  v_result     jsonb;
BEGIN
  -- Total do período (para % do total)
  SELECT
    COALESCE(SUM(vd.valor_total), 0),
    COALESCE(SUM(vd.receitas),    0)
  INTO v_fat_total, v_rec_total
  FROM analytics.mv_vendas_diarias vd
  JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
  WHERE vd.data_venda BETWEEN p_from AND p_to
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  WITH por_produto AS (
    SELECT
      dp.nome                             AS produto_nome,
      COALESCE(SUM(fvi.valor_total), 0)   AS faturamento,
      COALESCE(SUM(fvi.receitas),    0)   AS receita,
      ROW_NUMBER() OVER (ORDER BY SUM(fvi.valor_total) DESC NULLS LAST) AS rn
    FROM analytics.fato_venda_item fvi
    JOIN analytics.fato_venda      fv  ON fv.id  = fvi.fato_venda_id
    JOIN analytics.dim_produto     dp  ON dp.id  = fvi.produto_id
    JOIN analytics.dim_setor       ds  ON ds.id  = fvi.setor_id
    JOIN analytics.dim_setor_macro dsm ON dsm.id = ds.setor_macro_id
    WHERE fv.data_venda BETWEEN p_from AND p_to
      AND (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY dp.nome
  ),
  top_n AS (
    SELECT * FROM por_produto WHERE rn <= p_limite
  ),
  outros AS (
    SELECT
      'Outros'                         AS produto_nome,
      COALESCE(SUM(faturamento), 0)    AS faturamento,
      COALESCE(SUM(receita),     0)    AS receita,
      COUNT(*)::int                    AS quantidade_produtos
    FROM por_produto
    WHERE rn > p_limite
  )
  SELECT jsonb_build_object(
    'produtos', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'produto_nome',    t.produto_nome,
          'faturamento',     t.faturamento,
          'receita',         t.receita,
          'margem_pct',      CASE WHEN t.faturamento > 0
                               THEN ROUND((t.receita / t.faturamento * 100)::numeric, 2)
                               ELSE NULL END,
          'pct_faturamento', CASE WHEN v_fat_total > 0
                               THEN ROUND((t.faturamento / v_fat_total * 100)::numeric, 1)
                               ELSE 0 END
        )
        ORDER BY t.rn
      )
      FROM top_n t
    ),
    'outros', (
      SELECT jsonb_build_object(
        'produto_nome',      'Outros',
        'faturamento',       o.faturamento,
        'receita',           o.receita,
        'margem_pct',        CASE WHEN o.faturamento > 0
                               THEN ROUND((o.receita / o.faturamento * 100)::numeric, 2)
                               ELSE NULL END,
        'pct_faturamento',   CASE WHEN v_fat_total > 0
                               THEN ROUND((o.faturamento / v_fat_total * 100)::numeric, 1)
                               ELSE 0 END,
        'quantidade_produtos', o.quantidade_produtos
      )
      FROM outros o
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_mix_produto(date, date, text, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_mix_produto(date, date, text, int) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. get_cagr()
--    CAGR de faturamento e receita entre os anos completos disponíveis.
--    Exclui o ano corrente (incompleto). Retorna 422-equivalent se < 2 anos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cagr()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ano_inicial   int;
  v_ano_final     int;
  v_fat_inicial   numeric;
  v_fat_final     numeric;
  v_rec_inicial   numeric;
  v_rec_final     numeric;
  v_n_anos        numeric;
BEGIN
  -- Anos completos disponíveis (excluindo o ano corrente)
  SELECT MIN(ano), MAX(ano)
  INTO v_ano_inicial, v_ano_final
  FROM (
    SELECT EXTRACT(YEAR FROM data_venda)::int AS ano
    FROM analytics.fato_venda
    GROUP BY 1
    HAVING EXTRACT(YEAR FROM data_venda)::int < EXTRACT(YEAR FROM CURRENT_DATE)::int
  ) anos;

  IF v_ano_inicial IS NULL OR v_ano_inicial = v_ano_final THEN
    RETURN jsonb_build_object(
      'erro', 'Dados insuficientes: necessário pelo menos 2 anos completos para calcular CAGR'
    );
  END IF;

  v_n_anos := v_ano_final - v_ano_inicial;

  SELECT
    COALESCE(SUM(vm.valor_total), 0),
    COALESCE(SUM(vm.receitas),    0)
  INTO v_fat_inicial, v_rec_inicial
  FROM analytics.mv_vendas_mensais vm
  WHERE vm.ano = v_ano_inicial;

  SELECT
    COALESCE(SUM(vm.valor_total), 0),
    COALESCE(SUM(vm.receitas),    0)
  INTO v_fat_final, v_rec_final
  FROM analytics.mv_vendas_mensais vm
  WHERE vm.ano = v_ano_final;

  RETURN jsonb_build_object(
    'ano_inicial',           v_ano_inicial,
    'ano_final',             v_ano_final,
    'faturamento_inicial',   v_fat_inicial,
    'faturamento_final',     v_fat_final,
    'receita_inicial',       v_rec_inicial,
    'receita_final',         v_rec_final,
    'cagr_faturamento_pct',  CASE WHEN v_fat_inicial > 0
                               THEN ROUND(((POWER((v_fat_final / v_fat_inicial)::float, (1.0 / v_n_anos)) - 1) * 100)::numeric, 1)
                               ELSE NULL END,
    'cagr_receita_pct',      CASE WHEN v_rec_inicial > 0
                               THEN ROUND(((POWER((v_rec_final / v_rec_inicial)::float, (1.0 / v_n_anos)) - 1) * 100)::numeric, 1)
                               ELSE NULL END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cagr() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_cagr() TO anon, authenticated, service_role;
