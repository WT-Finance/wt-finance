-- ---------------------------------------------------------------------------
-- 0195 — feat(financeiro): get_fluxo_cobertura — Runway de Caixa em meses (v5.2.0, checkpoint)
--
-- DECLARAÇÃO (regime aditivo): esta migration é ADITIVA/retrocompatível com a main viva —
--   • CREATE FUNCTION nova (get_fluxo_cobertura), nenhum objeto existente alterado/removido;
--   • não escreve em dado pré-existente (função STABLE, só SELECT).
--
-- Alimenta o card "Runway de Caixa" (acima do Horizonte Previsto): devolve o NUMERADOR
-- (recebíveis em aberto) e a SÉRIE mensal do denominador (saídas realizadas por mês
-- FECHADO); a estatística (média, IC 95% via t de Student, fator de antecipação 4%)
-- é calculada no app (src/lib/fluxo/cobertura.ts, testada em unit).
--
--   • recebiveis      = Σ previsto de ENTRADA (valor > 0), dentro do corte (NOT pos_corte),
--                       INCLUINDO vencidos (título em aberto é dinheiro esperado).
--   • saidas_mensais  = [{mes:'YYYY-MM', s}] com s = Σ(−valor) das saídas REALIZADAS
--                       (tipo='realizado', valor < 0) por mês de movimentação, só meses
--                       FECHADOS (mês < mês-corrente em SP), últimos 12 presentes.
--                       Mês parcial fica FORA (viesaria a média para baixo). Limite
--                       inferior defensivo de 14 meses (achado MÉDIO do revisor-db):
--                       janela recente por construção, sem scan crescente com o histórico.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_fluxo_cobertura()
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_rec   numeric;
  v_meses json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva']);

  SELECT COALESCE(SUM(valor), 0) INTO v_rec
  FROM financeiro.fato_fluxo
  WHERE tipo = 'previsto' AND NOT pos_corte AND valor > 0;

  SELECT json_agg(row_to_json(t) ORDER BY t.mes) INTO v_meses
  FROM (
    SELECT to_char(date_trunc('month', data_movimentacao), 'YYYY-MM') AS mes,
           round(SUM(-valor), 2) AS s
    FROM financeiro.fato_fluxo
    WHERE tipo = 'realizado' AND valor < 0
      AND data_movimentacao <  date_trunc('month', v_hoje)::date
      AND data_movimentacao >= (date_trunc('month', v_hoje) - INTERVAL '14 months')::date
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 12
  ) t;

  RETURN json_build_object(
    'recebiveis',     round(v_rec, 2),
    'saidas_mensais', COALESCE(v_meses, '[]'::json)
  );
END $function$;

REVOKE EXECUTE ON FUNCTION public.get_fluxo_cobertura() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_cobertura() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
