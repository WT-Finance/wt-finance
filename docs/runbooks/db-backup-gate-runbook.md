# Runbook — Backup-gate de migrations

O backup-gate é uma **rede de recuperação** que roda **antes** de aplicar migration em produção (sem
staging). Bloqueia se o backup não estiver completo + restaurável + fiel à produção. **NÃO substitui a
confirmação humana de migration destrutiva** — é rede, não autorização. O `db push` cru pula a rede; use
o wrapper.

**Transporte (ADR-0119):** o gate fala com produção via **`COPY` por conexão Postgres direta** (pooler
Supavisor, **session mode**), não mais pela Management API. A credencial é `SUPABASE_DB_URL` (connection
string do Session pooler, com senha, `sslmode=require`) lida do **`.env.local`** — **nunca commitada**
(`.gitignore` cobre `.env*`) nem logada. Sem `SUPABASE_DB_URL`, o gate aborta com erro claro. (A conexão
direta `db.<ref>` é IPv6-only e não funciona do WSL2; o pooler é IPv4.)

## Como aplicar uma migration

```bash
# Aditiva / retrocompatível (CREATE, ADD COLUMN anulável, RPC nova, índice, GRANT/REVOKE):
npm run db:migrate -- --aditiva --label pre-vX-Y      # gate verde ⇒ aplica (auto)

# Destrutiva (DROP / TRUNCATE / ALTER que remove/reescreve coluna ou dado; UPDATE/DELETE):
npm run db:migrate -- --destrutiva --label pre-vX-Y   # gate verde ⇒ aplica COM confirmação humana

# Sem flag → trata como destrutiva (exige confirmação). Heurística: se a migration pendente cheira
# a destrutiva, exige confirmação mesmo sob --aditiva.
```

O wrapper: **(1)** gera backup do dia em `~/wt-finance-backups/<AAAA-MM-DD>-<label>/`, **(2)** roda o gate
(completude + restore-test SPOT do subconjunto-chave), **(3)** se verde: aditiva **aplica**; destrutiva
**pede a confirmação humana** no prompt do `db push` (não auto-confirma). Vermelho → aborta, **nada** é aplicado.

- `--reuse <dir>` → re-verifica um backup existente sem gerar outro (re-run / diagnóstico).
- O restore-test do gate é o **subconjunto-chave** (`KEY_TABLES` em `verificar.mjs`). O modo **completo**
  (`--full`, todas as tabelas) é follow-up — mais lento.

Só verificar, sem aplicar:
```bash
npm run db:gate -- --label pre-vX-Y           # backup + gate (rede), sem push
node scripts/db-gate/verificar.mjs <dir>      # re-verifica um backup (spot); --mode=full p/ completo
```

## Como ler um relatório VERMELHO

O gate imprime um relatório e grava `gate-report.json` no diretório do backup. Vermelho vem com
o(s) **motivo(s)**:
- `tabela(s) viva(s) ausente(s) do backup` → o exportador não cobriu uma tabela nova → backup
  **incompleto**. Conferir os schemas em `scripts/db-gate/lib.mjs` (`SCHEMAS`).
- `arquivo .copy ausente para: …` → o `.copy` de uma tabela do manifest sumiu do diretório.
- `export incompleto (ok=false)` → o export parou no meio (linhas do `.copy` ≠ count da origem).
- `<tabela>: prod(…) ≠ restaurado(…)` → o restaurado **não bate** com a produção viva (count ou
  checksum) → backup não é fiel (corrompido, truncado, ou produção mudou após o dump).
- `<tabela>: falha no restore-test — …` → erro ao recriar/inserir no schema descartável.

**Vermelho = não aplique.** Refaça o backup, investigue a causa, só então reaplique.

## Como recuperar a partir de um backup (após uma destrutiva dar errado)

