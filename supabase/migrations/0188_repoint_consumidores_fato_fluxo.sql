-- ---------------------------------------------------------------------------
-- 0188 — feat(financeiro): repoint dos consumidores para fato_fluxo (v5.2.0/Onda 1, M3)
--
-- ADITIVA / retrocompatível em FORMA com a main viva:
--   • Só CREATE OR REPLACE (VIEW/FUNCTION) — zero DROP/TRUNCATE/ALTER destrutivo, zero
--     escrita em dado pré-existente. Reversível (re-replace).
--   • As views mantêm EXATAMENTE as mesmas colunas de saída → os RPCs que as consomem
--     (get_fluxo_caixa_mensal_v3 / _kpis_b / _acumulado_v1 / _kpis_diario / _posicao_por_conta)
--     seguem funcionando sem alteração — mudam só a FONTE do dado.
--   • Os 5 RPCs que liam tabela direto (decomposição grupo/categoria; calendário /
--     lançamentos-do-dia / próximos) têm o __nucleo reescrito p/ ler fato_fluxo. Os wrappers
--     (com exigir_acesso) NÃO são tocados.
--
-- MUDANÇA SEMÂNTICA (o objetivo da Onda 1): a fonte passa de financeiro.fato_lancamentos
--   (realizado por LIQUIDAÇÃO + previsto por vencimento, com a substituição-fatura da
--   Abordagem B) para financeiro.fato_fluxo (realizado por MOVIMENTAÇÃO, previsto por
--   vencimento, futuras→previsto, corte 2028). Os números da Visão Geral mudam POR DEFINIÇÃO.
--   Abordagem B (ADR-0065) preservada NATURALMENTE: no eixo movimentação, o lançamento de
--   cartão já vem datado na data do MOVIMENTO (data em que a fatura debitou o banco) — some a
--   necessidade da substituição-fatura via titulos (verificado nos dados: as movimentações de
--   conta-cartão se agrupam nas datas de fatura; a reconciliação bate com o dashboard da
--   controladoria, delta ~1% explicado pela data-base).
--
-- Convivência: financeiro.fato_lancamentos, regenerar_financeiro_lancamentos v1 e
--   raw.lancamentos/raw.fluxo_caixa_titulos seguem INTACTOS (só deixam de ser LIDOS por estes
--   consumidores). O DROP deles é destrutiva separada (M3-fim / commit 7), aplicada pelo Yan.
--   pos_corte (>2028) é EXCLUÍDO das séries mensais/KPIs (bloco meta fica p/ o M4/horizonte).
-- ---------------------------------------------------------------------------

-- ============================ VIEWS (mesmas colunas, fonte = fato_fluxo) ====================

-- vw_fluxo_caixa_kpis_b — Abordagem B agora é o próprio eixo movimentação (sem UNION de fatura).
CREATE OR REPLACE VIEW financeiro.vw_fluxo_caixa_kpis_b AS
SELECT
  to_char(f.data_competencia, 'YYYY-MM')                      AS mes,
  (f.tipo = 'realizado')                                      AS is_realizado,
  CASE WHEN f.valor > 0 THEN 'entrada' ELSE 'saida' END       AS tipo_movimento,
  'fato_fluxo'::text                                          AS fonte,
  abs(f.valor)                                                AS valor_unit
FROM financeiro.fato_fluxo f
WHERE NOT f.pos_corte
  AND f.valor <> 0;

-- vw_fluxo_caixa_mensal — realizado/previsto por mês de competência × grupo.
CREATE OR REPLACE VIEW financeiro.vw_fluxo_caixa_mensal AS
SELECT
  date_trunc('month', f.data_competencia)::date               AS mes,
  dc.grupo_categoria,
  f.tipo,
  sum(f.valor)                                                AS valor_total,
  count(*)                                                    AS lancamentos_count
FROM financeiro.fato_fluxo f
JOIN financeiro.dim_categoria dc ON dc.id = f.categoria_id
WHERE NOT f.pos_corte
GROUP BY date_trunc('month', f.data_competencia)::date, dc.grupo_categoria, f.tipo;

