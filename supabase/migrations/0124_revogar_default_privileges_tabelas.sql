-- ---------------------------------------------------------------------------
-- 0124 — fix(v4.13/S11): reverter ALTER DEFAULT PRIVILEGES de TABELAS para anon
-- (2º achado da auto-auditoria adversarial).
--
-- A migration 0007 fez `ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT
-- ON TABLES TO anon, authenticated` (e idem app). Confirmado vivo em pg_default_acl:
-- analytics/app TABLE → anon=r, authenticated=r. Consequência: TODA tabela FUTURA
-- criada nesses schemas (pelo role de migração) NASCE legível por anon/authenticated
-- — o gêmeo, no nível de tabela, do furo de funções corrigido na 0122.
--
-- Hoje contido porque: a 0120 revogou os grants das tabelas EXISTENTES + RLS
-- deny-by-default + schemas não expostos pelo PostgREST. Mas o default torna o
-- sistema frágil: uma tabela nova sem REVOKE/RLS explícito reabriria leitura a
-- qualquer logado. Esta migration zera o default para os 6 schemas de dados (mesmo
-- role das migrations — postgres — então casa o ALTER do 0007). Defensivo e
-- idempotente. Não afeta a main (acesso só via RPC SECURITY DEFINER).
-- ---------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA analytics, app, audit, dim, financeiro, raw
  REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLES FROM anon, authenticated;

-- Sequências e funções, por simetria (funções já cobertas na 0122; reforço aqui
-- para os 6 schemas de dados — anon/authenticated não criam nem usam nada neles).
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics, app, audit, dim, financeiro, raw
  REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
