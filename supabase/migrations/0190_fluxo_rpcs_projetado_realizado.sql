-- ---------------------------------------------------------------------------
-- 0190 — feat(financeiro): RPCs novas p/ a página reformada (v5.2.0/Onda 1, M4)
--
-- ADITIVA: 4 RPCs NOVAS (padrão INLINE de RBAC — exigir_acesso na 1ª linha; REVOKE/GRANT
--   explícitos). Leem financeiro.fato_fluxo (eixo movimentação). Contratos espelham o objeto
--   `D` da controladoria (semanal/runway, horiz, repasse, catBad/catGood) p/ fidelidade.
--
-- NOTA sobre histórico: as partes multi-ano (repasse pct do ano anterior; ranking YTD×YTD-anterior)
--   dependem de o upload de movimentação conter 2024+ (o export de produção é "01/01/2024 sem
--   data fim"). Com uma amostra só-2026, o comparativo do ano anterior vem zerado — as RPCs estão
--   corretas p/ o histórico completo; só o dado da amostra é curto.
--
-- Repasse (métrica central, BRUTO por decisão do Yan): Entrada de Clientes − Pagamento ao
--   Fornecedor. As categorias-membro são as do bloco ENT_H/PAG_H da referência (a DRE-struct da
--   Onda 2 formaliza; aqui a lista é explícita e documentada).
-- ---------------------------------------------------------------------------

-- Índice de apoio p/ os filtros por vencimento (runway/horizonte/próximos) — fato_fluxo (0187)
-- só tinha índices por data_competencia. Aditiva (CREATE INDEX). Barato agora, importa com 2024+.
CREATE INDEX IF NOT EXISTS fato_fluxo_tipo_venc_idx ON financeiro.fato_fluxo (tipo, vencimento);

-- ============ get_repasse_mensal(p_ano) — saldo e margem de repasse por mês (BRUTO) ==========
CREATE OR REPLACE FUNCTION public.get_repasse_mensal(p_ano integer)
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva']);
  WITH meses AS (
    SELECT generate_series(1, 12) AS m
  ),
  base AS (
    SELECT
      extract(year from f.data_competencia)::int  AS ano,
      extract(month from f.data_competencia)::int AS mes,
      SUM(f.valor) FILTER (WHERE dc.categoria IN ('Entrada de Clientes','Entrada de clientes','Deposito não Identificado')) AS ent,
      SUM(f.valor) FILTER (WHERE dc.categoria = 'Pagamento ao Fornecedor')                                                  AS pag
    FROM financeiro.fato_fluxo f
    JOIN financeiro.dim_categoria dc ON dc.id = f.categoria_id
    WHERE f.tipo = 'realizado' AND NOT f.pos_corte
      AND extract(year from f.data_competencia) IN (p_ano, p_ano - 1)
    GROUP BY 1, 2
  )
  SELECT json_agg(row_to_json(t) ORDER BY t.mes) INTO v
  FROM (
    SELECT
      m.m                                                            AS mes,
      COALESCE(cur.ent, 0)                                           AS ent,
      COALESCE(cur.ent, 0) + COALESCE(cur.pag, 0)                    AS sal,
      CASE WHEN COALESCE(cur.ent,0) <> 0
           THEN round(((COALESCE(cur.ent,0)+COALESCE(cur.pag,0)) / cur.ent * 100)::numeric, 2) END AS pct,
      CASE WHEN COALESCE(ant.ent,0) <> 0
           THEN round(((COALESCE(ant.ent,0)+COALESCE(ant.pag,0)) / ant.ent * 100)::numeric, 2) END AS pct_ant
    FROM meses m
    LEFT JOIN base cur ON cur.mes = m.m AND cur.ano = p_ano
    LEFT JOIN base ant ON ant.mes = m.m AND ant.ano = p_ano - 1
  ) t;
  RETURN COALESCE(v, '[]'::json);
END $function$;

-- ============ get_fluxo_horizonte() — previsto lançado à frente (dentro do corte) + pós-2028 ==
CREATE OR REPLACE FUNCTION public.get_fluxo_horizonte()
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v json; v_ano int := extract(year from (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva']);
  SELECT json_agg(row_to_json(t) ORDER BY t.ord) INTO v
  FROM (
    -- Resto do ano corrente (previsto, dentro do corte)
    SELECT 1 AS ord, 'Resto de ' || v_ano || ' (lançado)' AS l,
      COALESCE(SUM(valor),0) AS liq,
      COALESCE(SUM(valor) FILTER (WHERE valor>0),0) AS e,
      COALESCE(SUM(valor) FILTER (WHERE valor<0),0) AS s,
      COUNT(*) AS n
    FROM financeiro.fato_fluxo
    WHERE tipo='previsto' AND NOT pos_corte AND extract(year from data_competencia)=v_ano
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

-- ============ get_fluxo_runway_semanal() — projeção 13 semanas + saldo operacional inicial =====
CREATE OR REPLACE FUNCTION public.get_fluxo_runway_semanal()
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_saldo_op numeric;
  v_semanas  json;
  v_ini      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva']);
  -- Saldo operacional inicial = contas ativas NÃO-reserva (§3.6: operacional = total − reserva XP).
  SELECT COALESCE(SUM(saldo),0) INTO v_saldo_op
  FROM analytics.gerencial_saldos
  WHERE ativo = true AND COALESCE(papel,'') <> 'reserva';

  -- 13 semanas A PARTIR DE HOJE (futuro). Títulos VENCIDOS em aberto (vencimento < hoje) ficam
  -- FORA do runway por decisão de produto: "vencidos em aberto" é seção PARQUEADA no mockup v5
  -- (o saldo operacional inicial já é o saldo bancário real; o vencido é tratado à parte, Onda futura).
  -- Isso é explícito (não silencioso). get_fluxo_horizonte SIM inclui o vencido do ano corrente.
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
      to_char(wk_ini,'DD/MM') AS ini, to_char(wk_fim,'DD/MM') AS fim,
      round(rec,2) AS rec, round(pag,2) AS pag, round(rec+pag,2) AS liq,
      round(v_saldo_op + SUM(rec+pag) OVER (ORDER BY idx),2) AS acc  -- saldo projetado acumulado
    FROM agg
  ) t;

  RETURN json_build_object('saldo_operacional', round(v_saldo_op,2), 'semanas', COALESCE(v_semanas,'[]'::json));
END $function$;

-- ============ get_fluxo_ranking() — Pioraram/Melhoraram o caixa (YTD × YTD ano anterior) =======
CREATE OR REPLACE FUNCTION public.get_fluxo_ranking(p_limite integer DEFAULT 7)
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ano   int  := extract(year from (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  v_doy   int  := extract(doy from (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  v_bad   json;
  v_good  json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva']);
  -- YTD comparável: Jan..hoje deste ano × Jan..(mesmo dia-do-ano) do ano anterior.
  WITH cat AS (
    SELECT dc.categoria AS c,
      SUM(f.valor) FILTER (WHERE extract(year from f.data_competencia)=v_ano-1
                             AND extract(doy from f.data_competencia) <= v_doy) AS t_ant,
      SUM(f.valor) FILTER (WHERE extract(year from f.data_competencia)=v_ano
                             AND f.data_competencia <= v_hoje)                   AS t_cur
    FROM financeiro.fato_fluxo f
    JOIN financeiro.dim_categoria dc ON dc.id = f.categoria_id
    WHERE f.tipo='realizado' AND NOT f.pos_corte
      AND extract(year from f.data_competencia) IN (v_ano, v_ano-1)
    GROUP BY dc.categoria
  ),
  d AS (
    SELECT c, COALESCE(t_ant,0) AS t25, COALESCE(t_cur,0) AS t26,
      COALESCE(t_cur,0)-COALESCE(t_ant,0) AS delta,
      CASE WHEN COALESCE(t_ant,0)<>0 THEN round(((COALESCE(t_cur,0)-COALESCE(t_ant,0))/abs(t_ant)*100)::numeric,1) END AS pct,
      CASE WHEN COALESCE(t_cur,0)>=0 THEN 'rec' ELSE 'desp' END AS nat
    FROM cat
    WHERE COALESCE(t_ant,0)<>0 OR COALESCE(t_cur,0)<>0
  )
  SELECT
    (SELECT json_agg(row_to_json(x)) FROM (SELECT c, t25, t26, delta AS d, pct, nat FROM d WHERE delta < 0 ORDER BY delta ASC LIMIT p_limite) x),
    (SELECT json_agg(row_to_json(x)) FROM (SELECT c, t25, t26, delta AS d, pct, nat FROM d WHERE delta > 0 ORDER BY delta DESC LIMIT p_limite) x)
  INTO v_bad, v_good;

  RETURN json_build_object('pioraram', COALESCE(v_bad,'[]'::json), 'melhoraram', COALESCE(v_good,'[]'::json));
END $function$;

-- RBAC explícito (padrão INLINE, v4.29+)
REVOKE EXECUTE ON FUNCTION public.get_repasse_mensal(integer)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_fluxo_horizonte()           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_fluxo_runway_semanal()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_fluxo_ranking(integer)      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_repasse_mensal(integer)     TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_horizonte()           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_runway_semanal()      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_ranking(integer)      TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
