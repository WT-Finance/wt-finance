-- ---------------------------------------------------------------------------
-- 0180 — feat(v5.1.2/M6): RPC de comparação mensal upload × Monde
--
-- DECLARAÇÃO (CLAUDE.md): ADITIVA / retrocompatível com a `main` viva.
--   • CREATE de função NOVA (public.monde_comparacao_mensal). Só LÊ (mvs). NÃO altera dado.
--
-- Alimenta a tela de comparação (só-leitura, sem virada). Lado a lado, mês × setor_macro:
--   • UPLOAD = analytics.mv_vendas_diarias (produção — a MESMA fonte de get_executiva_kpis).
--   • MONDE  = monde.mv_vendas_diarias (espelho, itens ativos).
-- FULL OUTER JOIN por (mes, macro) → mês/macro presente só num lado ainda aparece (delta).
-- Macro em nome INTERNO (Lazer/Weddings/Corporativo); o display "Trips" é da UI.
-- Gate: metas (ANY de metas/acompanhamento|metas) — dado sensível pré-virada.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.monde_comparacao_mensal(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas/acompanhamento', 'metas']);

  WITH upl AS (
    SELECT to_char(date_trunc('month', vd.data_venda), 'YYYY-MM') AS mes,
           dsm.nome AS macro,
           SUM(vd.valor_total)  AS fat,
           SUM(vd.receitas)     AS rec,
           SUM(vd.vendas_count) AS vendas
    FROM analytics.mv_vendas_diarias vd
    JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
    WHERE vd.data_venda BETWEEN p_from AND p_to
    GROUP BY 1, 2
  ),
  mon AS (
    SELECT to_char(date_trunc('month', m.data_venda), 'YYYY-MM') AS mes,
           m.setor_macro AS macro,
           SUM(m.valor_total)  AS fat,
           SUM(m.receitas)     AS rec,
           SUM(m.vendas_count) AS vendas
    FROM monde.mv_vendas_diarias m
    WHERE m.data_venda BETWEEN p_from AND p_to
    GROUP BY 1, 2
  ),
  j AS (
    SELECT
      COALESCE(u.mes, mo.mes)     AS mes,
      COALESCE(u.macro, mo.macro) AS macro,
      COALESCE(u.fat, 0)          AS upload_fat,
      COALESCE(u.rec, 0)          AS upload_rec,
      COALESCE(u.vendas, 0)       AS upload_vendas,
      COALESCE(mo.fat, 0)         AS monde_fat,
      COALESCE(mo.rec, 0)         AS monde_rec,
      COALESCE(mo.vendas, 0)      AS monde_vendas
    FROM upl u
    FULL OUTER JOIN mon mo ON mo.mes = u.mes AND mo.macro = u.macro
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(j) ORDER BY j.mes, j.macro), '[]'::jsonb)
  INTO v
  FROM j;

  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_comparacao_mensal(date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.monde_comparacao_mensal(date, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
