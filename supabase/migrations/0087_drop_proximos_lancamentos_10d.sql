-- 0087 — chore: drop RPC get_proximos_lancamentos_10d
-- Substituída por get_proximos_lancamentos(p_dias int DEFAULT 10) em migration 0086.
-- Verificado: única referência no front removida neste mesmo commit.

DROP FUNCTION IF EXISTS public.get_proximos_lancamentos_10d();
