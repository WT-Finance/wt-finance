-- Configura Row-Level Security (RLS) e permissões por schema
--
-- O que é RLS: mecanismo do Postgres que filtra linhas com base em políticas.
-- Mesmo que alguém tenha GRANT SELECT numa tabela, sem uma policy permissiva
-- o RLS bloqueia todos os acessos. O role service_role bypassa RLS por design
-- (é a chave usada apenas no seed local).
--
-- Modelo desta v1 (sem autenticação):
--   raw e audit  → apenas service_role (anon bloqueado pelo schema e pelo RLS)
--   analytics    → leitura aberta para anon (frontend sem login)
--   app          → leitura aberta para anon

-- ---------------------------------------------------------------------------
-- Grants de schema para anon poder enxergar analytics e app
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA analytics TO anon, authenticated;
GRANT USAGE ON SCHEMA app       TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grants de SELECT nas tabelas de analytics e app
-- (inclui views materializadas, que não suportam RLS diretamente)
-- ---------------------------------------------------------------------------
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA app       TO anon, authenticated;

-- Garante que novas tabelas criadas no futuro nestes schemas herdem o grant
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics
  GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT ON TABLES TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grants de escrita para service_role em todos os schemas
-- ---------------------------------------------------------------------------
GRANT ALL ON ALL TABLES    IN SCHEMA raw       TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA analytics TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA app       TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA audit     TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA raw       TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA analytics TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app       TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA audit     TO service_role;

-- ---------------------------------------------------------------------------
-- Ativa RLS em todas as tabelas
-- ---------------------------------------------------------------------------

-- raw: RLS ativo, sem policy → anon bloqueado mesmo com grant
ALTER TABLE raw.vendas_excel ENABLE ROW LEVEL SECURITY;

-- analytics: RLS ativo + policies de leitura aberta abaixo
ALTER TABLE analytics.dim_setor_macro    ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.dim_setor          ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.dim_setor_micro    ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.dim_vendedor       ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.dim_pagante        ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.dim_produto        ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.dim_data           ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.fato_venda         ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.fato_venda_item    ENABLE ROW LEVEL SECURITY;

-- app: RLS ativo + policies de leitura aberta abaixo
ALTER TABLE app.meta_setor               ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.meta_setor_historico     ENABLE ROW LEVEL SECURITY;

-- audit: RLS ativo, sem policy → apenas service_role
ALTER TABLE audit.ingestao_log           ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policies de leitura aberta para analytics (v1 sem autenticação)
-- Quando login for adicionado, estas policies evoluem para filtrar por
-- usuário/papel sem reescrita da estrutura.
-- ---------------------------------------------------------------------------
CREATE POLICY "leitura_anon" ON analytics.dim_setor_macro
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "leitura_anon" ON analytics.dim_setor
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "leitura_anon" ON analytics.dim_setor_micro
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "leitura_anon" ON analytics.dim_vendedor
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "leitura_anon" ON analytics.dim_pagante
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "leitura_anon" ON analytics.dim_produto
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "leitura_anon" ON analytics.dim_data
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "leitura_anon" ON analytics.fato_venda
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "leitura_anon" ON analytics.fato_venda_item
  FOR SELECT TO anon, authenticated USING (true);

-- Policies de leitura aberta para app
CREATE POLICY "leitura_anon" ON app.meta_setor
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "leitura_anon" ON app.meta_setor_historico
  FOR SELECT TO anon, authenticated USING (true);
