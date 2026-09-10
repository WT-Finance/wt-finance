# D10 — Harness e config

Explorador D10 (Sonnet, read-only) sobre `.claude/**`, `scripts/`, `eslint.config.*`, `.mcp.json`,
`.env.example` × `_insumos/env-*.txt`, `package.json`. Skill lida: `orquestracao`. Formato: `README.md`
desta pasta. Arquivos protegidos por hook (`settings.json`, `.claude/hooks/`, `eslint.config.*`,
`tsconfig*`): toda ação é "propor diff para o humano aplicar".

| id | achado | evidência | risco | esforço | ação proposta | classe | triagem | nota |
|---|---|---|---|---|---|---|---|---|
| D10-001 | A "terceira camada" de permissões que o `CLAUDE.md` descreve (regras `allow`/`deny` explícitas, inclusive o `deny` de `npx supabase db push` cru) **não existe em nenhum settings.json real**: o do projeto só tem os 3 hooks (sem chave `permissions`); o global só tem `"permissions": {"defaultMode": "auto"}`, sem `allow`/`deny` | `.claude/settings.json:1-26`; `~/.claude/settings.json:1-57` | alto | S (ato humano) | apresentar ao Yan o diff das regras (checkpoint) OU corrigir o texto do `CLAUDE.md` se a intenção era só o classificador default; a autonomia aditiva de banco hoje depende inteiramente do classificador, sem rede declarada | decidir | | |
| D10-002 | O briefing conta "13 pastas" de skills; o diretório tem **14**: 9 de domínio + 3 rituais + `web-design-guidelines` e `web-artifacts-builder` (ambos citados por `revisor.md`/`verificador-visual.md`) | `Glob .claude/skills/*/SKILL.md` (14); `.claude/agents/revisor.md`, `verificador-visual.md` | baixo | S | nota para o `estado-do-projeto.md` | documentar | | |
| D10-003 | 6 variáveis lidas em código estão ausentes do `.env.example`: `SUPABASE_DB_URL`, `MONDE_API_URL`, `MONDE_API_KEY`, `CRON_SECRET`, `VERCEL_PROJECT_PRODUCTION_URL`, `REQUIRE_CONTRACT` — duas são segredos sem entrada de onboarding | `.env.example:1-51` (15 chaves) × `_insumos/env-lidas-no-codigo.txt` (21); `src/lib/monde/client.ts:18,23`; `src/app/api/cdi/ingest/route.ts:49`; `src/app/api/monde/ingest/route.ts:84`; `src/lib/rpc-contrato.test.ts:584,1883`; `src/lib/email/config.ts:57` | médio | S | adicionar as 6 chaves ao `.env.example` (só nome + comentário) | corrigir | | |
| D10-004 | `BYPASS_AUTH` existe no `.env.local` do Yan mas nenhum código a lê — já registrado 3× (`WORKING-CONTEXT.md:891`, briefings v5.4.1/v5.4.2) | `_insumos/env-local-chaves.txt`; grep `BYPASS_AUTH` em `src/` = 0 | baixo | S | Yan decide se remove do próprio `.env.local` (não versionado) | documentar | | |
| D10-005 | `scripts/db-gate/exportar.mjs` "unused" pelo knip tem chamador vivo via `execFileSync` em `gate.mjs` (= D1-002, confirmado independentemente) | `scripts/db-gate/gate.mjs:46` | baixo | S | nenhuma (coberto por D1-002) | documentar | | |
| D10-006 | `package.json` `"name": "wt-finance-temp"` (= D9-011); sem `engines` e sem `.nvmrc` — nenhuma pin de Node declarada | `package.json:2`; `Glob .nvmrc` = 0 | baixo | S | `name` é decisão do Yan (junto do repo); `engines.node` é independente e trivial | decidir | | |
| D10-007 | `docs/harness/` (2) e `docs/superpowers/` (3) são resíduo de investigação pré/durante a reformulação do harness (v5.3.2) — únicas citações são `briefing-v5-3-2` e ADR-0157 (histórico) | grep `docs/harness`, `docs/superpowers` | baixo | S | classificação final em D8-005 (não duplicar exclusão) | decidir | | |

## Síntese

O harness em si está coerente: os 3 hooks batem com o `CLAUDE.md` (6 alvos protegidos, varredura de `console.log`/shorthand), as 3 regras `wt/*` do ESLint existem e têm motivo de `off` documentado, os 5 agentes têm frontmatter válido com tools coerentes ao papel, e o único servidor MCP (`playwright`) tem consumidor vivo. O achado sério é de outra natureza: a "terceira camada" de permissões prometida pelo `CLAUDE.md` — incluindo o `deny` de `db push` cru — **não existe em nenhum settings.json**; a autonomia aditiva de banco depende só do classificador default. `.env.example` está desatualizado em 6 chaves, duas delas segredos.

## Contagem por classe

decidir 3 · documentar 3 · corrigir 1 · apagar 0 · simplificar 0 — **total 7**.

## Achei, não vou agir

- `scripts/` e `supabase/seed/*.ts`: cobertos por D1 (D1-002 a D1-013).
- `.claude/settings.local.json`: não existe.
- Os 6 plugins habilitados no `~/.claude/settings.json` (`github`, `supabase`, `vercel`, `telegram`, `brag`, `superpowers`) — não investigado se algum expõe permissão/MCP que interaja com o harness.
- `vercel.json` só agenda `/api/monde/ingest`; `/api/cdi/ingest` é agendado por `pg_cron` (migration 0244) — verificado, não é achado.

## Riscos fora do escopo

- **Nenhum CI de PR** (`.github/workflows` ausente): os gates dependem 100% da disciplina local antes do merge — candidato a backlog v6.
- Sem `allow`/`deny` explícitos (D10-001), qualquer mudança futura no classificador default altera silenciosamente a autonomia descrita no `CLAUDE.md`, sem que nada no repositório acuse.
