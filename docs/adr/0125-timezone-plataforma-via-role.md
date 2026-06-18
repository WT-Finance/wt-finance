# ADR-0125 — Fuso horário da plataforma via `timezone` de role (America/Sao_Paulo)

**Data:** 2026-06-17 · **Versão:** 4.22.2 (PATCH) · **Status:** aceito

## Contexto

A sessão do Postgres (Supabase) roda em **UTC**. Funções/RPCs que derivam o "hoje" de
`CURRENT_DATE` / `now()::date` / `date_trunc('month', CURRENT_DATE)` retornavam o dia **UTC**,
que a partir das ~21h de São Paulo (UTC−3) **já é o dia seguinte**. A auditoria das definições
**vivas** do banco encontrou o padrão em ~15 funções + 1 view (`financeiro.vw_proximos_vencimentos`):
projeção do Gerencial, calendário de liquidez ("é hoje"), próximos lançamentos/casamentos, KPIs
(mês/ano corrente, dias encerrados), idade de vendas em aberto, cortes de mês de Weddings/Performance,
classificação `a_vencer`. A v4.22.1 corrigiu pontualmente a projeção (migration 0151); faltava o resto.

## Decisão

Setar `timezone = 'America/Sao_Paulo'` no **rolconfig** dos papéis que o PostgREST usa por
requisição — `anon`, `authenticated`, `service_role` (migration **0152**, `ALTER ROLE … SET timezone`).
O PostgREST aplica o rolconfig do papel da requisição a **cada chamada** (mesmo mecanismo já em uso
para `statement_timeout` — ADR-0122/migration 0145). Assim `CURRENT_DATE`/`now()` passam a refletir o
"hoje" de São Paulo em **todas** as RPCs do app — as atuais e as futuras — sem reescrever função por função.

O papel **`postgres` NÃO é alterado** (intencional): migrations e `npm run seed` rodam como `postgres`
e seguem em UTC. Migration/seed que precise do "hoje" de SP usa `(now() AT TIME ZONE 'America/Sao_Paulo')::date`
explícito.

## Alternativas consideradas

- **B — cirúrgico por função:** trocar `CURRENT_DATE`/`now()::date` por `(now() AT TIME ZONE 'America/Sao_Paulo')::date`
  em cada uma das ~15 funções + 1 view (`CREATE OR REPLACE` a partir da def viva). **Rejeitada:** muito mais
  verbosa, alta chance de esquecer uma (há split wrapper/`__nucleo`), e **função NOVA reintroduziria o bug**
  por esquecimento. Não cobre o futuro.
- **Mudar o timezone do banco/sessão default:** rejeitada — blast radius maior e fora do controle do projeto
  (config Supabase).

## Por que é seguro (auditado)

- `timestamptz` (instante absoluto) **não muda de valor** com o fuso do role — só o **offset textual** do ISO
  retornado muda (−03 vs +00). O app já exibe via `Intl`/`fmtDataSP` (instante), então a exibição não muda.
- `to_char(<date>, …)` / `<date>::text` em coluna **DATE** é **independente de fuso**. A auditoria confirmou que
  praticamente todo render de data é sobre coluna DATE (data_venda, vencimento, mes, data_evento…).
- Defaults `now()` em `criado_em`/`atualizado_em` são `timestamptz` (instantes) — inalterados.
- **Revisão adversarial em 3 dimensões** (renderização de timestamp / lógica-UTC e cargas / app-side split e
  envio de datas) → **zero regressão confirmada**.

## Consequências

- "Hoje"/"este mês" corretos (fuso SP) em toda a plataforma; RPC nova nasce correta sem esforço.
- **Reversível:** `ALTER ROLE <r> RESET timezone` volta ao default.
- Convenções `AT TIME ZONE` explícitas pré-existentes (projeção 0151, `criar_solicitacao`) ficam como
  defesa-em-profundidade (redundantes, inofensivas).
- **Pegadinha permanente** (em CLAUDE.md): migration/seed roda como `postgres` (UTC) — ali `CURRENT_DATE` cru
  ainda é UTC; usar `AT TIME ZONE` explícito quando precisar do dia de SP.
- Verificação: rolconfig confirmado nos 3 papéis; o efeito ao vivo aparece no Calendário de Liquidez
  ("é hoje") e nas telas com "hoje" (preview do PR). Mecanismo idêntico ao `statement_timeout` já provado.
