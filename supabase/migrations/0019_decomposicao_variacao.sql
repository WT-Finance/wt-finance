-- V3-4: Decomposição de variação de faturamento por setor.
-- Compara período atual vs anterior e calcula quanto cada setor contribuiu.

CREATE OR REPLACE FUNCTION public.get_decomposicao_variacao(
  p_from     date,
  p_to       date,
  p_ant_from date,
  p_ant_to   date,
  p_setor    text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  atual AS (
    SELECT
      dsm.id, dsm.nome, dsm.display_nome, dsm.cor_hex, dsm.ordem,
      COALESCE(SUM(vd.valor_total), 0) AS fat
    FROM analytics.dim_setor_macro dsm
    LEFT JOIN analytics.mv_vendas_diarias vd
      ON vd.setor_macro_id = dsm.id
     AND vd.data_venda BETWEEN p_from AND p_to
    WHERE p_setor = 'todos' OR dsm.nome = p_setor
    GROUP BY dsm.id, dsm.nome, dsm.display_nome, dsm.cor_hex, dsm.ordem
  ),
  anterior AS (
    SELECT
      dsm.id,
      COALESCE(SUM(vd.valor_total), 0) AS fat
    FROM analytics.dim_setor_macro dsm
    LEFT JOIN analytics.mv_vendas_diarias vd
      ON vd.setor_macro_id = dsm.id
     AND vd.data_venda BETWEEN p_ant_from AND p_ant_to
    WHERE p_setor = 'todos' OR dsm.nome = p_setor
    GROUP BY dsm.id
  ),
  combined AS (
    SELECT
      a.id, a.nome, a.display_nome, a.cor_hex, a.ordem,
      a.fat                        AS atual,
      COALESCE(ant.fat, 0)         AS anterior,
      a.fat - COALESCE(ant.fat, 0) AS variacao
    FROM atual a
    LEFT JOIN anterior ant ON ant.id = a.id
  ),
  totals AS (
    SELECT
      SUM(atual)    AS fat_total,
      SUM(anterior) AS ant_total,
      SUM(variacao) AS variacao_total
    FROM combined
  )
  SELECT jsonb_build_object(
    'variacao_total',     t.variacao_total,
    'variacao_total_pct', CASE WHEN t.ant_total > 0
                            THEN ROUND(((t.variacao_total / t.ant_total) * 100)::numeric, 1)
                            ELSE NULL END,
    'tem_dados_anterior', t.ant_total > 0,
    'periodo_atual',    jsonb_build_object(
                          'from', to_char(p_from,     'YYYY-MM-DD'),
                          'to',   to_char(p_to,       'YYYY-MM-DD')),
    'periodo_anterior', jsonb_build_object(
                          'from', to_char(p_ant_from, 'YYYY-MM-DD'),
                          'to',   to_char(p_ant_to,   'YYYY-MM-DD')),
    'setores', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'nome',             c.nome,
          'display_nome',     c.display_nome,
          'cor_hex',          c.cor_hex,
          'atual',            c.atual,
          'anterior',         c.anterior,
          'variacao',         c.variacao,
          'variacao_pct',     CASE WHEN c.anterior > 0
                                THEN ROUND(((c.variacao / c.anterior) * 100)::numeric, 1)
                                ELSE NULL END,
          'contribuicao_pct', CASE WHEN ABS(t.variacao_total) > 0
                                THEN ROUND(((c.variacao / t.variacao_total) * 100)::numeric, 1)
                                ELSE NULL END
        )
        ORDER BY ABS(c.variacao) DESC
      )
      FROM combined c
    )
  )
  INTO v_result
  FROM totals t;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_decomposicao_variacao(date, date, date, date, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_decomposicao_variacao(date, date, date, date, text)
  TO anon, authenticated, service_role;
