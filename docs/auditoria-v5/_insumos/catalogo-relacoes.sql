-- Insumo D2/D3 — tabelas, views, MVs com estatísticas de uso (read-only)
select n.nspname as schema, c.relname as nome, c.relkind as tipo,
       c.reltuples::bigint as linhas_estimadas,
       pg_size_pretty(pg_total_relation_size(c.oid)) as tamanho,
       s.seq_scan, s.seq_tup_read, s.idx_scan, s.n_live_tup, s.n_dead_tup,
       s.last_autovacuum, s.last_autoanalyze,
       left(obj_description(c.oid,'pg_class'),160) as comentario,
       c.relrowsecurity as rls,
       (select string_agg(g.grantee||':'||g.privilege_type, ',') from information_schema.role_table_grants g
         where g.table_schema=n.nspname and g.table_name=c.relname and g.grantee in ('anon','authenticated','service_role')) as grants
from pg_class c join pg_namespace n on n.oid=c.relnamespace
left join pg_stat_user_tables s on s.relid=c.oid
where c.relkind in ('r','v','m','p') and n.nspname not in ('pg_catalog','information_schema','pg_toast','extensions','graphql','graphql_public','realtime','storage','vault','auth','supabase_functions','supabase_migrations','pgsodium','pgsodium_masks','net','cron','pgbouncer')
order by 1,3,2;
