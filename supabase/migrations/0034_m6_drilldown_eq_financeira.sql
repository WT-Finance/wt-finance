-- ---------------------------------------------------------------------------
-- 0034 — M6: Drill-down educativo — expõe hotel, custos_internos e
--            margem_liquida_pct no RPC get_operacao_weddings
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

  -- Decomposição por subsetor
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

  -- Acumulado mensal para gráfico
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

  -- Lançamentos recentes — últimos 10
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
