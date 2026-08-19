-- ---------------------------------------------------------------------------
-- 0252 — feat(dre): "Maiores variações" mudou de página e passa a aceitar a área da DRE
-- v5.7.0 (ajuste da conferência do Yan).
--
-- DECLARAÇÃO (regime aditivo): esta migration é ADITIVA/retrocompatível com a main viva —
--   • um único CREATE OR REPLACE que **só AMPLIA** o array de áreas aceitas
--     (['financeiro/fluxo-caixa','executiva'] → + 'financeiro/dre'); quem passava continua
--     passando e NENHUM acesso é removido;
--   • assinatura, corpo e GRANTs idênticos aos da 0190 — só a linha do `exigir_acesso` muda;
--   • NÃO escreve em dado algum (a função é STABLE, leitura pura de fato_fluxo/dim_categoria).
--
-- Por quê: o card "Maiores variações" saiu de /financeiro/fluxo-caixa e passou a viver em
-- /financeiro/dre, entre o demonstrativo e a Decomposição — ele compara categorias no YTD
-- contra o mesmo período do ano anterior, que é leitura de DEMONSTRATIVO e não de liquidez.
-- Sem esta ampliação, quem tem só a área `financeiro/dre` receberia negação da RPC, e o
-- fail-safe do card anunciaria "sem movimentações realizadas para ranquear no ano" — dado
-- errado parecendo certo, que é justamente a classe de defeito que este projeto pune
-- (sem ACESSO ≠ sem DADO).
--
-- Mesmo molde da 0197, que ampliou os dois wrappers de decomposição por este mesmo motivo.
-- ---------------------------------------------------------------------------

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
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva', 'financeiro/dre']);
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

-- RBAC explícito (padrão INLINE, v4.29+) — inalterado, repetido por higiene.
REVOKE EXECUTE ON FUNCTION public.get_fluxo_ranking(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_ranking(integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
