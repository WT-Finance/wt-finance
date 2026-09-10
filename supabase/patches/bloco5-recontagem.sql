-- Bloco 5 — RECONTAGEM do mapa de referências, contra o catálogo VIVO pós-0269.
--
-- Por que recontar: o commit de D1-012 apagou 6 scripts de supabase/seed/ que eram os
-- ÚNICOS chamadores de algumas RPCs. E a lição dos falsos positivos D2-008/009: o mapa da
-- Fase 1 varria só `src/` e corpos de função, e por isso deu como órfãs uma função usada
-- em POLICY e três usadas em TRIGGER. Esta consulta varre as quatro superfícies do banco:
-- corpo de outra função, policy RLS, trigger e default de coluna.
with alvo(schema, nome) as (values
  ('public','get_fluxo_caixa_kpis_diario'),
  ('public','get_fluxo_caixa_kpis_diario__nucleo'),
  ('public','get_gerencial_lancamentos__nucleo'),
  ('public','get_gerencial_lancamentos_planilha__nucleo'),
  ('public','get_gerencial_projecao_diaria__nucleo'),
  ('public','get_gerencial_saldos__nucleo'),
  ('app','current_user_setor_id'),
  ('public','get_my_profile'),
  ('app','is_financeiro'),
  ('app','get_config_numeric'),
  ('public','metas_subsetor_listar'),
  ('public','metas_subsetor_upsert'),
  ('public','metas_sumario_subsetor'),
  ('public','get_decomposicao_bloco')
)
select a.schema, a.nome,
  -- (1) citada no CORPO de outra função?
  (select coalesce(string_agg(distinct n2.nspname||'.'||p2.proname, ', '), '')
     from pg_proc p2 join pg_namespace n2 on n2.oid = p2.pronamespace
    where p2.prokind = 'f'
      and n2.nspname not in ('pg_catalog','information_schema')
      and not (n2.nspname = a.schema and p2.proname = a.nome)
      and pg_get_functiondef(p2.oid) ~ ('\m' || a.nome || '\M')) as por_funcao,
  -- (2) citada em POLICY RLS? (o furo do D2-008)
  (select coalesce(string_agg(distinct pol.schemaname||'.'||pol.tablename||':'||pol.policyname, ', '), '')
     from pg_policies pol
    where coalesce(pol.qual,'') || ' ' || coalesce(pol.with_check,'') ~ ('\m' || a.nome || '\M')) as por_policy,
  -- (3) citada em TRIGGER? (o furo do D2-009)
  (select coalesce(string_agg(distinct t.tgname, ', '), '')
     from pg_trigger t
    where not t.tgisinternal
      and pg_get_triggerdef(t.oid) ~ ('\m' || a.nome || '\M')) as por_trigger,
  -- (4) citada em DEFAULT de coluna ou em CHECK?
  (select coalesce(string_agg(distinct c.conrelid::regclass::text||':'||c.conname, ', '), '')
     from pg_constraint c
    where pg_get_constraintdef(c.oid) ~ ('\m' || a.nome || '\M')) as por_constraint,
  -- e a função ainda existe?
  exists (select 1 from pg_proc p3 join pg_namespace n3 on n3.oid = p3.pronamespace
           where n3.nspname = a.schema and p3.proname = a.nome) as existe
from alvo a
order by 1, 2;
