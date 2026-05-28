-- 0092 — Remove overload antigo get_proximos_lancamentos(INT)
-- A migration 0091 criou get_proximos_lancamentos(INT, TEXT DEFAULT NULL),
-- que é retrocompatível. O overload antigo (INT) causa ambiguidade no
-- PostgREST (PGRST203) e deve ser removido.
DROP FUNCTION IF EXISTS public.get_proximos_lancamentos(INT);
