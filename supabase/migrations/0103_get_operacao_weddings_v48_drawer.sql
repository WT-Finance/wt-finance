-- ---------------------------------------------------------------------------
-- 0103 — feat(v4.8/M6): redesenho do drawer da Lista de Operações Weddings
--
-- Estende public.get_operacao_weddings(p_operacao) para alimentar o drawer novo:
--   • tipo_contrato        — tipo da última venda com contrato=TRUE da operação
--                            (mesma lógica do tipo_contrato_cte de get_operacoes_weddings).
--   • convidados           — public.contar_convidados_operacao(p_operacao).
--   • data_venda_contrato  — data da venda de contrato (de dim_operacao_weddings),
--                            usada no front para calcular a Duração da operação.
--   • decomposicao_subsetor — agora no MESMO formato de SumarioSubsetorItem
--                             (faturamento, receita, margem_pct, pct_faturamento),
--                             com NÃO_CLASSIFICADO SEMPRE presente, para reusar
--                             <SumarioSubsetorCard/>.
--   • acumulado_mensal     — curva CONTÍNUA de caixa acumulado (Efetivo + Projetado):
--                             {mes, saldo_efetivo, saldo_projetado, eh_futuro}.
--                             saldo_efetivo  = acumulado de (entradas−saídas) só de
--                                              lançamentos LIQUIDADOS (por mês de
--                                              liquidacao_dt), NULL nos meses futuros.
--                             saldo_projetado= acumulado por mês de
--                                              COALESCE(liquidacao_dt, vencimento_dt)
--                                              (inclui agendado futuro).
--                             eh_futuro      = mês > mês atual.
--                             Meses contínuos (generate_series), sem buracos.
--
-- REMOVE do payload o 'lancamentos_recentes' (o drawer não exibe mais o
--   Detalhamento dos Lançamentos nesta versão).
--
-- É uma RPC por operação (escopo pequeno), portanto leve; cabe em <3s (anon).
-- Mantém SECURITY DEFINER + search_path='' + REVOKE/GRANT idênticos aos atuais.
-- ---------------------------------------------------------------------------

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
  SELECT COALESCE(SUM(fvi.valor_total), 0), COALESCE(SUM(fvi.receitas), 0)
  INTO v_faturamento, v_receita
  FROM (
    SELECT DISTINCT venda_n::text AS venda_num
    FROM analytics.fato_lancamento_operacao
    WHERE operacao = p_operacao AND venda_n IS NOT NULL
  ) l
  LEFT JOIN analytics.fato_venda      fv  ON fv.venda_numero = l.venda_num
  LEFT JOIN analytics.fato_venda_item fvi ON fvi.fato_venda_id = fv.id;

  -- Tipo de contrato: última venda com contrato=TRUE da operação
  -- (mesma lógica do tipo_contrato_cte de get_operacoes_weddings).
  SELECT v.tipo_contrato
  INTO v_tipo_contrato
  FROM analytics.fato_lancamento_operacao flo
  JOIN raw.vendas_excel v ON v.venda_numero = flo.venda_n::text AND v.contrato = TRUE
  WHERE flo.operacao = p_operacao
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
      COALESCE(SUM(fvi.valor_total), 0)                        AS faturamento,
      COALESCE(SUM(fvi.receitas), 0)                           AS receita,
      SUM(COALESCE(SUM(fvi.valor_total), 0)) OVER ()           AS total_faturamento
    FROM (
      SELECT DISTINCT venda_n::text AS venda_num
      FROM analytics.fato_lancamento_operacao
      WHERE operacao = p_operacao AND venda_n IS NOT NULL
    ) l
    LEFT JOIN analytics.fato_venda          fv  ON fv.venda_numero = l.venda_num
    LEFT JOIN analytics.fato_venda_item     fvi ON fvi.fato_venda_id = fv.id
    LEFT JOIN analytics.dim_produto         dp  ON dp.id = fvi.produto_id
    LEFT JOIN analytics.dim_produto_subsetor dps
           ON dps.produto_normalizado = UPPER(TRIM(dp.nome))
    GROUP BY COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO')
  ) sub;

  -- acumulado_mensal: curva CONTÍNUA Efetivo + Projetado.
  --   • por_mes: agrega líquido (entradas−saídas) por mês de liquidação (efetivo)
  --     e por mês de COALESCE(liquidacao, vencimento) (projetado).
  --   • serie: gera todos os meses do intervalo (min..max observado) e acumula.
  --   • saldo_efetivo é NULL nos meses futuros (> mês atual) — só realizado.
  SELECT jsonb_agg(
           jsonb_build_object(
             'mes',            TO_CHAR(s.mes, 'YYYY-MM'),
             'saldo_efetivo',  CASE WHEN s.mes > DATE_TRUNC('month', CURRENT_DATE)
                                    THEN NULL ELSE s.saldo_efetivo END,
             'saldo_projetado', s.saldo_projetado,
             'eh_futuro',      s.mes > DATE_TRUNC('month', CURRENT_DATE)
           )
           ORDER BY s.mes
         )
  INTO v_acumulado
  FROM (
    SELECT
      gs.mes,
      SUM(COALESCE(pe.liquido_efetivo, 0))   OVER (ORDER BY gs.mes) AS saldo_efetivo,
      SUM(COALESCE(pp.liquido_projetado, 0)) OVER (ORDER BY gs.mes) AS saldo_projetado
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
      -- líquido EFETIVO por mês de liquidação (só liquidados)
      SELECT
        DATE_TRUNC('month', liquidacao_dt)::date AS mes,
        SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE -valor END) AS liquido_efetivo
      FROM analytics.fato_lancamento_operacao
      WHERE operacao = p_operacao AND liquidacao_dt IS NOT NULL
      GROUP BY DATE_TRUNC('month', liquidacao_dt)::date
    ) pe ON pe.mes = gs.mes
    LEFT JOIN (
      -- líquido PROJETADO por mês de COALESCE(liquidacao, vencimento)
      SELECT
        DATE_TRUNC('month', COALESCE(liquidacao_dt, vencimento_dt))::date AS mes,
        SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE -valor END) AS liquido_projetado
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

REVOKE EXECUTE ON FUNCTION public.get_operacao_weddings(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_operacao_weddings(text)
  TO anon, authenticated, service_role;
