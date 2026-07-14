-- ---------------------------------------------------------------------------
-- 0179 — feat(v5.1.2/M4): mv espelho monde.mv_vendas_diarias + refresh
--
-- DECLARAÇÃO (CLAUDE.md): ADITIVA / retrocompatível com a `main` viva.
--   • CREATE de MATERIALIZED VIEW e função NOVAS no schema `monde`/`public`. NÃO altera
--     objeto/dado pré-existente. NÃO substitui a mv de produção (analytics.mv_vendas_diarias).
--
-- Espelha a lógica EXATA da mv de produção (0006): soma de valor_total/receitas por
-- data_venda × setor_macro, contagem DISTINCT de venda. A ÚNICA diferença deliberada:
-- soma só os ITENS ATIVOS (status='active') — cancelados excluídos (decisão do Yan).
-- É o lado "Monde" da tela de comparação (M6). Refresh manual pós-ingestão.
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS monde.mv_vendas_diarias AS
SELECT
  v.data_venda,
  v.setor_macro,
  SUM(i.valor_total)    AS valor_total,
  SUM(i.receitas)       AS receitas,
  COUNT(DISTINCT v.id)  AS vendas_count
FROM monde.venda_item i
JOIN monde.venda v ON v.id = i.venda_id
WHERE i.status = 'active'              -- só itens ATIVOS (cancelados fora)
GROUP BY v.data_venda, v.setor_macro
WITH NO DATA;

-- Índice único (data_venda, setor_macro): a GROUP BY garante unicidade; acelera o lookup
-- mensal da comparação e habilita refresh eficiente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_monde_mvd_pk
  ON monde.mv_vendas_diarias (data_venda, setor_macro);

-- Refresh (chamado pelo Cron/ingestão após promover). Plano (não-CONCURRENTLY): a mv nasce
-- WITH NO DATA e o 1º refresh precisa ser pleno; o lock é sub-segundo num espelho de baixo
-- tráfego. service_role-only.
CREATE OR REPLACE FUNCTION public.monde_refresh_mv()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW monde.mv_vendas_diarias;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_refresh_mv() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_refresh_mv() TO service_role;

NOTIFY pgrst, 'reload schema';
