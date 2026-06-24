# WT Finance — Out-Briefing v4.27.1

**Data:** 2026-06-23 · **Branch:** `fix/v4-27-1-backup-gate` (base `main` @ v4.27.0) · **Versão:** 4.27.0 → **4.27.1** (PATCH)
**Tema:** Backup-gate — EOF aborta migration destrutiva (fail-open de segurança) + refino do heurístico (tokenizer, top-level). **Tooling de infra** (`scripts/db-gate/`). **SEM migration de schema, sem mudança no app/UI.** **ADR-0131** (estende 0116/0119). **Merge e deploy ficam com o usuário.**

## Invariantes (cumpridos)
1. **EOF → ABORTA, nunca prossegue.** No ramo destrutivo, sem TTY/EOF o gate aborta pelo **próprio código** — não mais pelo harness externo. ✓
2. **Refino não fica menos seguro.** Excisão de `$$…$$` por **TOKENIZER** (tags custom/aninhadas), não regex; **falha fechada** em ambiguidade. ✓
3. **Verdadeiros positivos preservados.** `0149` (UPDATE top-level) e DROP/TRUNCATE/`ALTER…DROP` reais seguem barrados. ✓
4. **Sem regressão.** Backup/completude/restore-test (`gate.mjs`) e o fluxo aditivo intactos. ✓

---

## M1 — EOF-abortar (`migrate.mjs`)
- A confirmação de migration destrutiva passa a ser **do wrapper**, com **default ABORTAR** em `!process.stdin.isTTY`/EOF, **antes do gate** (não gasta backup à toa).
  - **destrutiva + headless/EOF →** aborta (exit 1), mensagem clara.
  - **destrutiva + TTY →** prompt `readline/promises`; só resposta afirmativa (`y`/`s`/`sim`/`aplicar`) aplica; então `db push` recebe `input:'Y\n'` (o humano já confirmou no wrapper).
  - **aditiva →** auto-confirma (`input:'Y\n'`), **inalterado**.
- **Achado corrigido:** antes o ramo destrutivo era `db push` com `stdio:'inherit'`, delegando ao prompt do CLI — cujo default headless **prossegue** = fail-open; a segurança dependia do classificador externo do harness. Agora vive no código.
- Decisão pura testável: `confirmaDestrutivaEOF(isTTY, resposta)`.

## M2 — Refino do heurístico (`scripts/db-gate/classificar.mjs`, novo)
- `classificarSql(sql)` → `aditiva | warn | destrutiva` via **TOKENIZER** char-a-char que **excisa** comentários (`--`, `/* */` aninhado), literais de string (`'...'` com `''`) e **corpos dollar-quoted** (`$$…$$`, `$tag$…$tag$`; escaneia até a tag de fechamento **exata** — resolve tags custom/aninhadas), e casa os padrões destrutivos **só no texto top-level** (por statement).
- **Top-level:** `TRUNCATE`, `DROP TABLE/COLUMN/SCHEMA/VIEW/INDEX/TYPE/TRIGGER/POLICY/SEQUENCE`, `ALTER TABLE … DROP`, `UPDATE`/`DELETE FROM` → **destrutiva**. `DROP FUNCTION/PROCEDURE` → **warn** (troca de assinatura; respeita `--aditiva` com aviso). Senão → **aditiva**.
- **Falha FECHADA:** corpo/comentário/string não fechado → **destrutiva** (nunca esconde um DROP top-level).
- `migrate.mjs` substitui a regex inline por `heuristicaNivel()` que roda `classificarSql` por arquivo pendente e agrega pelo mais forte.
- **Correções factuais confirmadas:** `SECURITY DEFINER` não influencia (não era nem da regex antiga); `0156` já passava; `0149` é **verdadeiro** positivo (não afrouxado); os falsos reais eram `0150`/`0153` (DML só no corpo) e `0154` (DROP FUNCTION + corpo) → agora aditiva/warn.

## M3 — Fechamento
- 4.27.1 (`package.json`+lock; `version.ts` deriva). CHANGELOG, CHANGELOG_DIRETORIA (breve, sem efeito visível), **ADR-0131**, reforço no CLAUDE.md (bloco "Migration DESTRUTIVA"), este out-briefing.

---

## Migrations / ADRs
- **Migrations:** nenhuma (infra/tooling).
- **ADR-0131** — Backup-gate: EOF aborta destrutiva + heurístico com tokenizer (estende 0116/0119).

## Prova (auditoria por EXECUÇÃO do gate — não há UI)
- **Sonda** `scripts/db-gate/classificar.test.mjs` (**30 casos**, roda em `npm test`; `vitest.config` passou a incluir `scripts/**/*.test.mjs`):
  - **Migrations reais 0149..0158:** 0149 → destrutiva; 0150/0151/0152/0153/0155/0156/0157/0158 → aditiva; 0154 → warn.
  - **Adversarial:** `DROP TABLE` top-level **junto** de um `$$` com `UPDATE` dentro → **destrutiva** (o tokenizer não esconde o DROP top-level); DML só no corpo → aditiva; DROP em comentário/string → ignorado; tag custom `$body$` e tags aninhadas → corpo excisado; corpo/comentário **não fechado → destrutiva** (falha fechada); `TRUNCATE`/`ALTER…DROP COLUMN`/`UPDATE`/`DELETE` top-level → destrutiva; `DROP FUNCTION` → warn; nome de função com "update" não é falso-positivo.
  - **EOF (3 caminhos):** headless → false; TTY+afirmativo → true; TTY+vazio/negativo/null → false.
- **Live:** `node scripts/db-gate/migrate.mjs --destrutiva </dev/null` → **ABORTA (exit 1) sem rodar o gate/rede** (prova do caminho headless).

## Gate de fechamento
- `npx tsc --noEmit` → **0** (scripts `.mjs` fora do programa tsc; src intacto).
- `npm test` → **246/246** (15 arquivos; inclui a sonda do db-gate, 30).
- `npm run lint` (changed db-gate files) → **limpo**; `eslint src` → **12 problemas pré-existentes** (react-hooks, idênticos ao `main` — não tocados nesta versão; ver v4.27 out-briefing).
- `npm run build` não aplicável ao escopo (sem mudança no app); src inalterado e tsc/lint verdes.

## Achados / fora de escopo (registro)
1. **Durabilidade off-machine do backup (#3)** e **COPY paralelo no export (#4)** — fila do backup-gate, não tocados.
2. **Os 12 lint react-hooks** — patch próprio (v4.27.2, com checkpoint), fora daqui.
3. O `warn` (troca de assinatura) **respeita `--aditiva`** (aplica com aviso, não barra) e, no default sem flag, cai em destrutiva como antes. Decisão registrada no ADR-0131.

## Arquivos
- `scripts/db-gate/classificar.mjs` — **novo:** tokenizer + `classificarSql` + `confirmaDestrutivaEOF` (M1/M2).
- `scripts/db-gate/classificar.test.mjs` — **novo:** sonda (30 casos).
- `scripts/db-gate/migrate.mjs` — EOF-abort + wrapper confirmation + `heuristicaNivel` via classificador.
- `vitest.config.ts` — include `scripts/**/*.test.mjs`.
- `package.json`, `package-lock.json` — 4.27.1.
- `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `docs/adr/0131-…md`, `CLAUDE.md`, este out-briefing.
