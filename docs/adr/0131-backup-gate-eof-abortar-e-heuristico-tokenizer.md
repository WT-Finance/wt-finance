# ADR-0131 — Backup-gate: EOF aborta destrutiva (fail-open) + heurístico com tokenizer (top-level)

**Status:** Aceito · **Data:** 2026-06-23 · **Versão:** v4.27.1
**Estende:** [ADR-0116](0116-backup-gate-migration-destrutiva.md) (backup-gate como rede) e [ADR-0119](0119-backup-gate-transporte-copy.md) (transporte COPY). Não muda o backup/restore-test; muda a **confirmação** (EOF) e a **classificação** (heurístico) em `scripts/db-gate/migrate.mjs`.

## Contexto

Uma investigação das frentes de fechamento pós-v4.27 mapeou dois problemas no wrapper `npm run db:migrate`:

1. **Fail-open de segurança (EOF).** O ramo destrutivo aplicava com `execFileSync('npx', ['supabase','db','push','--linked'], { stdio: 'inherit' })`, **delegando a confirmação ao prompt do próprio CLI**. Não havia guard no wrapper. Em stdin **não-TTY / EOF** (pipe, headless, CI, agente), o default do prompt do CLI **prossegue** — i.e. uma migration destrutiva poderia ser aplicada **sem humano**. A única coisa que segurava isso era o **classificador externo do harness** (que recusa `printf Y | db push`), **não o código do gate**. Segurança que depende de uma camada externa é fail-open latente.

2. **Falsos-positivos no heurístico de "destrutiva" (fricção).** A classificação rodava uma regex sobre o **texto cru do arquivo inteiro** (`migrate.mjs:31`), sem parser. Resultado: `UPDATE`/`DELETE`/`DROP` no **corpo de um `CREATE OR REPLACE FUNCTION`** (comportamento de runtime, não muda schema no apply) — e até em **comentários** — marcavam a migration como destrutiva. As migrations 0150/0153 (DML só no corpo) e 0154 (DROP FUNCTION + corpo) eram forçadas ao caminho de confirmação sem necessidade; já 0149 (UPDATE **top-level** real em linhas existentes) é um **verdadeiro** positivo.

## Decisão

### M1 — EOF aborta a destrutiva (a confirmação é do wrapper)
A confirmação de migration destrutiva passa a ser **do wrapper**, com **default ABORTAR** em `!process.stdin.isTTY` / EOF:
- **destrutiva + sem TTY/EOF →** aborta **antes do gate** (não gasta backup à toa), com mensagem clara. EOF **nunca** confirma.
- **destrutiva + TTY →** prompt explícito (`readline/promises`); só uma resposta afirmativa (`y`/`s`/`sim`/`aplicar`) aplica. Confirmado o humano no wrapper, o `db push` recebe `input:'Y\n'` (auto-responde o prompt do CLI, que o humano já confirmou).
- **aditiva →** auto-confirma (`input:'Y\n'`), **inalterado**.

Isto **inverte o default perigoso** do CLI e tira a segurança da dependência do harness externo — passa a viver no código do gate. A decisão pura é `confirmaDestrutivaEOF(isTTY, resposta)` (testável).

### M2 — Heurístico com TOKENIZER (top-level), não regex sobre texto cru
A classificação (`classificarSql`, em `scripts/db-gate/classificar.mjs`) passa a:
1. **Excisar, via TOKENIZER** (não regex), comentários (`--`, `/* */` aninhado), literais de string (`'...'` com `''`) e **corpos dollar-quoted** (`$$…$$`, `$tag$…$tag$`, tags custom; escaneia até a tag de **fechamento exata**).
2. Casar os padrões destrutivos **só no texto TOP-LEVEL** restante, por statement: `TRUNCATE`, `DROP TABLE/COLUMN/SCHEMA/VIEW/INDEX/TYPE/TRIGGER/POLICY/SEQUENCE`, `ALTER TABLE … DROP`, `UPDATE`/`DELETE FROM` top-level → **destrutiva**. `DROP FUNCTION/PROCEDURE` top-level → **warn** (troca de assinatura — nem auto-confirma cego, nem barra como destrutivo; respeita `--aditiva` com aviso). Senão → **aditiva**.
3. **Falhar FECHADO:** corpo/comentário/string não fechado (ambiguidade do tokenizer) → **destrutiva**. Nunca o contrário.

Por que **tokenizer e não regex**: o dollar-quoting do Postgres aceita tags nomeadas e literais aninhados; um regex ingênuo para "remover entre `$$`" quebra com tags nomeadas/aninhadas e pode excisar demais — **escondendo um `DROP` top-level** (falso-negativo, o pior caso). O scanner char-a-char resolve a tag de fechamento corretamente.

## Consequências

- **Positivas:** o destrutivo headless deixa de poder ser aplicado sem humano (a segurança vive no código). A fricção do falso-positivo some: `0150`/`0153`/`0156` viram aditiva, `0154` vira `warn`; `0149` e DROPs/TRUNCATE/`ALTER…DROP` reais **continuam barrados**. Tudo provado pela sonda `classificar.test.mjs` (30 casos: 0149..0158 reais + adversarial `DROP TABLE` top-level junto de `$$` com DML dentro → barra + fail-closed + EOF) e pela execução live do `--destrutiva </dev/null` (aborta sem rodar o gate). É a "execução do gate" — não há UI.
- **Preserva os verdadeiros positivos:** o refino **remove só os falsos**; em ambiguidade, falha fechado. Em nenhuma circunstância um `DROP`/`TRUNCATE` real passa como aditivo.
- **Sem mudança no backup/restore-test** (`gate.mjs`/`exportar.mjs`/`verificar.mjs` intactos) nem no fluxo aditivo. Sem migration de schema, sem efeito no app.
- **Fora de escopo (fila):** durabilidade off-machine do backup (#3) e COPY paralelo no export (#4) — não tocados.

## Alternativas consideradas

- **Manter a confirmação delegada ao CLI + confiar no harness:** rejeitado — é o fail-open; a segurança não pode depender de uma camada externa ao gate.
- **Refinar o heurístico com outra regex (remover entre `$$` por regex):** rejeitado — quebra com dollar-tags nomeadas/aninhadas e arrisca esconder um `DROP` top-level. Tokenizer char-a-char é a única forma segura.
- **Tratar `DROP FUNCTION` como destrutiva (como antes):** rejeitado — não é perda de dado; vira `warn` (olhar humano sem barrar o fluxo aditivo retrocompatível).
