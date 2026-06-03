-- ---------------------------------------------------------------------------
-- 0106 — feat(v4.9/M5): totais não liquidados em get_acumulado_weddings
--
-- O gráfico "Fluxo de Caixa Mensal de Weddings" precisa exibir, no canto, o
-- total de ENTRADAS e SAÍDAS NÃO LIQUIDADAS (status pendente), INDEPENDENTE da
-- data de vencimento. A RPC só retornava total_saidas + a série mensal (que é
-- recortada pela janela de meses). Adiciona dois campos ao retorno:
--   • total_a_receber = SUM(valor) WHERE status = 'A Receber Futuro'
--   • total_a_pagar   = SUM(valor) WHERE status = 'A Pagar Futuro'
-- Ambos como subqueries SEM o filtro de janela de data (só o filtro p_operacao),
-- atendendo ao "independente da data".
--
-- Mudança ADITIVA (campos novos no JSON) — retrocompatível com o front atual.
-- CREATE OR REPLACE preserva os GRANTs existentes. Só a sobrecarga 3-arg
-- (consumida pelo gráfico) é alterada.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_acumulado_weddings(
  p_meses_passados integer DEFAULT 24,
  p_meses_futuros  integer DEFAULT 18,
  p_operacao       text    DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_mes_atual      date := date_trunc('month', CURRENT_DATE)::date;
  v_inicio         date;
  v_fim_exclusivo  date;
  v_result         jsonb;
BEGIN
  p_meses_passados := LEAST(GREATEST(COALESCE(p_meses_passados, 24), 1), 120);
  p_meses_futuros  := LEAST(GREATEST(COALESCE(p_meses_futuros,  18), 0),  60);

  v_inicio        := (v_mes_atual - (p_meses_passados * interval '1 month'))::date;
  v_fim_exclusivo := (v_mes_atual + ((p_meses_futuros + 1) * interval '1 month'))::date;

  WITH meses_serie AS (
    SELECT (v_inicio + (n * interval '1 month'))::date AS mes
    FROM generate_series(0, p_meses_passados + p_meses_futuros) n
  ),
  lancamentos_agrupados AS (
    SELECT
      date_trunc('month', COALESCE(liquidacao_dt, vencimento_dt))::date AS mes,
      COALESCE(SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE 0 END), 0) AS entrada_mes,
      COALESCE(SUM(CASE WHEN tipo = 'Saída'   THEN valor ELSE 0 END), 0) AS saida_mes
    FROM analytics.fato_lancamento_operacao
    WHERE COALESCE(liquidacao_dt, vencimento_dt) >= v_inicio
      AND COALESCE(liquidacao_dt, vencimento_dt) <  v_fim_exclusivo
      AND (p_operacao IS NULL OR operacao = p_operacao)
    GROUP BY 1
  ),
  serie_com_dados AS (
    SELECT
      m.mes,
      COALESCE(l.entrada_mes, 0) AS entrada_mes,
      COALESCE(l.saida_mes,   0) AS saida_mes
    FROM meses_serie m
    LEFT JOIN lancamentos_agrupados l ON l.mes = m.mes
  ),
  cumulativo AS (
    SELECT
      mes,
      saida_mes,
      mes >= v_mes_atual                                          AS eh_futuro,
      ROUND(SUM(entrada_mes) OVER (ORDER BY mes), 2)              AS entrada_acum,
      ROUND(SUM(saida_mes)   OVER (ORDER BY mes), 2)              AS saida_acum
    FROM serie_com_dados
  )
  SELECT jsonb_build_object(
    'total_saidas', ROUND(SUM(saida_mes), 2),
    -- v4.9/M5: totais de pendentes, SEM recorte de data (só filtro p_operacao).
    'total_a_receber', (
      SELECT COALESCE(SUM(valor), 0)
      FROM analytics.fato_lancamento_operacao
      WHERE status = 'A Receber Futuro'
        AND (p_operacao IS NULL OR operacao = p_operacao)
    ),
    'total_a_pagar', (
      SELECT COALESCE(SUM(valor), 0)
      FROM analytics.fato_lancamento_operacao
      WHERE status = 'A Pagar Futuro'
        AND (p_operacao IS NULL OR operacao = p_operacao)
    ),
    'meses', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'mes',          to_char(mes, 'YYYY-MM-DD'),
          'eh_futuro',    eh_futuro,
          'entrada_acum', entrada_acum,
          'saida_acum',   saida_acum
        )
        ORDER BY mes
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM cumulativo;

  RETURN v_result;
END;
$function$;
