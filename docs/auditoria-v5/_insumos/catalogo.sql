-- Insumo D2/D3 — catálogo read-only (rodado via `npx supabase db query --linked -f`)
-- 1. Funções por schema (fora dos schemas de sistema/extensões)
select n.nspname as schema, p.proname as nome, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer, p.prokind as kind, l.lanname as lang,
       (select string_agg(grantee||':'||privilege_type, ',') from information_schema.role_routine_grants g
         where g.specific_schema = n.nspname and g.routine_name = p.proname and g.grantee in ('anon','authenticated','service_role')) as grants,
       left(obj_description(p.oid,'pg_proc'), 200) as comentario
from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
where n.nspname not in ('pg_catalog','information_schema','pg_toast','extensions','graphql','graphql_public','realtime','storage','vault','auth','supabase_functions','supabase_migrations','pgsodium','pgsodium_masks','net','cron','pgbouncer')
order by 1,2;
