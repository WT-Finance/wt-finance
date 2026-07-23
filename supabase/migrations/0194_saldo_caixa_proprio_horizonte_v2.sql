-- ---------------------------------------------------------------------------
-- 0194 — feat(financeiro): saldo de caixa PRÓPRIO do Fluxo Projetado + horizonte v2 mensal
--        (v5.2.0 / Onda 1 — ajustes do checkpoint do Yan, pré-merge)
--
-- ADITIVA / retrocompatível:
--   • CREATE TABLE nova (financeiro.saldo_caixa) + seed one-time COPIANDO de
--     analytics.gerencial_saldos (INSERT em tabela NOVA; a gerencial_saldos e a rota
--     /fluxo-caixa/gerencial ficam INTACTAS — a desconexão é só de LEITURA do Projetado).
--   • 2 RPCs novas (get_saldo_caixa / atualizar_saldo_caixa) — RBAC inline.
--   • CREATE OR REPLACE de get_fluxo_runway_semanal (saldo operacional passa a ler a
--     tabela nova) e de get_fluxo_horizonte (v2: 12 meses rolantes + anos consolidados)
--     — ambas funções desta própria versão (v5.2.0, nenhum consumidor externo).
--
-- Decisão do Yan (checkpoint): o "Saldo de Caixa" do Fluxo Projetado deixa de ler os
-- saldos do Fluxo de Caixa Gerencial e passa a ser PREENCHÍVEL no próprio modal de
-- drill (por conta: saldo + data). Reserva (ex.: Clara/XP) segue separada do operacional.
-- ---------------------------------------------------------------------------

CREATE TABLE financeiro.saldo_caixa (
  conta          TEXT        PRIMARY KEY,
  saldo          NUMERIC(18,2) NOT NULL DEFAULT 0,
  data_saldo     DATE,                          -- a data a que o saldo se refere (staleness)
  reserva        BOOLEAN     NOT NULL DEFAULT false,  -- reserva (XP) fora do operacional (§3.6)
  ordem          INTEGER     NOT NULL DEFAULT 0,
  ativo          BOOLEAN     NOT NULL DEFAULT true,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE financeiro.saldo_caixa ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON financeiro.saldo_caixa TO service_role;

-- Seed one-time: parte das contas atuais do Gerencial (cópia, NÃO vínculo — daqui em
-- diante as duas telas evoluem separadas). papel='reserva' vira o flag booleano.
-- COALESCE obrigatório: `papel` é ANULÁVEL (Asaas/Blimboo = NULL) e `(NULL = 'reserva')`
-- é NULL, que violaria o NOT NULL de `reserva` e abortaria a migration (achado do revisor-db;
-- precedente CLAUDE.md: predicado com coluna anulável exige coalesce).
INSERT INTO financeiro.saldo_caixa (conta, saldo, data_saldo, reserva, ordem, ativo)
SELECT conta, saldo, data_saldo, COALESCE(papel = 'reserva', false), ordem, ativo
FROM analytics.gerencial_saldos
ON CONFLICT (conta) DO NOTHING;

-- ── get_saldo_caixa() — leitura do KPI/drill (área da página) ────────────────
CREATE OR REPLACE FUNCTION public.get_saldo_caixa()
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.ordem), '[]'::json)
    FROM (
      SELECT conta, saldo, ordem, data_saldo, reserva, atualizado_em
      FROM financeiro.saldo_caixa
      WHERE ativo = true
    ) t
  );
END $function$;

-- ── atualizar_saldo_caixa(conta, saldo, data) — edição no modal do drill ─────
CREATE OR REPLACE FUNCTION public.atualizar_saldo_caixa(p_conta text, p_saldo numeric, p_data_saldo date)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa']);
  UPDATE financeiro.saldo_caixa
     SET saldo = p_saldo, data_saldo = p_data_saldo, atualizado_em = now()
   WHERE conta = p_conta;
  RETURN FOUND;
END $function$;

REVOKE EXECUTE ON FUNCTION public.get_saldo_caixa()                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.atualizar_saldo_caixa(text, numeric, date)     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_saldo_caixa()                              TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.atualizar_saldo_caixa(text, numeric, date)     TO authenticated, service_role;

