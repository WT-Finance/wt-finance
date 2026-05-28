-- 0093 — Drop de RPCs órfãs identificadas no audit M7 da v4.5
-- Verificadas: zero callers no frontend (grep src/ --include="*.ts" --include="*.tsx")
-- Excluída: get_fluxo_caixa_kpis_b (caller ativo em fluxo-caixa/page.tsx)

DROP FUNCTION IF EXISTS public.get_fluxo_caixa_mensal CASCADE;
DROP FUNCTION IF EXISTS public.get_fluxo_caixa_mensal_b CASCADE;
DROP FUNCTION IF EXISTS public.get_historico_12m CASCADE;
DROP FUNCTION IF EXISTS public.get_proximos_vencimentos CASCADE;
DROP FUNCTION IF EXISTS public.get_proximos_vencimentos_v2 CASCADE;
DROP FUNCTION IF EXISTS public.get_config_numeric CASCADE;
