# ADR-0119 — Backup-gate: transporte via COPY (conexão Postgres direta, pooler)

**Status:** Aceito (chore, 2026-06-15)
**Estende:** ADR-0116 (backup-gate / migration destrutiva). Relacionado: ADR-0114 (janela anon).
**Escopo:** tooling (sem versão de app, sem CHANGELOG_DIRETORIA). Sem migration.

## Contexto

O backup-gate (ADR-0116) provava a rede de recuperação via **Management API** (`npx supabase db query --linked`, um-statement-por-chamada). Lento e frágil: o restore-test SPOT (4 tabelas-chave) levava **~228 s** e *engasgava* quando a Management API degradava — a ponto de o gate ter sido contornado (`db push` direto) na v4.18. A lógica do gate é sólida; o gargalo era o **transporte**.

A investigação de 2026-06-14/15 (somente-leitura) confirmou: o **pooler Supavisor é alcançável do WSL2** por IPv4 (`aws-1-sa-east-1.pooler.supabase.com`, session mode porta 5432), fala Postgres+SSL, e `pg`/`pg-copy-streams` instalam. A **conexão direta** `db.<ref>.supabase.co` é **IPv6-only** → inalcançável do WSL2 (fora). Pré-requisito provisionado pelo Yan: `SUPABASE_DB_URL` (connection string do Session pooler, com senha, `sslmode=require`) no `.env.local`.

## Decisão

**Trocar o transporte do gate de Management API para `COPY` via conexão Postgres direta (pooler, session mode).** A **lógica não muda**; só o I/O em `scripts/db-gate/lib.mjs`:

- **`pgCopyOut(fqtn, cols, dest)`** — export via `COPY <tabela> (<colunas não-geradas>) TO STDOUT` (streaming).
- **`pgCopyIn(destFq, cols, src)`** — restore via `COPY ... FROM STDIN` (streaming) num schema descartável.
- **Leituras** (`tabelasVivas`, `colunasNaoGeradas`, `contaEChecksum`) e DDL do scratch passam por queries `pg` diretas. Pool aberto sob demanda, **fechado no `finally`** de cada entrypoint (sem conexão pendurada).

### Por que **session mode** (5432), não transaction (6543)
O restore-test é **multi-statement com estado de sessão**: `CREATE SCHEMA scratch` → `CREATE TABLE … (LIKE … INCLUDING GENERATED)` → `COPY FROM` → `SELECT` de comparação → `DROP SCHEMA`. Transaction mode (6543) serviria a um `COPY` avulso, mas não ao fluxo encadeado. A `pooler-url` da CLI já aponta 5432.

### Colunas geradas — resolvido de forma estrutural
`COPY <tabela> (<colunas NÃO-geradas>) TO/FROM` + scratch `LIKE … INCLUDING GENERATED` (recomputa as geradas). A column-list (de `information_schema.columns WHERE is_generated='NEVER'`) substitui o filtro campo-a-campo do exportador via API e cobre o bug histórico das geradas (`dim_operacao_weddings.resultado_caixa/ncg`) **de forma uniforme**. Verificado: `dim_operacao_weddings` restaura com **checksum idêntico** (`26c86b3d`).

### Credencial e SSL
`SUPABASE_DB_URL` lida do `.env.local` (coberto por `.gitignore`, **nunca logada/commitada**). É um **pré-requisito novo**: o gate antes só usava o access-token (`sbp_`) da Management API; agora exige a senha do DB. SSL: `rejectUnauthorized: false` (TLS do pooler com host fixo da connection string; tráfego já cifrado).

### Robustez
Queries (SELECT/DDL) re-tentam com backoff (hiccup transitório do pooler). **`COPY` NÃO re-tenta** — falha → **vermelho** (conservador): um falso-vermelho é re-rodável; retry mid-stream não vale o risco no coração do gate.

## Ganho medido

| | Management API | COPY (pooler) | Ganho |
|---|---|---|---|
| Restore-test SPOT (4 tabelas) | **228 s** | **2,8 s** | **~80×** |
| Round-trip de 1 tabela (`fato_venda`, 27.305) | export 9,77 s | export+restore **882 ms** | ~22× no export |
| Gate completo (backup 38 tabelas + spot) | vários min | **43,9 s** | ~ordem de grandeza |

Eliminada a dependência da Management API no caminho do gate (não engasga mais quando ela degrada).

## O que PERMANECE intacto (verificado, não herdado)
Bateria adversarial **re-rodada na versão COPY — 9/9 PASS**: controle positivo VERDE (mesmo veredito/checksums da versão API); incompleto (`.copy` ausente / tabela viva fora do manifest) → VERMELHO; drift por **count** e por **checksum** (mesmo count) → VERMELHO; **cleanup** do scratch após sucesso E após falha; **bloqueio** (`gate.mjs` red → exit 1 → `db push` abortado). Comparação **produção × restaurado** (não-circular) preservada. A guarda "scratch-only" virou **estrutural** (o `COPY` só atinge a tabela nomeada do scratch — não há SQL de INSERT a fiscalizar; `insertsParaScratch`/batelagem/`sqlLit` foram removidos).

**A confirmação humana de migration DESTRUTIVA permanece** (ADR-0116 inalterado): esta mudança só deixa a **rede mais rápida**, não remove barreira. `migrate.mjs` não mudou.

## Consequências
- `pg` + `pg-copy-streams` em `devDependencies` (tooling; o app não os importa).
- Formato do backup: `.sql` (INSERT, aplicável via API) → **`.copy`** (COPY text) + `manifest.json` com a column-list por tabela. **Recuperação** agora é via `COPY FROM` (pg) + reset de sequências por `max(coluna)` — ver runbook. Backups `.sql` antigos não são lidos pelo verificador novo (a completude acusa `.copy` ausente).
- I/O do gate virou **assíncrona** (pg é async); `gate.mjs`/`verificar.mjs` awaitam + fecham o pool.
- **Follow-ups:** restore-test COMPLETO (`--full`, 38 tabelas) agora é barato (~dezenas de s) — candidato a virar default; export poderia paralelizar tabelas pelo pool para cair de ~40 s para poucos s.
