-- Bloco 3 / D2-010 — ACL REAL de cada função, direto de pg_proc.proacl.
-- Por que proacl e não information_schema: o `role_routine_grants` do information_schema
-- não expõe o grant DEFAULT para PUBLIC de forma confiável, e era isso que a consulta da
-- Fase 1 não enxergava (ela olhava só anon/authenticated/service_role e por isso reportou
-- "grants: null" para função que na verdade tem EXECUTE para PUBLIC — o pior caso, não a
-- ausência de caso). `proacl IS NULL` = ACL DEFAULT do Postgres = EXECUTE para PUBLIC.
select n.nspname                                 as schema,
       p.proname                                 as nome,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef                               as secdef,
       case when p.proacl is null then 'DEFAULT (=X/owner: EXECUTE para PUBLIC)'
            else array_to_string(p.proacl, ' ') end as acl,
       (p.proacl is null)                        as acl_default,
       exists (select 1 from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal) as e_trigger
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','app','financeiro','patrimonio','analytics','monde','raw','staging','cdi')
  and p.prokind = 'f'
order by (p.proacl is null) desc, 1, 2;
