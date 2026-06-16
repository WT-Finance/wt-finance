-- ---------------------------------------------------------------------------
-- 0145 — fix(v4.20.1): timeout do service_role + "última atualização" das cargas.
--
-- DECLARAÇÃO (ADITIVA / retrocompatível, regime autônomo sob backup-gate):
--   • O que faz: (1) remove o statement_timeout do service_role; (2) cria 2 RPCs de
--     status (count + última atualização) para as bases financeiras.
--   • Retrocompatível com a `main` viva: só AFROUXA timeout e ACRESCENTA funções.
--   • NÃO escreve em dados pré-existentes (sem UPDATE/DELETE/DROP/TRUNCATE).
--
-- Contexto (ADR-0122):
--   O service_role estava com `rolconfig = null` → o PostgREST aplicava o DEFAULT do
--   banco (statement_timeout = 120s) às requisições dele. `promover_carga_vendas`
--   (TRUNCATE + copia staging→raw 45k + transform + dims + refresh de 4 MVs, tudo numa
--   transação) passava de 120s → `57014 canceling statement due to statement timeout`,
--   travando o upload de Vendas. O timer é armado no statement externo do PostgREST e
--   NÃO pode ser desarmado de dentro da função (testado: SET LOCAL / atributo SET na
--   função não surtem efeito no statement em curso). A alavanca é o nível do role.
--   O CLAUDE.md já documentava "service_role = sem limite" — esta migration RESTAURA isso.
-- ---------------------------------------------------------------------------

-- 1) service_role volta a NÃO ter limite de statement (admin-only; cargas pesadas).
--    Runaway é limitado na prática pelo timeout da função serverless (Vercel ~300s).
ALTER ROLE service_role SET statement_timeout = 0;

-- 2) Status das bases financeiras p/ o card de Uploads (total + última atualização).
--    Antes, getLancamentosFinanceiroStatusAction / getFluxoCaixaTitulosStatusAction
--    fixavam ultima_atualizacao = null → o card mostrava "Nunca". A fonte do carimbo é
--    `carregado_em` das tabelas raw (já populado em cada carga).
CREATE OR REPLACE FUNCTION public.status_lancamentos_financeiro()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'total',              (SELECT count(*)          FROM raw.lancamentos),
    'ultima_atualizacao', (SELECT max(carregado_em) FROM raw.lancamentos)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.status_lancamentos_financeiro() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.status_lancamentos_financeiro() TO service_role;

CREATE OR REPLACE FUNCTION public.status_fluxo_caixa_titulos()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'total',              (SELECT count(*)          FROM raw.fluxo_caixa_titulos),
    'ultima_atualizacao', (SELECT max(carregado_em) FROM raw.fluxo_caixa_titulos)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.status_fluxo_caixa_titulos() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.status_fluxo_caixa_titulos() TO service_role;

-- PostgREST: recarrega config (aplica o novo statement_timeout do role) e schema (expõe as RPCs novas).
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
