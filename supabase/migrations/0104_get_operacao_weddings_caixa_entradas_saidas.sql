-- ---------------------------------------------------------------------------
-- 0104 — fix(v4.8.1/A5): Caixa Acumulado do drawer com ENTRADAS e SAÍDAS separadas
--
-- CREATE OR REPLACE de public.get_operacao_weddings(p_operacao) baseada na 0103.
-- ÚNICA mudança: o bloco `acumulado_mensal`. Em vez de um saldo líquido único
-- (saldo_efetivo / saldo_projetado), passa a retornar por mês quatro acumulados:
--
--   • entrada_efetiva   = running sum de SUM(valor WHERE tipo='Entrada'
--                         AND liquidacao_dt IS NOT NULL), por mês de liquidacao_dt.
--                         NULL nos meses futuros (> mês atual).
--   • entrada_projetada = running sum de SUM(valor WHERE tipo='Entrada'),
--                         por mês de COALESCE(liquidacao_dt, vencimento_dt).
--   • saida_efetiva     = idem para tipo='Saída', só liquidados (por liquidacao_dt).
--                         NULL nos meses futuros.
--   • saida_projetada   = idem para tipo='Saída', por COALESCE(liquidacao_dt, vencimento_dt).
--   • eh_futuro         = mês > mês atual.
--
-- Os acumulados correm sobre a MESMA série CONTÍNUA de meses (generate_series do
-- min..max observado), como na 0103 — sem buracos. Tudo positivo (entradas e
-- saídas separadas; o front plota duas linhas independentes).
--
-- Todos os demais campos do retorno (tipo_contrato, convidados,
-- data_venda_contrato, visao_financeira, decomposicao_subsetor; sem
-- lancamentos_recentes) ficam IDÊNTICOS à 0103.
--
-- É uma RPC por operação (escopo pequeno), leve; cabe em <3s (anon).
-- Mantém SECURITY DEFINER + search_path='' + REVOKE/GRANT idênticos.
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

REVOKE EXECUTE ON FUNCTION public.get_operacao_weddings(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_operacao_weddings(text)
  TO anon, authenticated, service_role;
