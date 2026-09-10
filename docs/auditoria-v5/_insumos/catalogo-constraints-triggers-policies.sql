-- Insumo D2 — constraints CHECK/UNIQUE/FK, triggers e policies RLS
select 'constraint' as objeto, n.nspname as schema, c.conrelid::regclass::text as tabela, c.conname as nome, c.contype::text as tipo, pg_get_constraintdef(c.oid) as definicao
from pg_constraint c join pg_namespace n on n.oid=c.connamespace
where n.nspname not in ('pg_catalog','information_schema','extensions','graphql','graphql_public','realtime','storage','vault','auth','supabase_functions','supabase_migrations','pgsodium','net','cron') and c.contype in ('c','u','f','x')
union all
select 'trigger', n.nspname, c.relname, t.tgname, case when t.tgenabled='D' then 'DESABILITADO' else 'ativo' end, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname not in ('pg_catalog','information_schema','extensions','graphql','graphql_public','realtime','storage','vault','auth','supabase_functions','supabase_migrations','pgsodium','net','cron')
union all
select 'policy', schemaname, tablename, policyname, cmd||'/'||coalesce(array_to_string(roles,','),''), coalesce(qual,'')||' | WITH CHECK '||coalesce(with_check,'')
from pg_policies
order by 1,2,3,4;
