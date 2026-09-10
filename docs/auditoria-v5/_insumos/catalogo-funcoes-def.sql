-- Insumo D2 — definição completa das funções (leitura humana de comentários internos e versões antigas)
select n.nspname as schema, p.proname as nome, pg_get_functiondef(p.oid) as def
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.prokind='f' and n.nspname in ('public','app','financeiro','patrimonio','analytics','monde','raw','staging','cdi')
order by 1,2;