-- vw_posicao_por_conta — posição por conta pelo REALIZADO (movimentações efetivadas).
CREATE OR REPLACE VIEW financeiro.vw_posicao_por_conta AS
SELECT
  dcb.conta,
  dcb.tipo                                                    AS tipo_conta,
  sum(f.valor)                                                AS saldo
FROM financeiro.fato_fluxo f
JOIN financeiro.dim_conta_bancaria dcb ON dcb.id = f.conta_bancaria_id
WHERE f.tipo = 'realizado'
GROUP BY dcb.conta, dcb.tipo;

-- vw_proximos_vencimentos — previsto (aging por vencimento).
CREATE OR REPLACE VIEW financeiro.vw_proximos_vencimentos AS
SELECT
  f.id,
  f.numero,
  f.vencimento,
  f.venda_no,
  f.pessoa,
  f.descricao,
  f.valor,
  dc.categoria,
  dc.grupo_categoria,
  dcb.conta,
  dcb.tipo                                                    AS tipo_conta,
  CASE
    WHEN f.vencimento >= CURRENT_DATE                    THEN 'a_vencer'
    WHEN f.vencimento >= (CURRENT_DATE - INTERVAL '30 days') THEN 'vencido_30d'
    WHEN f.vencimento >= (CURRENT_DATE - INTERVAL '90 days') THEN 'vencido_30_90d'
    ELSE 'vencido_90d_mais'
  END                                                         AS aging
FROM financeiro.fato_fluxo f
LEFT JOIN financeiro.dim_categoria      dc  ON dc.id  = f.categoria_id
LEFT JOIN financeiro.dim_conta_bancaria dcb ON dcb.id = f.conta_bancaria_id
WHERE f.tipo = 'previsto' AND f.vencimento IS NOT NULL;

-- vw_decomposicao_grupo — composição por grupo × sinal (competência).
CREATE OR REPLACE VIEW financeiro.vw_decomposicao_grupo AS
SELECT
  date_trunc('month', f.data_competencia)::date               AS mes,
  dc.grupo_categoria,
  CASE WHEN f.valor >= 0 THEN 'entrada' ELSE 'saida' END       AS sinal,
  sum(f.valor)                                                AS valor_total,
  count(*)                                                    AS lancamentos_count
FROM financeiro.fato_fluxo f
JOIN financeiro.dim_categoria dc ON dc.id = f.categoria_id
WHERE NOT f.pos_corte
GROUP BY date_trunc('month', f.data_competencia)::date, dc.grupo_categoria,
         CASE WHEN f.valor >= 0 THEN 'entrada' ELSE 'saida' END;

-- ============================ RPCs (__nucleo) que liam tabela direto ========================