-- ── get_fluxo_runway_semanal — saldo operacional passa a ler financeiro.saldo_caixa ──
CREATE OR REPLACE FUNCTION public.get_fluxo_runway_semanal()
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_saldo_op numeric;
  v_semanas  json;
  v_ini      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva']);
  -- Saldo operacional = contas ativas NÃO-reserva da tabela PRÓPRIA do Fluxo Projetado
  -- (desconectado de analytics.gerencial_saldos desde este ajuste).
  SELECT COALESCE(SUM(saldo),0) INTO v_saldo_op
  FROM financeiro.saldo_caixa
  WHERE ativo = true AND NOT reserva;

  -- 13 semanas A PARTIR DE HOJE (futuro); vencidos parqueados (decisão de produto).
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

-- ── get_fluxo_horizonte v2 — 12 meses rolantes (calendário jan–dez) + anos consolidados ──
-- Mês m < mês-corrente → mostra o MESMO mês do ANO SEGUINTE (ex.: em julho/26, jan..jun
-- exibem jan..jun/27); m = mês-corrente → RESTO do mês (competência > hoje; parcial=true);
-- m > mês-corrente → mês cheio do ano corrente. Anos consolidados SEM dupla contagem:
-- ano+1 = só os meses NÃO exibidos nas colunas (m ≥ mês-corrente, resto=true); ano+2 = cheio.
-- Tudo previsto, dentro do corte 2028 (pos_corte fica fora — bloco meta não plotado aqui).
CREATE OR REPLACE FUNCTION public.get_fluxo_horizonte()
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ano  int  := extract(year  from (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  v_mes  int  := extract(month from (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  v_meses json;
  v_anos  json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva']);

  WITH alvo AS (
    SELECT m,
           CASE WHEN m < v_mes THEN v_ano + 1 ELSE v_ano END AS ano,
           (m = v_mes)                                        AS parcial
    FROM generate_series(1, 12) AS m
  ),
  agg AS (
    SELECT a.m, a.ano, a.parcial,
      COALESCE(SUM(f.valor),0)                          AS liq,
      COALESCE(SUM(f.valor) FILTER (WHERE f.valor>0),0) AS e,
      COALESCE(SUM(f.valor) FILTER (WHERE f.valor<0),0) AS s,
      COUNT(f.id)                                       AS n
    FROM alvo a
    LEFT JOIN financeiro.fato_fluxo f
      ON  f.tipo = 'previsto' AND NOT f.pos_corte
      AND extract(year  from f.data_competencia)::int = a.ano
      AND extract(month from f.data_competencia)::int = a.m
      AND (NOT a.parcial OR f.data_competencia > v_hoje)
    GROUP BY a.m, a.ano, a.parcial
  )
  SELECT json_agg(row_to_json(t) ORDER BY t.mes) INTO v_meses
  FROM (
    SELECT m AS mes, ano, parcial, round(liq,2) AS liq, round(e,2) AS e, round(s,2) AS s, n
    FROM agg
  ) t;

  SELECT json_agg(row_to_json(t) ORDER BY t.ano) INTO v_anos
  FROM (
    SELECT (v_ano + 1) AS ano, true AS resto,
      round(COALESCE(SUM(valor),0),2)                          AS liq,
      round(COALESCE(SUM(valor) FILTER (WHERE valor>0),0),2)   AS e,
      round(COALESCE(SUM(valor) FILTER (WHERE valor<0),0),2)   AS s,
      COUNT(*) AS n
    FROM financeiro.fato_fluxo
    WHERE tipo='previsto' AND NOT pos_corte
      AND extract(year  from data_competencia)::int = v_ano + 1
      AND extract(month from data_competencia)::int >= v_mes
    UNION ALL
    SELECT (v_ano + 2), false,
      round(COALESCE(SUM(valor),0),2),
      round(COALESCE(SUM(valor) FILTER (WHERE valor>0),0),2),
      round(COALESCE(SUM(valor) FILTER (WHERE valor<0),0),2),
      COUNT(*)
    FROM financeiro.fato_fluxo
    WHERE tipo='previsto' AND NOT pos_corte
      AND extract(year from data_competencia)::int = v_ano + 2
  ) t;

  RETURN json_build_object(
    'mes_corrente', v_mes,
    'ano_corrente', v_ano,
    'meses',        COALESCE(v_meses, '[]'::json),
    'anos',         COALESCE(v_anos,  '[]'::json)
  );
END $function$;

NOTIFY pgrst, 'reload schema';
