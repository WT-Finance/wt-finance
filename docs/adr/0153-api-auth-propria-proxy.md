# ADR-0153 — Rotas de API com auth própria são isentas do portão de sessão do proxy (emenda ao ADR-0109)

- **Data:** 2026-07-15
- **Status:** aceito
- **Versão:** v5.1.7

## Contexto

O ADR-0109 (v4.13) estabeleceu o enforcement de auth em 4 camadas. A **camada 1** é o `proxy.ts`
(middleware Next 16): exige **sessão** em toda rota não-pública (páginas → `/login`; APIs → `401`
JSON `{"error":"AUTH_NECESSARIA"}`).

A rota `/api/monde/ingest` (v5.1.2) foi desenhada para autenticar **no próprio handler**, com duas
portas: `CRON_SECRET` (cron) **ou** sessão admin (`requireAreaApi(['admin/uploads'])`). Mas ninguém
a isentou do `proxy.ts`, e o matcher do proxy a cobre. Resultado: o request do `pg_cron` — que envia
só `Authorization: Bearer <CRON_SECRET>`, **sem cookie de sessão** — era cortado pelo proxy com 401
**antes** de chegar ao handler; a checagem do `CRON_SECRET` **nunca executava**. Bug latente desde a
v5.1.2 — o cron do Monde nunca ingeriu por essa via (o Cron da Vercel teria o mesmo destino).

Diagnóstico (v5.1.7): o corpo do 401 recorrente do cron era **JSON do app** (`{"error":"AUTH_NECESSARIA"}`,
nascido em `proxy.ts`), **não** HTML de Deployment Protection do Vercel — logo o bloqueio era do
middleware, não de infra nem do valor do secret (que o Yan já havia igualado Vercel=Vault).

## Decisão

Introduzir em `proxy.ts` um conjunto **`API_AUTH_PROPRIA`** — rotas de API que fazem a **própria**
autenticação no handler. Para elas o middleware **NÃO exige sessão** (deixa passar); o handler
autoriza. Primeiro membro: **`/api/monde/ingest`**.

```ts
const API_AUTH_PROPRIA = new Set(['/api/monde/ingest'])
// ...
if (!user && !ehPublica(pathname) && !API_AUTH_PROPRIA.has(pathname)) { /* 401 / redirect */ }
```

## Consequências

- A rota **segue protegida** — pelo handler: `CRON_SECRET` (cron) OU `requireAreaApi(['admin/uploads'])`
  (sessão admin, que **re-valida a sessão independentemente** do middleware). O proxy apenas **duplicava**
  essa checagem; removê-lo para esta rota **não abre acesso**.
- O cron do Monde passa a **alcançar o handler** → autentica por `CRON_SECRET` → 200 (com o secret
  Vercel=Vault já acertado). A ingestão de 15min volta a rodar.
- **Padrão** para rotas de API com auth própria futuras (webhooks, crons): entram em `API_AUTH_PROPRIA`
  em vez de depender de sessão no middleware. A camada 1 segue **fechada por default** — só as rotas
  listadas escapam, e **apenas** porque autenticam no handler. A lista é a superfície auditável.
- **Emenda o ADR-0109:** a camada 1 ganha uma exceção explícita, nomeada e auditável para auth própria
  de API. Não afeta páginas (só o ramo `/api/`).
