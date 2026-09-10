-- Bloco 3 / D9-015 — quais funções VIVAS ainda lançam o texto pré-rebranding.
-- Corpo extraído do CATÁLOGO VIVO (pg_get_functiondef), nunca da migration de origem:
-- é a regra da skill banco-e-rpc (§5, "CREATE OR REPLACE se escreve a partir do catálogo
-- vivo") — a função pode ter sido reaplicada por migration posterior à que a criou.
select n.nspname                                 as schema,
       p.proname                                 as nome,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid)                 as def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prokind = 'f'
  and pg_get_functiondef(p.oid) ilike '%WT Finance%'
order by 1, 2;
