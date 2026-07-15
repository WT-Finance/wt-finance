# Out-briefing — v5.1.8 · "Última atualização" = última sincronização com o Monde

**Tipo:** PATCH · migration **ADITIVA 0183** · **SEM ADR** (refinamento) · base main @ v5.1.7.

> Após a v5.1.5, o rótulo lia `ultima_sync` = `MAX(sincronizado_em)` = a última vez que uma venda
> **mudou** — congela em janelas sem venda nova. O Yan viu "11:45" às 12:05 com o cron tendo rodado
> às 12:00 (sem venda nova → não avançou). O esperado: mostrar a última **sincronização** (avança a
> cada pull ~15min). Confirmado que o cron estava saudável (200) — era só a semântica do campo.

## Entregas

| # | |
|---|---|
| **M1** | **Migration 0183 (aditiva):** `monde_ingest_status` ganha `ultima_sincronizacao` = `max(atualizado_em)` de `monde.ingest_control` (chaves `ultimo_incremental`/`ultimo_promover` — avança a cada rodada do cron, mesmo sem mudança). Campos existentes **intocados** (`ultima_sync` segue exposto → retrocompatível). Pura `CREATE OR REPLACE` de função read-only. |
| **M2** | **Rótulo:** `carregarAcompanhamento` (fonte única de `/metas` e `/metas/tv`) lê `ultima_sincronizacao`, **fallback** a `ultima_sync`. Comentário do tipo `AcompanhamentoData.ultimaAtualizacao` atualizado. |

## Por que precisou de migration (e não só código)

O timestamp de sincronização vive em `monde.ingest_control.atualizado_em`. A RPC existente
`monde_ingest_control_get` devolve o `valor` em **texto-Postgres** (`2026-07-15 12:00:15.249-03` —
com espaço e offset de 2 dígitos), que o `fmtDataHoraLongoSP` (`new Date(iso)` + Intl) **não parseia**
→ mostraria "—". Em vez de fazer *munging* de data no cliente (proibido pela convenção — timestamptz
sempre via Intl sobre ISO), a migration expõe o timestamp como **ISO limpo** (coluna `timestamptz` →
jsonb ISO), e o app formata como sempre.

## Semântica (o que "Última atualização" significa agora)

- **Antes (v5.1.5):** última vez que um **dado mudou** (`MAX(sincronizado_em)`) — congelava em janelas quietas.
- **Agora (v5.1.8):** última **sincronização** com o Monde (`max(atualizado_em)` de `ingest_control`) —
  avança a cada ciclo do cron (~15min), refletindo "dado conferido como atual". Pedido explícito do Yan.

## Gates

`npx tsc --noEmit` **0** · `npx eslint` (arquivos alterados) **0** · `npm test` **415/415** ·
`npx next build` **OK** · migration **aditiva 0183 aplicada** (backup-gate VERDE: 45/45 tabelas,
restore-test spot ✓) + **verificada** (`monde_ingest_status().ultima_sincronizacao` = 15:15 UTC,
ISO, mais recente que `ultima_sync`).

## Parecer da revisão

**`revisor-db` (migration 0183): APROVADA** — aditiva de baixíssimo risco; `REVOKE`/`GRANT` idênticos ao
padrão da 0178, `search_path=''`, `atualizado_em` timestamptz→ISO, único consumidor (`carregar-acompanhamento`)
sem pick estrito, chaves (`ultimo_incremental`/`ultimo_promover`) avançam a cada rodada do cron.

**`revisor` (código): APROVADO com ressalvas** — 0 CRÍTICO/ALTO. Verificado: nome do campo bate, fallback
(`ultima_sincronizacao ?? ultima_sync ?? null`) e fail-safe preservados, tipagem frouxa, ISO limpo (sem
munging), avanço do timestamp ponta-a-ponta, remoção do bloqueio do cron 401 coerente (v5.1.7 já mergeada).
- **MÉDIO (endereçado):** o follow-up "teste de contrato p/ `monde_ingest_status`" (registrado na v5.1.5)
  havia sumido do rastreamento sem ser resolvido → **re-registrado** em `docs/WORKING-CONTEXT.md` § Filas ativas.
- **BAIXO (registrado):** `src/app/api/monde/ingest/route.ts:87` — `monde_ingest_control_set` não checa
  `{error}`; se falhar em silêncio, `ultimo_incremental` não avança e o rótulo "atrasa" sem o cron reportar
  erro. Pré-existente (v5.1.2), fora do escopo; hardening futuro.

## Verificação pós-deploy

Após o deploy, o rótulo em `/metas` e `/metas/tv` mostra a hora da **última sincronização** e avança a
cada ~15min (com o auto-refresh da v5.1.6, sem precisar recarregar). Cron do Monde: 200, ingerindo.

## Pendências (inalteradas)

- (seguem) `CRON_SECRET` constant-time (follow-up BAIXO); `SMTP_*`; `%Rec` no Cadastro; **Scope B** (aposentar o upload).
