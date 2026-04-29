-- Views materializadas para acelerar consultas do dashboard
--
-- Criadas com WITH NO DATA: ficam vazias até o primeiro REFRESH, que
-- ocorre ao final do script seed (M2). Tentar consultá-las antes do
-- seed retornará erro — isso é esperado.
--
-- Para atualizar manualmente após novo seed:
--   REFRESH MATERIALIZED VIEW analytics.mv_vendas_diarias;
--   REFRESH MATERIALIZED VIEW analytics.mv_vendas_mensais;
--   REFRESH MATERIALIZED VIEW analytics.mv_ranking_vendedores_mensal;
--   REFRESH MATERIALIZED VIEW analytics.mv_ranking_produtos_mensal;

-- ---------------------------------------------------------------------------
-- mv_vendas_diarias  — base para gráfico de ritmo diário e KPIs do mês
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW analytics.mv_vendas_diarias AS
SELECT
  fv.data_venda,
  ds.setor_macro_id,
  SUM(fvi.valor_total)      AS valor_total,
  SUM(fvi.receitas)         AS receitas,
  COUNT(DISTINCT fv.id)     AS vendas_count
FROM analytics.fato_venda_item fvi
JOIN analytics.fato_venda  fv ON fv.id  = fvi.fato_venda_id
JOIN analytics.dim_setor   ds ON ds.id  = fvi.setor_id
GROUP BY fv.data_venda, ds.setor_macro_id
WITH NO DATA;

CREATE INDEX idx_mv_vendas_diarias
  ON analytics.mv_vendas_diarias (data_venda, setor_macro_id);

-- ---------------------------------------------------------------------------
-- mv_vendas_mensais  — base para histórico mensal e YoY
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW analytics.mv_vendas_mensais AS
SELECT
  dd.ano,
  dd.mes,
  ds.setor_macro_id,
  SUM(fvi.valor_total)      AS valor_total,
  SUM(fvi.receitas)         AS receitas,
  COUNT(DISTINCT fv.id)     AS vendas_count
FROM analytics.fato_venda_item fvi
JOIN analytics.fato_venda  fv ON fv.id   = fvi.fato_venda_id
JOIN analytics.dim_data    dd ON dd.data = fv.data_venda
JOIN analytics.dim_setor   ds ON ds.id   = fvi.setor_id
GROUP BY dd.ano, dd.mes, ds.setor_macro_id
WITH NO DATA;

CREATE INDEX idx_mv_vendas_mensais
  ON analytics.mv_vendas_mensais (ano, mes, setor_macro_id);

-- ---------------------------------------------------------------------------
-- mv_ranking_vendedores_mensal  — base para tabela Top 10 vendedores
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW analytics.mv_ranking_vendedores_mensal AS
SELECT
  dd.ano,
  dd.mes,
  fv.vendedor_id,
  ds.setor_macro_id,
  SUM(fvi.valor_total)      AS valor_total,
  SUM(fvi.receitas)         AS receitas,
  COUNT(DISTINCT fv.id)     AS vendas_count
FROM analytics.fato_venda_item fvi
JOIN analytics.fato_venda  fv ON fv.id   = fvi.fato_venda_id
JOIN analytics.dim_data    dd ON dd.data = fv.data_venda
JOIN analytics.dim_setor   ds ON ds.id   = fvi.setor_id
GROUP BY dd.ano, dd.mes, fv.vendedor_id, ds.setor_macro_id
WITH NO DATA;

CREATE INDEX idx_mv_ranking_vendedores
  ON analytics.mv_ranking_vendedores_mensal (ano, mes, vendedor_id);

-- ---------------------------------------------------------------------------
-- mv_ranking_produtos_mensal  — base para tabela Top 10 produtos
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW analytics.mv_ranking_produtos_mensal AS
SELECT
  dd.ano,
  dd.mes,
  fvi.produto_id,
  ds.setor_macro_id,
  SUM(fvi.valor_total)      AS valor_total,
  SUM(fvi.receitas)         AS receitas,
  COUNT(DISTINCT fv.id)     AS vendas_count
FROM analytics.fato_venda_item fvi
JOIN analytics.fato_venda  fv ON fv.id   = fvi.fato_venda_id
JOIN analytics.dim_data    dd ON dd.data = fv.data_venda
JOIN analytics.dim_setor   ds ON ds.id   = fvi.setor_id
GROUP BY dd.ano, dd.mes, fvi.produto_id, ds.setor_macro_id
WITH NO DATA;

CREATE INDEX idx_mv_ranking_produtos
  ON analytics.mv_ranking_produtos_mensal (ano, mes, produto_id);
