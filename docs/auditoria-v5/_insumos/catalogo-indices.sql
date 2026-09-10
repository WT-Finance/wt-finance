-- Insumo D3 — índices com contagem de uso (idx_scan) e tamanho; inclui se é PK/UNIQUE (não removível por uso zero)
select s.schemaname as schema, s.relname as tabela, s.indexrelname as indice, s.idx_scan, s.idx_tup_read,
       pg_size_pretty(pg_relation_size(s.indexrelid)) as tamanho, i.indisprimary as pk, i.indisunique as unico,
       pg_get_indexdef(s.indexrelid) as definicao
from pg_stat_user_indexes s join pg_index i on i.indexrelid=s.indexrelid
order by s.idx_scan asc, pg_relation_size(s.indexrelid) desc;
