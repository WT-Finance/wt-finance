-- ---------------------------------------------------------------------------
-- 0151 — v4.22.1: "hoje" da projeção diária no fuso de São Paulo (não UTC).
--
-- BUG: a sessão do banco é UTC, então `CURRENT_DATE` vira o dia seguinte já às
-- 21h de São Paulo (UTC−3). A projeção começava em "amanhã" e o seletor de data
-- inicial (v4.22.1) herdava esse "hoje" errado. Correção: derivar a data corrente
-- de America/Sao_Paulo — `(now() AT TIME ZONE 'America/Sao_Paulo')::date`.
--
-- DECLARAÇÃO: ADITIVA / retrocompatível. Apenas CREATE OR REPLACE da RPC de leitura
-- (troca a derivação de "hoje"); sem DDL de tabela, sem escrita em dado, sem mudança
-- de assinatura. Privilégios preservados no REPLACE; re-GRANT explícito por convenção.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_gerencial_projecao_diaria(p_dias INT DEFAULT 90)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  -- "Hoje" no fuso de São Paulo (a sessão do banco é UTC).
  v_hoje DATE := (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN (
    WITH dias AS (
      SELECT generate_series(v_hoje, v_hoje + (p_dias || ' days')::INTERVAL, INTERVAL '1 day')::DATE AS data
    ),
    agregado AS (
      SELECT d.data,
        COALESCE(SUM(CASE WHEN g.tipo = 'A receber' THEN g.valor_final ELSE 0 END), 0) AS a_receber,
        COALESCE(SUM(CASE WHEN g.tipo = 'A pagar'   THEN g.valor_final ELSE 0 END), 0) AS a_pagar
      FROM dias d
      LEFT JOIN analytics.gerencial_lancamentos g ON g.vencimento = d.data
      GROUP BY d.data
    )
    SELECT json_agg(json_build_object(
      'data', to_char(data, 'YYYY-MM-DD'), 'a_receber', a_receber, 'a_pagar', a_pagar, 'resultado', a_receber - a_pagar
    ) ORDER BY data) FROM agregado
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_gerencial_projecao_diaria(INT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_projecao_diaria(INT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