-- Decomposição por grupo — competência (era COALESCE(liquidacao,vencimento) em fato_lancamentos).
CREATE OR REPLACE FUNCTION public.get_decomposicao_grupo__nucleo(p_from text, p_to text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  RETURN (
    SELECT JSON_AGG(row_to_json(t))
    FROM (
      SELECT
        COALESCE(dc.grupo_categoria, 'Sem Grupo')             AS grupo_categoria,
        CASE WHEN f.valor >= 0 THEN 'entrada' ELSE 'saida' END AS sinal,
        ABS(SUM(f.valor))                                     AS valor_total,
        COUNT(*)                                              AS lancamentos_count
      FROM financeiro.fato_fluxo f
      JOIN financeiro.dim_categoria dc ON dc.id = f.categoria_id
      WHERE f.data_competencia BETWEEN p_from::date AND p_to::date
        AND NOT f.pos_corte
      GROUP BY COALESCE(dc.grupo_categoria, 'Sem Grupo'),
               CASE WHEN f.valor >= 0 THEN 'entrada' ELSE 'saida' END
      ORDER BY 2, 3 DESC
    ) t
  );
END $function$;

-- Decomposição por categoria — competência.
CREATE OR REPLACE FUNCTION public.get_decomposicao_categoria__nucleo(p_from text, p_to text, p_grupo text DEFAULT NULL::text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  RETURN (
    SELECT JSON_AGG(row_to_json(t))
    FROM (
      SELECT
        dc.categoria                                         AS categoria,
        COALESCE(dc.grupo_categoria, 'Sem Grupo')            AS grupo_categoria,
        CASE WHEN f.valor >= 0 THEN 'entrada' ELSE 'saida' END AS sinal,
        ABS(SUM(f.valor))                                    AS valor_total,
        COUNT(*)                                             AS lancamentos_count
      FROM financeiro.fato_fluxo f
      JOIN financeiro.dim_categoria dc ON dc.id = f.categoria_id
      WHERE f.data_competencia BETWEEN p_from::date AND p_to::date
        AND NOT f.pos_corte
        AND (p_grupo IS NULL OR COALESCE(dc.grupo_categoria, 'Sem Grupo') = p_grupo)
      GROUP BY dc.categoria, COALESCE(dc.grupo_categoria, 'Sem Grupo'),
               CASE WHEN f.valor >= 0 THEN 'entrada' ELSE 'saida' END
      ORDER BY 2, 3, 4 DESC
    ) t
  );
END $function$;

-- Calendário de Liquidez — fluxo diário por data de competência (realizado por movimentação +
-- previsto por vencimento). Mantém o shape do JSON (dia/entradas/saidas/saldo, grade Dom-Sáb).
CREATE OR REPLACE FUNCTION public.get_calendario_liquidez__nucleo(p_mes_referencia date)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_mes_inicio  DATE := date_trunc('month', p_mes_referencia)::date;
  v_mes_fim     DATE := (date_trunc('month', p_mes_referencia) + INTERVAL '1 month - 1 day')::date;
  v_grid_inicio DATE := v_mes_inicio - (EXTRACT(DOW FROM v_mes_inicio)::int);
  v_grid_fim    DATE := v_mes_fim + (6 - EXTRACT(DOW FROM v_mes_fim)::int);
BEGIN
  RETURN (
    SELECT JSON_AGG(row_to_json(r) ORDER BY r.data)
    FROM (
      SELECT
        d.data::text AS data,
        EXTRACT(DAY FROM d.data)::int AS dia,
        d.data = CURRENT_DATE AS eh_hoje,
        (d.data < v_mes_inicio OR d.data > v_mes_fim) AS fora_do_mes,
        COALESCE(SUM(CASE WHEN f.valor > 0 THEN f.valor ELSE 0 END), 0) AS entradas_dia,
        COALESCE(SUM(CASE WHEN f.valor < 0 THEN -f.valor ELSE 0 END), 0) AS saidas_dia,
        COALESCE(SUM(f.valor), 0) AS saldo_dia
      FROM generate_series(v_grid_inicio, v_grid_fim, '1 day'::interval) AS d(data)
      LEFT JOIN financeiro.fato_fluxo f
        ON f.data_competencia = d.data::date
        AND NOT f.pos_corte
      GROUP BY d.data, v_mes_inicio, v_mes_fim
    ) r
  );
END $function$;

-- Lançamentos do dia — drill do calendário (por data de competência). Preserva os campos do JSON
-- (valor_final, conta_previsao, tipo, status) mapeando do fato_fluxo p/ não quebrar a UI (M3);
-- o M4 reformula o modal.
CREATE OR REPLACE FUNCTION public.get_lancamentos_do_dia__nucleo(p_data date)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  RETURN (
    SELECT JSON_AGG(row_to_json(r) ORDER BY abs(r.valor_final) DESC)
    FROM (
      SELECT
        f.numero,
        f.pessoa,
        f.descricao,
        f.valor                                              AS valor_final,
        dcb.conta                                            AS conta_previsao,
        CASE WHEN f.valor >= 0 THEN 'Entrada' ELSE 'Saída' END AS tipo,
        CASE WHEN f.tipo = 'realizado'
             THEN (CASE WHEN f.valor >= 0 THEN 'Entrada' ELSE 'Saída' END)
             ELSE (CASE WHEN f.valor >= 0 THEN 'A Receber Futuro' ELSE 'A Pagar Futuro' END)
        END                                                  AS status
      FROM financeiro.fato_fluxo f
      LEFT JOIN financeiro.dim_conta_bancaria dcb ON dcb.id = f.conta_bancaria_id
      WHERE f.data_competencia = p_data AND NOT f.pos_corte
      LIMIT 100
    ) r
  );
END $function$;

-- Próximos lançamentos — previsto a vencer nos próximos N dias (fato_fluxo previsto por vencimento).
CREATE OR REPLACE FUNCTION public.get_proximos_lancamentos__nucleo(p_dias integer DEFAULT 10, p_tipo text DEFAULT NULL::text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  RETURN (
    SELECT COALESCE(JSON_AGG(row_to_json(t) ORDER BY t.vencimento ASC, abs(t.valor_final) DESC), '[]'::json)
    FROM (
      SELECT
        f.numero,
        f.vencimento,
        f.pessoa,
        f.descricao,
        f.valor                                              AS valor_final,
        CASE WHEN f.valor >= 0 THEN 'Entrada' ELSE 'Saída' END AS tipo,
        CASE WHEN f.valor >= 0 THEN 'A Receber Futuro' ELSE 'A Pagar Futuro' END AS status,
        (f.vencimento - CURRENT_DATE) AS dias_para_vencer
      FROM financeiro.fato_fluxo f
      WHERE f.tipo = 'previsto'
        AND NOT f.pos_corte
        AND f.vencimento BETWEEN CURRENT_DATE AND (CURRENT_DATE + (p_dias || ' days')::interval)
        AND (p_tipo IS NULL
             OR (p_tipo = 'A Receber Futuro' AND f.valor >= 0)
             OR (p_tipo = 'A Pagar Futuro'   AND f.valor <  0))
      LIMIT 500
    ) t
  );
END $function$;

-- KPIs diários — repoint COMPLETO p/ fato_fluxo (evita fonte mista: saldo já vinha da view
-- repontada, mas a_receber/a_pagar 10d liam raw.fluxo_caixa_titulos direto — quebraria no DROP
-- da base antiga e misturava eixos no mesmo painel). Contrato JSON preservado.
CREATE OR REPLACE FUNCTION public.get_fluxo_caixa_kpis_diario__nucleo()
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_saldo_em_caixa numeric;
  v_a_receber_10d  numeric;
  v_a_pagar_10d    numeric;
BEGIN
  -- Saldo em caixa: contas NÃO-cartão (vw_posicao_por_conta já repontada → fato_fluxo realizado).
  SELECT COALESCE(SUM(saldo), 0)
  INTO v_saldo_em_caixa
  FROM financeiro.vw_posicao_por_conta
  WHERE tipo_conta NOT IN ('cartao_credito');

  -- A receber / a pagar nos próximos 10 dias — PREVISTO por vencimento (fato_fluxo, eixo movimentação).
  -- a_receber = entradas (+); a_pagar = magnitude das saídas (−valor) — mesma semântica positiva do titulos.
  SELECT
    COALESCE(SUM(f.valor)  FILTER (WHERE f.valor > 0), 0),
    COALESCE(SUM(-f.valor) FILTER (WHERE f.valor < 0), 0)
  INTO v_a_receber_10d, v_a_pagar_10d
  FROM financeiro.fato_fluxo f
  WHERE f.tipo = 'previsto'
    AND NOT f.pos_corte
    AND f.vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '10 days';

  RETURN JSON_BUILD_OBJECT(
    'saldo_em_caixa', v_saldo_em_caixa,
    'a_receber_10d',  v_a_receber_10d,
    'a_pagar_10d',    v_a_pagar_10d,
    'ncg_10d',        v_a_receber_10d - v_a_pagar_10d
  );
END $function$;

NOTIFY pgrst, 'reload schema';
