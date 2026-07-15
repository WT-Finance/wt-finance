# Out-briefing — v5.1.7 · Cron do Monde bloqueado pelo proxy (401) — fix

**Tipo:** PATCH · **SEM migration** · **ADR-0153** (emenda o ADR-0109) · base main @ **v5.1.6**.

> A causa do cron em 401 **não era o secret** (o Yan já igualou `CRON_SECRET` Vercel=Vault). Era o
> `proxy.ts` (middleware) cortando `/api/monde/ingest` por falta de sessão **antes** do handler — a
> checagem do `CRON_SECRET` (que vive no handler) nunca rodava. Bug latente desde a v5.1.2.

## Diagnóstico (como se chegou à causa-raiz)

O corpo do 401 recorrente do cron (via `net._http_response`) era **`{"error":"AUTH_NECESSARIA"}`**,
JSON, servidor Vercel `gru1` — string que nasce em **`src/proxy.ts:48`** (o ramo de API sem sessão).
**Não** era HTML de Deployment Protection do Vercel (isso seria SSO). Logo: o request do `pg_cron`
(só `Authorization: Bearer <CRON_SECRET>`, sem cookie) morria na **camada 1** (proxy), nunca chegando
ao handler que checa o `CRON_SECRET`. Confirmado que o `proxy.ts` cobre `/api/monde/ingest` (o matcher
só exclui assets).

## O que foi entregue

| # | Entrega |
|---|---|
| **1** | **`src/proxy.ts`** — conjunto **`API_AUTH_PROPRIA = new Set(['/api/monde/ingest'])`**; o guard de sessão passa a ter `&& !API_AUTH_PROPRIA.has(pathname)`. A rota deixa de exigir sessão **no middleware** e passa ao handler, que autentica (`CRON_SECRET` OU `requireAreaApi(['admin/uploads'])`). |
| **2** | **ADR-0153** — emenda o ADR-0109: exceção explícita/auditável da camada 1 para rotas de API com auth própria. |

## Segurança (por que é seguro)

A rota **continua protegida** — o handler já fazia (e continua fazendo) a auth de duas portas:
`CRON_SECRET` (cron) ou sessão admin via `requireAreaApi(['admin/uploads'])`, que **re-valida a
sessão por conta própria** (não depende do proxy). O middleware apenas **duplicava** essa checagem
para esta rota. Nenhuma outra rota muda; páginas não são afetadas (só o ramo `/api/`).

## Gates

`npx tsc --noEmit` **0** · `npx eslint` (arquivos alterados) **0** · `npm test` **415/415** ·
`npx next build` **OK**. **Parecer do `revisor`: APROVADO** (0 CRÍTICO/ALTO/MÉDIO; 1 BAIXO pré-existente, registrado abaixo). Sem migration → `revisor-db` não se aplica.

## Parecer da revisão (revisor)

**APROVADO** — 0 CRÍTICO/ALTO/MÉDIO. Verificação cética de segurança confirmou: a rota **continua
protegida** (o handler autentica em todos os caminhos — `CRON_SECRET` ou `requireAreaApi(['admin/uploads'])`,
que re-valida a sessão **independentemente** do proxy); carve-out **mínimo** (match exato de path —
`/api/monde/ingest/x` segue exigindo sessão; a query string não entra no `pathname`); GET/POST autenticam
**antes** de qualquer efeito colateral; sem regressão (`ehPublica` e `config.matcher` intocados).

**BAIXO (pré-existente, follow-up):** a comparação do `CRON_SECRET` no handler (`route.ts:49`) não é
constant-time — timing attack teórico. Já existia desde a v5.1.2 (fora do diff desta missão); registrado
para hardening futuro (`crypto.timingSafeEqual`), não urgente (secret protegido por HTTPS/Vault).

## Verificação pós-deploy (Yan)

Após o merge + deploy da v5.1.7, na próxima virada do `*/15`:
```sql
select status_code, created from net._http_response order by created desc limit 3;   -- deve virar 200
select public.monde_ingest_status()->>'ultima_sync';                                 -- avança p/ ~agora
```
Se ainda vier 401 depois disso, aí sim o `CRON_SECRET` (Vercel) ≠ Vault (mas foi confirmado igual).

## Pendências (inalteradas)

- (após esta) confirmar o **200** do cron e o `ultima_sync` avançando.
- (seguem) `SMTP_*`; `%Rec` no Cadastro; **Scope B** (aposentar o upload).
