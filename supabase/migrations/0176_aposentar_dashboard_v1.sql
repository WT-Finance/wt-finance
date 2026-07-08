-- ---------------------------------------------------------------------------
-- 0176 — chore(v5.0.0): aposentadoria das RPCs do dashboard v1 de /metas
--
-- ⚠️ DESTRUTIVA (DROP FUNCTION). NÃO aplicar em regime autônomo: rodar
--    `npm run db:migrate -- --destrutiva` num TERMINAL (TTY), com confirmação humana.
--    (O agente não aplica destrutiva — o wrapper aborta em stdin não-TTY, ADR-0131.)
--
-- PROVA DE NÃO-CONSUMO (grep no app, v5.0.0/M5):
--   • O Acompanhamento novo (/metas) usa metas_listar/metas_ritmo_diario/get_executiva_kpis.
--   • As 4 RPCs abaixo eram chamadas SOMENTE pelas API Routes /api/{kpis,ritmo-diario,
--     ranking-vendedores,ranking-produtos}, que por sua vez eram chamadas SOMENTE pelo
--     componente legado src/app/metas/MetasDashboard.tsx — TODOS removidos nesta versão
--     (código morto). Nenhum outro consumidor (nem a Executiva, nem o seed).
--   • get_historico_mensal NÃO é dropada: além do MetasDashboard, é consumida VIVA pela
--     Executiva (src/app/api/dashboard/kpi-historico → KpiDetailDrawer). Permanece.
--
-- REVERSÍVEL: recriar a partir das defs originais em 0012_read_functions.sql
--   (get_kpis, get_ritmo_diario), 0014_performance_functions.sql (rankings) e do
--   retrofit de guards em 0121_guards_rpcs_leitura.sql (wrappers públicos).
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_kpis(p_ano integer, p_mes integer, p_setor text);
DROP FUNCTION IF EXISTS public.get_kpis__nucleo(p_ano integer, p_mes integer, p_setor text);

DROP FUNCTION IF EXISTS public.get_ritmo_diario(p_ano integer, p_mes integer, p_setor text);
DROP FUNCTION IF EXISTS public.get_ritmo_diario__nucleo(p_ano integer, p_mes integer, p_setor text);

DROP FUNCTION IF EXISTS public.get_ranking_vendedores(p_ano integer, p_mes integer, p_setor text, p_limite integer);
DROP FUNCTION IF EXISTS public.get_ranking_vendedores__nucleo(p_ano integer, p_mes integer, p_setor text, p_limite integer);

DROP FUNCTION IF EXISTS public.get_ranking_produtos(p_ano integer, p_mes integer, p_setor text, p_limite integer);
DROP FUNCTION IF EXISTS public.get_ranking_produtos__nucleo(p_ano integer, p_mes integer, p_setor text, p_limite integer);

NOTIFY pgrst, 'reload schema';
