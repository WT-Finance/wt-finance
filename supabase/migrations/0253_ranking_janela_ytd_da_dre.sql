-- ---------------------------------------------------------------------------
-- 0253 — fix(dre): "Maiores variações" passa a usar a MESMA janela YTD do Demonstrativo
-- v5.7.1.
--
-- DECLARAÇÃO (regime aditivo): esta migration é ADITIVA/retrocompatível com a main viva —
--   • um único CREATE OR REPLACE, mesma assinatura, mesmo SECURITY DEFINER/STABLE/
--     search_path/GRANTs (herdados da 0252, que ampliou o array de áreas);
--   • NÃO escreve em dado algum (leitura pura de fato_fluxo/dim_categoria).
--   ⚠️ Ela MUDA NÚMEROS NA TELA de propósito — é o objetivo do patch (ver abaixo).
--
-- ── O defeito ────────────────────────────────────────────────────────────────
-- O card "Maiores variações" mudou de página na v5.7.0: saiu do Fluxo de Caixa e passou a
-- viver logo abaixo do Demonstrativo. Só que as duas peças usavam janelas DIFERENTES para
-- a mesma palavra "acumulado do ano":
--
--   • o card cortava o ano ANTERIOR pelo mesmo DIA-DO-ANO (`doy <= v_doy`);
--   • o Demonstrativo (e o Resumo Executivo, e a visão Consolidado) usam YTD por MÊS
--     INTEIRO — `meses.slice(0, mês corrente)`.
--
-- Medido em 24/08/2026, categoria "Pagamento ao Fornecedor":
--   ano corrente  → card −19.842.743,22 · DRE YTD 26 −19.842.743,22  (batem: os dois
--                    cortam em "hoje", e realizado não existe além da data-base)
--   ano anterior  → card −15.518.502,72 · DRE YTD 25 −16.157.462,20  (**diferença de
--                    638.959,48** = 25 a 31/08/2025, que o corte por dia-do-ano excluía)
--
-- Dois números com o mesmo rótulo e valores diferentes, lado a lado na mesma tela.
--
-- ── A decisão ────────────────────────────────────────────────────────────────
-- A janela do DEMONSTRATIVO vence, e o card se alinha a ela. Não o contrário: "YTD =
-- janeiro até o mês corrente" já é a definição da casa em três lugares (tabela, Resumo
-- Executivo, Consolidado), e mudá-la ali rippearia por toda a comparação ano-a-ano para
-- consertar um card.
--
-- **O que se perde, dito em voz alta:** o corte por dia-do-ano comparava o mesmo NÚMERO DE
-- DIAS decorridos, o que é mais rigoroso. Com a janela por mês, no mês corrente compara-se
-- um mês PARCIAL do ano atual contra o mês INTEIRO do anterior — a mesma assimetria que o
-- YTD do Demonstrativo já carrega. Trocar o rigor pela reconciliação é decisão consciente:
-- dois números que se contradizem na mesma tela custam mais confiança do que um viés
-- conhecido e rotulado. Os cabeçalhos do card passaram a dizer "YTD 2025"/"YTD 2026"
-- (v5.7.1) justamente para o viés ficar nomeado.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_fluxo_ranking(p_limite integer DEFAULT 7)
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_ano   int  := extract(year  from (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  -- Mês corrente em SP. É o `mesJanela` do front (`hojeSP()`), a MESMA fatia do calendário
  -- que o Demonstrativo usa nos dois anos. `v_doy` saiu com o corte por dia-do-ano.
  v_mes   int  := extract(month from (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  v_bad   json;
  v_good  json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva', 'financeiro/dre']);
  -- YTD comparável: Jan..mês corrente nos DOIS anos (meses inteiros), espelhando
  -- `linha.meses.slice(0, mesJanela)` do front. No ano corrente o mês corrente entra com o
  -- que já é realizado — não há realizado além da data-base, então o filtro por mês e o
  -- filtro por "<= hoje" devolvem o mesmo conjunto.
  WITH cat AS (
    SELECT dc.categoria AS c,
      SUM(f.valor) FILTER (WHERE extract(year  from f.data_competencia) = v_ano - 1
                             AND extract(month from f.data_competencia) <= v_mes) AS t_ant,
      SUM(f.valor) FILTER (WHERE extract(year  from f.data_competencia) = v_ano
                             AND extract(month from f.data_competencia) <= v_mes) AS t_cur
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
