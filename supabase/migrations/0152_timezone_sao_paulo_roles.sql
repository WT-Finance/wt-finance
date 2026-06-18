-- ---------------------------------------------------------------------------
-- 0152 — v4.22.2: "hoje" de São Paulo em TODA a plataforma (fim do viés UTC).
--
-- CAUSA-RAIZ: a sessão do banco roda em UTC. `CURRENT_DATE` / `now()::date` /
-- `date_trunc('month', CURRENT_DATE)` em ~15 RPCs + a view financeiro.vw_proximos_vencimentos
-- usavam o "hoje" de UTC — adiantado no fim da tarde de São Paulo (UTC−3). Sintoma visível:
-- a projeção do Fluxo de Caixa Gerencial começava em "amanhã" (corrigida pontualmente na 0151).
--
-- FIX SISTÊMICO: setar `timezone = 'America/Sao_Paulo'` nos papéis que o PostgREST usa por
-- requisição (anon, authenticated, service_role). O PostgREST aplica o rolconfig do papel da
-- requisição a CADA chamada (mesmo mecanismo já provado com `statement_timeout` na migration 0145:
-- anon=3s / authenticated=8s / service_role=0). Assim `CURRENT_DATE`/`now()` passam a refletir SP
-- em TODAS as RPCs — atuais e futuras — sem precisar reescrever função por função.
--
-- DECLARAÇÃO: ADITIVA / retrocompatível e REVERSÍVEL (`ALTER ROLE <r> RESET timezone`). Sem DDL de
-- tabela, sem escrita em dado pré-existente. `timestamptz` continua armazenado/retornado como o
-- MESMO instante (só muda o offset textual do ISO; o app converte por Intl/`fmtDataSP`); `to_char`/
-- `::text` de coluna DATE é independente de fuso. Auditoria das definições VIVAS do banco +
-- revisão adversarial (renderização / lógica-UTC-cargas / app-side) → ZERO regressão confirmada.
-- O papel `postgres` NÃO é alterado de propósito: migrations/seed seguem em UTC; o caminho vivo
-- do app é authenticated (UI) e service_role (cargas). ADR-0125.
-- ---------------------------------------------------------------------------

ALTER ROLE anon          SET timezone = 'America/Sao_Paulo';
ALTER ROLE authenticated SET timezone = 'America/Sao_Paulo';
ALTER ROLE service_role  SET timezone = 'America/Sao_Paulo';

NOTIFY pgrst, 'reload config';
