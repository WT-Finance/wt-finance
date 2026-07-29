-- ---------------------------------------------------------------------------
-- 0191 — fix(financeiro): horizonte "resto do ano" = FUTURO (parqueia vencidos) (v5.2.0/M4)
--
-- ADITIVA (CREATE OR REPLACE de função nova da 0190, mesma sessão). O bucket "Resto de <ano>"
-- do horizonte incluía vencidos-em-aberto do ano corrente (venc <= hoje), divergindo do runway
-- (que já parqueia vencidos) e do dashboard da controladoria (que mostra só o futuro do ano).
-- Correção: "resto do ano" passa a exigir data_competencia > hoje (futuro), consistente com o
-- runway e com o mockup (seção "vencidos em aberto" é PARQUEADA). 2027/2028/pós-2028 inalterados
-- (já são inteiramente futuros). Verificado: resto-2026 futuro ≈ D (delta ~2% = data-base).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_fluxo_horizonte()
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v json;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ano  int  := extract(year from (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva']);
  SELECT json_agg(row_to_json(t) ORDER BY t.ord) INTO v
  FROM (
    -- Resto do ano corrente: previsto FUTURO (venc > hoje), dentro do corte. Vencidos parqueados.
    SELECT 1 AS ord, 'Resto de ' || v_ano || ' (lançado)' AS l,
      COALESCE(SUM(valor),0) AS liq,
      COALESCE(SUM(valor) FILTER (WHERE valor>0),0) AS e,
      COALESCE(SUM(valor) FILTER (WHERE valor<0),0) AS s,
      COUNT(*) AS n
    FROM financeiro.fato_fluxo
    WHERE tipo='previsto' AND NOT pos_corte
      AND extract(year from data_competencia)=v_ano
      AND data_competencia > v_hoje
    UNION ALL
    SELECT 2, extract(year from data_competencia)::text || ' (lançado)',
      COALESCE(SUM(valor),0), COALESCE(SUM(valor) FILTER (WHERE valor>0),0),
      COALESCE(SUM(valor) FILTER (WHERE valor<0),0), COUNT(*)
    FROM financeiro.fato_fluxo
    WHERE tipo='previsto' AND NOT pos_corte AND extract(year from data_competencia) > v_ano
    GROUP BY extract(year from data_competencia)
    UNION ALL
    SELECT 9, 'Pós-2028 · isolado do horizonte',
      COALESCE(SUM(valor),0), COALESCE(SUM(valor) FILTER (WHERE valor>0),0),
      COALESCE(SUM(valor) FILTER (WHERE valor<0),0), COUNT(*)
    FROM financeiro.fato_fluxo
    WHERE tipo='previsto' AND pos_corte
  ) t
  WHERE t.n > 0;
  RETURN COALESCE(v, '[]'::json);
END $function$;

NOTIFY pgrst, 'reload schema';
