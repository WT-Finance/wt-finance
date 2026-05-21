-- 0039 — Filtro de operação em get_acumulado_weddings
-- Adiciona parâmetro p_operacao opcional; cria get_operacoes_lista_weddings

-- 1. Atualizar get_acumulado_weddings para aceitar p_operacao
CREATE OR REPLACE FUNCTION public.get_acumulado_weddings(
  p_meses_passados int     DEFAULT 24,
  p_meses_futuros  int     DEFAULT 18,
  p_operacao       text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.get_acumulado_weddings(int, int, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_acumulado_weddings(int, int, text)
  TO anon, authenticated, service_role;

-- 2. get_operacoes_lista_weddings — lista de operações para o dropdown
CREATE OR REPLACE FUNCTION public.get_operacoes_lista_weddings()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'operacao', operacao,
        'label',    operacao || ' - ' || nome_casal || ' - ' ||
                    to_char(data_evento, 'DD/MM/YYYY')
      )
      ORDER BY data_evento ASC NULLS LAST
    ),
    '[]'::jsonb
  )
  FROM analytics.dim_operacao_weddings
  WHERE data_evento IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_operacoes_lista_weddings() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_operacoes_lista_weddings()
  TO anon, authenticated, service_role;