O backup agora é **COPY text format** (`<dir>/data/<schema>.<tabela>.copy`) + `manifest.json` (com a
**column-list** não-gerada por tabela). Recuperação = `TRUNCATE` da tabela original + `COPY FROM` do
`.copy` + reset de sequências. O primitivo `pgCopyIn(destFq, cols, arquivo)` de `lib.mjs` faz o
`TRUNCATE`+`COPY FROM` (em emergência pode apontar para a tabela **original**, não o scratch). Procedimento
mínimo por tabela (Node, na worktree/repo, com `SUPABASE_DB_URL` no `.env.local`):

```js
// node --input-type=module (uma tabela; FK: restaure na ordem de dependência ou ajuste)
import { pgCopyIn, getPool, closePool } from './scripts/db-gate/lib.mjs'
const fq = 'analytics.fato_venda'
const cols = /* manifest.tabelas[fq].colunas */ ['...']
try {
  await pgCopyIn(fq, cols, `${process.env.HOME}/wt-finance-backups/<dir>/data/${fq}.copy`)
  // reset de sequências (identidade/serial), se houver:
  await getPool().query(`SELECT setval(pg_get_serial_sequence('${fq}','<idcol>'), coalesce((select max("<idcol>") from ${fq}),0)+1, false)`)
} finally { await closePool() }
```

O `.copy` exclui colunas **geradas** (o schema as recomputa no `COPY FROM`). Tabelas com FK: restaurar na
ordem de dependência (ou `TRUNCATE … CASCADE` + restaurar o grafo). As MVs/derivadas regeneram via as RPCs
de recuperação (ver CLAUDE.md › dim_data). O gate **prova** que o backup é restaurável; a recuperação em si
é um procedimento manual guiado pelos mesmos primitivos.

## Sensibilidade e local dos artefatos

- O dump contém **todo o dado**, incluindo `app`/auth/RBAC — é o **artefato mais sensível** do
  projeto. Vive **só** em `~/wt-finance-backups/` (fora do repositório; **nunca** commitar).
- **Durabilidade (assunção atual / risco residual):** os backups vivem apenas na máquina local —
  se a máquina morrer, perdem-se. Cópia para destino durável (bucket privado encriptado) é
  **follow-up** decidido pelo Yan; até lá, o gate protege contra migration ruim, não contra perda
  da máquina.

## Diagnosticar falha de conexão

O gate agora depende do pooler. Se abortar antes de exportar/verificar:
- `SUPABASE_DB_URL ausente no .env.local` → a credencial não está no `.env.local`. Pegue a connection
  string em Supabase → Database → **Session pooler** (porta 5432, com `?sslmode=require`) e ponha no `.env.local`.
- erro de conexão/timeout (`ENOTFOUND`/`ETIMEDOUT`/`ECONNREFUSED`) → checar alcance do pooler:
  `nc -zv aws-1-sa-east-1.pooler.supabase.com 5432`. **Não** use a conexão direta `db.<ref>` (IPv6-only,
  fora do WSL2). Erro de TLS → confirmar `sslmode=require` na string (o gate usa `rejectUnauthorized:false`).
- erro de auth → senha errada na connection string (rotacionada no dashboard?). Atualize o `.env.local`.

## Duração e escala (transporte COPY — ADR-0119)

- Backup do dia (38 tabelas, COPY TO): **~40 s** (sequencial).
- **Restore-test SPOT (subconjunto-chave): ~2,8 s** medido (vs ~228 s pela Management API antes — ~80×).
  **Gate completo (backup + spot): ~44 s.** **Falha rápido** em backup incompleto (sem restaurar).
- **Sem dependência da Management API** no caminho do gate → não engasga mais quando ela degrada.
- **Follow-ups:** o modo **completo** (`--full`, 38 tabelas) ficou barato (~dezenas de s) — candidato a
  default. O export poderia **paralelizar** tabelas pelo pool (cairia de ~40 s para poucos s). Durabilidade
  off-machine dos backups segue como follow-up (acima). Decisões do Yan.
