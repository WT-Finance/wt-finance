-- ---------------------------------------------------------------------------
-- 0120 — feat(v4.13/M1): RLS deny-by-default em TODOS os schemas de dados
-- (ADR-0108, camada 4).
--
-- Habilita ROW LEVEL SECURITY em todas as tabelas de analytics, app, audit,
-- dim, financeiro e raw — SEM policies permissivas (ausência de policy = negado
-- para anon/authenticated). Também revoga qualquer privilégio direto de tabela
-- desses roles nesses schemas (defesa em profundidade: nem grant direto, nem
-- linha via RLS, mesmo que um schema venha a ser exposto no futuro).
--
-- NÃO quebra nada (S5):
--  • O app nunca acessa tabela diretamente (zero `.from()` no código) — todo
--    acesso é via RPC SECURITY DEFINER, cujo owner (postgres) NÃO é sujeito a
--    RLS nas tabelas que possui (não usamos FORCE).
--  • service_role tem BYPASSRLS (seed/cargas intactos).
--  • PostgREST só expõe `public` — esses schemas já eram inalcançáveis via API.
--
-- Única policy criada: auto-leitura do próprio registro em app.rbac_usuarios
-- (granular por usuário; inofensiva — schema não exposto).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('analytics', 'app', 'audit', 'dim', 'financeiro', 'raw')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated', r.schemaname, r.tablename);
  END LOOP;
END;
$$;

-- Materialized views não suportam RLS; ficam cobertas pela revogação de grants
-- diretos (e pelos schemas não expostos). Revoga explicitamente:
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, matviewname
    FROM pg_matviews
    WHERE schemaname IN ('analytics', 'app', 'audit', 'dim', 'financeiro', 'raw')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated', r.schemaname, r.matviewname);
  END LOOP;
END;
$$;

-- Views comuns (analytics.vw_*): mesma revogação.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.views
    WHERE table_schema IN ('analytics', 'app', 'audit', 'dim', 'financeiro', 'raw')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated', r.table_schema, r.table_name);
  END LOOP;
END;
$$;

-- USAGE nos schemas de dados: anon/authenticated não precisam (RPCs SECURITY
-- DEFINER executam como postgres). Idempotente se nunca houve grant.
REVOKE USAGE ON SCHEMA analytics, app, audit, dim, financeiro, raw FROM PUBLIC, anon, authenticated;

-- Policy granular: usuário autenticado lê o PRÓPRIO registro RBAC (defesa em
-- profundidade; o app usa a RPC get_minhas_permissoes).
GRANT USAGE ON SCHEMA app TO authenticated;
GRANT SELECT ON TABLE app.rbac_usuarios TO authenticated;
CREATE POLICY rbac_usuarios_proprio_registro ON app.rbac_usuarios
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
