-- Bloco 3 — quantas funções DISTINTAS chamam app.norm_nome (afirmação numérica que vai
-- para o COMMENT permanente; o revisor-db pediu conferência antes de perpetuar o número).
select count(*) as funcoes_que_chamam,
       string_agg(n.nspname || '.' || p.proname, ', ' order by n.nspname, p.proname) as quais
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prokind = 'f'
  and n.nspname not in ('pg_catalog','information_schema')
  and p.proname <> 'norm_nome'
  and pg_get_functiondef(p.oid) ~ '\mapp\.norm_nome\M';
