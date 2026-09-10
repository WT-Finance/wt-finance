-- Insumo D2 — colunas de tabelas (para cruzar consumidores no código)
select table_schema as schema, table_name as tabela, column_name as coluna, data_type as tipo, is_nullable as anulavel, column_default as default_
from information_schema.columns
where table_schema not in ('pg_catalog','information_schema','extensions','graphql','graphql_public','realtime','storage','vault','auth','supabase_functions','supabase_migrations','pgsodium','pgsodium_masks','net','cron','pgbouncer')
order by 1,2,ordinal_position;
