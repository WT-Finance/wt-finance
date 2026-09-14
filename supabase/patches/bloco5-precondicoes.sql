-- Bloco 5 — pré-condições que a triagem exigiu provar NO ATO, antes de escrever os DROP.
-- (a) D2-002: os 4 wrappers do gerencial NÃO chamam o núcleo por SQL dinâmico
-- (b) D2-005: nada lê app.config direto (fora do próprio get_config_numeric)
-- (c) D2-007: as duas tabelas de meta por subsetor estão VAZIAS
-- (d) D2-013: as duas constraints coexistem e a de ±5% é a que fica

-- (a) corpo dos 4 wrappers: procurar EXECUTE / format / quote_ident
select 'a) wrapper gerencial' as checagem, p.proname as nome,
       (pg_get_functiondef(p.oid) ~* '\mEXECUTE\M')  as usa_execute,
       (pg_get_functiondef(p.oid) ~* '\mformat\s*\(') as usa_format,
       (pg_get_functiondef(p.oid) ~ ('\m' || p.proname || '__nucleo\M')) as chama_o_nucleo
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('get_gerencial_lancamentos','get_gerencial_lancamentos_planilha',
                     'get_gerencial_projecao_diaria','get_gerencial_saldos');

-- (b) quem lê app.config direto (tabela), fora do get_config_numeric
select 'b) le app.config direto' as checagem,
       n.nspname || '.' || p.proname as quem
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.prokind = 'f'
   and n.nspname not in ('pg_catalog','information_schema')
   and p.proname <> 'get_config_numeric'
   and pg_get_functiondef(p.oid) ~ '\mapp\.config\M';

-- (c) as duas tabelas de D2-007 existem e estão vazias?
select 'c) meta_subsetor' as checagem,
       (select count(*) from app.meta_subsetor)            as linhas_meta_subsetor,
       (select count(*) from app.meta_subsetor_historico)  as linhas_historico;

-- (d) as duas constraints de taxa: qual é qual
select 'd) constraint cdi' as checagem, c.conname as nome, pg_get_constraintdef(c.oid) as definicao
  from pg_constraint c
 where c.conrelid = 'analytics.dim_taxa_cdi'::regclass
   and c.contype = 'c'
 order by c.conname;
