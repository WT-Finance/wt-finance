-- 0053 — chore: drop RPC get_sparklines (código morto)
--
-- Removida do frontend em v3.9 (ADR-0054). Criada em 0018 e atualizada em
-- 0022. Nenhuma chamada ativa no codebase desde então.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_sparklines(text, date, date, text);
