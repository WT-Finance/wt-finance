# WT Finance — Out-Briefing · Backup-gate via COPY (conexão Postgres direta)

**Data:** 2026-06-15 · **Branch:** `chore/db-gate-copy` (base `main`) · **Tipo:** tooling (chore)
**Sem** bump de versão de app · **sem** entrada no CHANGELOG_DIRETORIA (sem efeito visível à diretoria) · **sem** migration.
**Merge e deploy ficam com o usuário.**

## Objetivo (atingido)
Trocar o **transporte** do backup-gate de Management API (um-statement-por-chamada, ~4 min, engasga quando a API degrada) por **`COPY` via conexão Postgres direta** (pooler Supavisor, session mode). A **lógica** do gate, o **escopo** (rede de recuperação, não autorização) e a **confirmação humana de migration destrutiva** ficam intactos. ADR-0119 (estende ADR-0116).

## Fases

### Fase 1 — MEDIR (gate de decisão) → PROSSEGUIR
Restore-test real via COPY de `analytics.fato_venda` (27.305 linhas) num schema descartável, prod × restaurado (count+checksum):
- export `COPY TO`: **442 ms** (1,75 MB) · restore `COPY FROM`: **440 ms** · round-trip **882 ms**.
- vs baseline Management API: export da mesma tabela **9,77 s** (~22×). prod == restaurado (`291ee7c9`). **Win confirmado.**

### Fase 2 — Reescrever a camada de I/O (só transporte)
`scripts/db-gate/lib.mjs`: pool `pg` (de `SUPABASE_DB_URL`, `sslmode`, fechado no `finally`) + helpers `pgCopyOut`/`pgCopyIn` (streaming) + leituras/DDL por query direta. `exportar.mjs` → `.copy` (COPY text) + manifest com column-list. `verificar.mjs` → restore por `COPY FROM` (sem parsing de INSERT/batelagem). `gate.mjs` → `await` + `closePool`. `migrate.mjs` **inalterado** (a barreira destrutiva não muda). Removidos: `sqlLit`, `insertsParaScratch`, batelagem de API.

### Fase 3 — Adversarial na versão COPY: **9/9 PASS**
| Caso | Resultado |
|---|---|
| Controle positivo (backup bom) | ✓ VERDE (mesmos checksums da versão API) |
| Incompleto: `.copy` ausente | ✓ VERMELHO |
| Incompleto: tabela viva fora do manifest | ✓ VERMELHO |
| Drift por **count** (linha a menos) | ✓ VERMELHO (prod 27305 ≠ rest 27304) |
| Drift por **checksum** (mesmo count) | ✓ VERMELHO (`291ee7c9` ≠ `a55577fa`) |
| Cleanup após sucesso | ✓ scratch dropado |
| Cleanup após falha de restore | ✓ scratch dropado |
| Bloqueio (`gate.mjs` red) | ✓ exit=1 (push abortado) |
| Cleanup final (pós-bateria) | ✓ nenhum `gate_scratch%` residual |

Comparação **produção × restaurado** (não-circular) preservada. Pool fechado mesmo em falha (processo não pendura). Guarda scratch-only agora **estrutural** (COPY só atinge a tabela nomeada).

## Ganho medido (end-to-end)
| | Management API | COPY (pooler) | Ganho |
|---|---|---|---|
| **Restore-test SPOT (4 tabelas-chave)** | **228 s** | **2,8 s** | **~80×** |
| Gate completo (backup 38 tabelas + spot) | vários min | **43,9 s** | ~ordem de grandeza |

## Colunas geradas (§4.5)
Tratadas por **column-list** (`is_generated='NEVER'`) no `COPY TO/FROM` + scratch `LIKE … INCLUDING GENERATED`. `analytics.dim_operacao_weddings` (tem geradas) restaurou com **checksum idêntico** (`26c86b3d`). Resolve o bug histórico de forma estrutural.

## Conectividade / credencial
Pooler `aws-1-sa-east-1.pooler.supabase.com:5432` (session, IPv4) alcançável do WSL2; conexão direta `db.<ref>` é IPv6-only (fora). `SUPABASE_DB_URL` lida do `.env.local` (`.gitignore` cobre `.env*` — confirmado) — **nunca logada, nunca commitada**. SSL `rejectUnauthorized:false` (host fixo). Sem a var, o gate aborta com erro claro.

## Gates do projeto
`npx tsc --noEmit` **0** · `npm run lint` **13** (baseline pré-existente; **nenhum** `scripts/db-gate` flagueado — zero novos) · `npx next build` **limpo** · `npm test` **verde** (25,85 s). `node --check` nos 4 scripts ✓.

## Decisões de processo (inalteradas — registradas)
- **Confirmação humana de migration DESTRUTIVA permanece** (ADR-0116). Esta missão só deixa a rede mais rápida; não remove barreira. `migrate.mjs` intocado.
- Formato do backup mudou (`.sql` → `.copy`); recuperação agora via `COPY FROM` + reset de sequências — documentado no runbook. Backups `.sql` antigos não são lidos pelo verificador novo (completude acusaria `.copy` ausente).

## Arquivos
- `scripts/db-gate/lib.mjs`, `exportar.mjs`, `verificar.mjs`, `gate.mjs` (reescrita de I/O).
- `package.json` + `package-lock.json` (`pg`, `pg-copy-streams` em devDependencies).
- `docs/adr/0119-backup-gate-transporte-copy.md` (novo), `docs/runbooks/db-backup-gate-runbook.md` (atualizado).
- `migrate.mjs` **NÃO** alterado.

## Follow-ups (registrados, fora do escopo)
- Restore-test **completo** (`--full`, 38 tabelas) ficou barato (~dezenas de s) → candidato a virar default.
- Export poderia **paralelizar** tabelas pelo pool (~40 s → poucos s).
- Durabilidade off-machine dos backups (bucket privado encriptado) — segue pendente.

---
**PR:** `chore/db-gate-copy` → `main`. Merge e deploy ficam com o usuário.
