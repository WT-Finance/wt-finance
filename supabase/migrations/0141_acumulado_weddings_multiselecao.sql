-- ---------------------------------------------------------------------------
-- 0141 — feat(v4.19.0/M5): multi-seleção de operações em get_acumulado_weddings.
--
-- O 3º parâmetro muda de `text` (uma operação) para `text[]` (p_operacoes,
-- N operações). O predicado de filtro
--   (p_operacao IS NULL OR operacao = p_operacao)
-- passa a
--   (p_operacoes IS NULL OR operacao = ANY(p_operacoes))
-- nos 3 pontos do corpo (série mensal + total_a_receber + total_a_pagar).
--
-- ⚠️ LEVEMENTE DESTRUTIVA: o TIPO do parâmetro muda → não dá para CREATE OR
-- REPLACE (PostgreSQL não permite trocar o tipo de um argumento). É preciso
-- DROP+CREATE da assinatura 3-arg, tanto no __nucleo quanto no wrapper público
-- (ADR-0109). REQUER CONFIRMAÇÃO HUMANA antes do db push (ADR-0116).
--
-- Reversibilidade: a assinatura anterior (integer, integer, text) é reproduzível
-- a partir de 0106 (corpo) + 0121 (wrapper). Consumidor único verificado:
-- src/components/performance/weddings-content.tsx (getServerClient → authenticated).
-- A sobrecarga 2-arg (integer, integer) NÃO é tocada.
-- Retorno (shape JSON) INALTERADO — sem mudança de Zod/parseRpc.
-- GRANT alinhado à política ATUAL: anon foi revogado em 0133/M1 — o wrapper
-- nasce SÓ para authenticated, service_role (NUNCA anon; não reabrir a janela).
-- ---------------------------------------------------------------------------

-- 1) DROP na ordem segura: wrapper (depende do núcleo) antes do núcleo.
DROP FUNCTION IF EXISTS public.get_acumulado_weddings(integer, integer, text);
DROP FUNCTION IF EXISTS public.get_acumulado_weddings__nucleo(integer, integer, text);

-- 2) Recria o __nucleo com p_operacoes text[] (3 predicados → ANY).
CREATE FUNCTION public.get_acumulado_weddings__nucleo(
  p_meses_passados integer DEFAULT 24,
  p_meses_futuros  integer DEFAULT 18,
  p_operacoes      text[]  DEFAULT NULL::text[]
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
      AND (p_operacoes IS NULL OR operacao = ANY(p_operacoes))
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
    -- v4.9/M5: totais de pendentes, SEM recorte de data (só filtro p_operacoes).
    'total_a_receber', (
      SELECT COALESCE(SUM(valor), 0)
      FROM analytics.fato_lancamento_operacao
      WHERE status = 'A Receber Futuro'
        AND (p_operacoes IS NULL OR operacao = ANY(p_operacoes))
    ),
    'total_a_pagar', (
      SELECT COALESCE(SUM(valor), 0)
      FROM analytics.fato_lancamento_operacao
      WHERE status = 'A Pagar Futuro'
        AND (p_operacoes IS NULL OR operacao = ANY(p_operacoes))
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

-- __nucleo é service_role-only (mesmo regime da 0121).
REVOKE EXECUTE ON FUNCTION public.get_acumulado_weddings__nucleo(integer, integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_acumulado_weddings__nucleo(integer, integer, text[]) TO service_role;

-- 3) Recria o wrapper público com p_operacoes text[] (exigir_acesso + delega).
CREATE FUNCTION public.get_acumulado_weddings(
  p_meses_passados integer DEFAULT 24,
  p_meses_futuros  integer DEFAULT 18,
  p_operacoes      text[]  DEFAULT NULL::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);
  RETURN public.get_acumulado_weddings__nucleo(p_meses_passados, p_meses_futuros, p_operacoes);
END;
$$;

-- GRANT alinhado à política ATUAL (anon revogado em 0133/M1): NUNCA anon.
REVOKE EXECUTE ON FUNCTION public.get_acumulado_weddings(integer, integer, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_acumulado_weddings(integer, integer, text[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
