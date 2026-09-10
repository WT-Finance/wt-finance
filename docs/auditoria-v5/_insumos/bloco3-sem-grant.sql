-- Bloco 3 / D2-010 — funções SEM nenhum GRANT/REVOKE explícito para os roles do app.
-- Identidade completa (schema, nome, args) para escrever o REVOKE/GRANT sem ambiguidade
-- de sobrecarga. Rodado contra o catálogo VIVO na hora de escrever a migration.
select n.nspname                                      as schema,
       p.proname                                      as nome,
       pg_get_function_identity_arguments(p.oid)      as args,
       p.prokind                                      as kind,
       p.prosecdef                                    as secdef,
       (select string_agg(distinct g.grantee, ',' order by g.grantee)
          from information_schema.role_routine_grants g
         where g.specific_schema = n.nspname
           and g.routine_name    = p.proname
           and g.grantee in ('anon','authenticated','service_role','PUBLIC')) as grants
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','app','financeiro','patrimonio','analytics','monde','raw','staging','cdi')
  and (select count(*)
         from information_schema.role_routine_grants g
        where g.specific_schema = n.nspname
          and g.routine_name    = p.proname
          and g.grantee in ('anon','authenticated','service_role','PUBLIC')) = 0
order by 1, 2;
