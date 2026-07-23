-- ---------------------------------------------------------------------------
-- 0193 — fix(financeiro): get_fluxo_runway_semanal — coluna t.idx no ORDER BY (v5.2.0/M4)
--
-- ADITIVA (CREATE OR REPLACE de função nova da 0190). Bug pego pelo teste de contrato
-- (rpc-contrato.test.ts, chamada viva via service role): `json_agg(row_to_json(t) ORDER BY
-- t.idx)` referenciava `t.idx`, mas o subselect `t` não projetava `idx` (só ini/fim/rec/pag/
-- liq/acc) → HTTP 400 `42703 column t.idx does not exist` em toda chamada. Correção: projetar
-- `idx` no subselect (chave extra inofensiva — o schema Zod é `.passthrough()` e o componente
-- ignora). Resto idêntico à 0190 (vencidos parqueados; acc = saldo op + Σ liq).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_fluxo_runway_semanal()
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_saldo_op numeric;
  v_semanas  json;
  v_ini      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva']);
  SELECT COALESCE(SUM(saldo),0) INTO v_saldo_op
  FROM analytics.gerencial_saldos
  WHERE ativo = true AND COALESCE(papel,'') <> 'reserva';

  -- 13 semanas A PARTIR DE HOJE (futuro). Vencidos (venc < hoje) ficam FORA por decisão de
  -- produto (seção "vencidos em aberto" PARQUEADA no mockup v5). get_fluxo_horizonte inclui o vencido do ano.
  WITH sem AS (
    SELECT gs AS wk_ini, (gs + INTERVAL '6 days')::date AS wk_fim, s AS idx
    FROM generate_series(0, 12) s,
         LATERAL (SELECT (v_ini + (s * INTERVAL '7 days'))::date AS gs) g
  ),
  agg AS (
    SELECT s.idx, s.wk_ini, s.wk_fim,
      COALESCE(SUM(f.valor) FILTER (WHERE f.valor>0),0) AS rec,
      COALESCE(SUM(f.valor) FILTER (WHERE f.valor<0),0) AS pag
    FROM sem s
    LEFT JOIN financeiro.fato_fluxo f
      ON f.tipo='previsto' AND NOT f.pos_corte
     AND f.vencimento BETWEEN s.wk_ini AND s.wk_fim
    GROUP BY s.idx, s.wk_ini, s.wk_fim
  )
  SELECT json_agg(row_to_json(t) ORDER BY t.idx) INTO v_semanas
  FROM (
    SELECT
      idx,
      to_char(wk_ini,'DD/MM') AS ini, to_char(wk_fim,'DD/MM') AS fim,
      round(rec,2) AS rec, round(pag,2) AS pag, round(rec+pag,2) AS liq,
      round(v_saldo_op + SUM(rec+pag) OVER (ORDER BY idx),2) AS acc
    FROM agg
  ) t;

  RETURN json_build_object('saldo_operacional', round(v_saldo_op,2), 'semanas', COALESCE(v_semanas,'[]'::json));
END $function$;

NOTIFY pgrst, 'reload schema';
