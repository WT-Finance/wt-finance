# WT Finance — Out-Briefing v4.27.0

**Data:** 2026-06-23 · **Branch:** `feat/v4-27-coercao-lint` (base `main` @ v4.26.0) · **Versão:** 4.26.0 → **4.27.0** (MINOR)
**Tema:** Coerção numérica — convergência ao canônico (`@/lib/carga/coercao`) + guard-rail de lint. **SEM migration, SEM frente de dado.** **ADR-0130** (operacionaliza a regra do `coercao.ts`; cita ADR-0099 e o bug do saldo v4.23.1). **Merge e deploy ficam com o usuário.**

## Invariante central
**Estender o `toNum` NÃO regride nada; o histórico está íntegro (provado).** O traçado pré-versão confirmou: `raw.vendas_excel` = R$ 182.631.203,48 batendo com `analytics.mv_vendas_diarias`; zero linhas 1000× menores. Dívida latente, não incêndio → **só código**, nenhum `UPDATE`/`DELETE`. As 2 reimplementações de coerção convergem ao canônico (puristas) e o lint passa a impedir uma 3ª.

---

## M1 — Vendas: `toNumStr` → `toNum` canônico (`240083e`)
- `vendas-parser.ts:toNumStr` (o **único `parseFloat`** do app) removido; `valor_total`/`receitas` usam `toNum` de `@/lib/carga/coercao`, mantendo **`string|null`** (`const n = toNum(v); n===null?null:String(n)`) — o staging casta `(linha->>'valor_total')::numeric`, **paridade preservada**.
- **Sem regressão no caminho vivo:** a UI lê `sheet_to_json(header:1)` → **número nativo**, e `String(número)` round-trips idêntico ao `toNumStr` antigo. Ganho de robustez: string BR com milhar, que o `toNumStr` ingênuo corrompia (`"8.840,00"` → `parseFloat("8.840.00")` = `8.84`).
- **Prova (TDD):** teste novo em `vendas-parser.test.ts` — caso nativo (paridade, inalterado) **+** caso string BR (vermelho no `toNumStr`, verde no `toNum`) + nulos. 15/15.

## M2 — `toNum` trata negativo entre parênteses; Gerencial converge (`f682fcb`)
- **Extensão do `toNum`:** `"(1.000)"` → `-1000`, `"(1.234,56)"` → `-1234,56`. O invólucro `(...)` é detectado **antes** da desambiguação BR/US; o conteúdo segue a regra existente; o sinal é aplicado no fim. **Não altera nenhum caso atual** (nenhum tem parênteses) — `coercao.test.ts` existente passa **sem alteração**; os casos do parêntese entram como **adição**.
- **Gerencial converge:** `gerencial/parser.ts` usa `toNum`; **`parseValorMonetario` removido** (era o 2º parser de dinheiro; único consumidor era o próprio parser). O guard `valor < 0` da call-site permanece — negativos seguem descartados como antes (a extensão não muda o que o Gerencial grava; ver "Achados").
- **Auditoria EXAUSTIVA (não-regressão), 3 camadas:**
  - **(a) Oráculo congelado** `parseValorMonetarioLegado` em `coercao.test.ts` — `toNum` estendido **concorda** com o parser antigo em todo formato real de moeda (15 casos `it.each` + nativos). 26/26.
  - **(b) Fuzz adversarial** (588 inputs combinatórios: `R$`/parênteses × BR/US × 0–3 casas decimais) — **116 divergências, ZERO em formato de moeda realista** (`R$` com 2 casas). As divergências caem só em **3 casas** (não-moeda) e **0 casas BR** (`"1.000"`→1000, onde o `toNum` é na verdade **mais correto** que o antigo, que dava 1).
  - **(c) Confirmação no DADO REAL** (read-only, `analytics.gerencial_lancamentos`, 111 lançamentos): min 75,00 / max 115.943,88; **0 valores < 10** (sem artefato de ÷1000), **0 valores com >2 casas**, e os menores carregam centavos (85,11 / 91,85 / 93,80). O formato de origem é **moeda de 2 casas** — exatamente o balde de divergência ZERO. **⇒ um re-import via `toNum` produz valores idênticos ao Gerencial atual.**

## M3 — Lint `wt/no-coercao-reimpl` (AST) + sonda (`da5f17a`)
- Regra **AST** (não regex de className como as irmãs `no-cor-hardcoded`/`no-tailwind-var-shorthand`), `error` em `src/**/*.{ts,tsx}`. Mira: **(1)** `parseFloat`; **(2)** `.replace` de separador na **direção número** — alimenta `Number`/`parseFloat` OU em função `:number`; o **guard "direção número"** isenta o sanitizador de `<input>` (`.replace(/[^\d.,-]/g,'')` → setter) e o `toFixed().replace` (formatação); **(3)** definir função/const com **nome de coerção** (`/^(to|para|parse).*(num|valor|money|reais|float|decimal)/i`), exceto `*BRL*`/`*format*`.
- **Isenções** via `files:` override: `coercao.ts`, `**/*.test.ts`, `src/lib/email/**`.
- **Sonda** `coercao-lint.sonda.test.ts` (`RuleTester` + vitest, **14 casos**): prova o **disparo** nos 6 padrões do bug e o **silêncio** em `parseInt(...,10)`, `Number(e.target.value)`, `toFixed().replace`, sanitizador de input, formatador `*BRL*`, `parseTipo`.
- **Ligada SÓ depois de M1/M2** (invariante de ordem): com as 2 violações já zeradas, a regra fica **verde** no projeto inteiro (0 findings de `wt/no-coercao-reimpl`).

## M4 — Fechamento
- `package.json` + `package-lock.json` → **4.27.0** (`src/lib/version.ts` deriva de `pkg.version`). CHANGELOG.md, CHANGELOG_DIRETORIA (negócio), **ADR-0130**, reforço no CLAUDE.md (bullet de coerção: lint + parêntese + paridade de Vendas), este out-briefing.

---

## Migrations / ADRs
- **Migrations:** nenhuma. SEM frente de dado.
- **ADR-0130** — Enforcement de coerção numérica (convergência ao canônico + lint) e negativo entre parênteses. Relaciona-se com ADR-0099 e o bug v4.23.1.

## Gate de fechamento
- `npx tsc --noEmit` → **0 erros**.
- `npm test` → **216/216** (14 arquivos), incl. `coercao.test.ts` (26, com parens + oráculo), `vendas-parser.test.ts` (15), `coercao-lint.sonda.test.ts` (14).
- `npm run build` → **limpo** (EXIT 0).
- `npm run lint` → **`wt/no-coercao-reimpl`: 0 findings** (regra nova verde) e as 2 irmãs de cor verdes. ⚠️ Ver "Achados" — o `eslint` sai não-zero por **12 problemas pré-existentes** (não-coerção).

## Achados / pendências (registro, NÃO implementado — disciplina de escopo)
1. **Lint pré-existente RED (fora do escopo):** `npm run lint` acusa **12 problemas** (`react-hooks/set-state-in-effect` ×7, `react-hooks/static-components` ×2, `react-hooks/immutability` ×1, `typescript-eslint/no-unused-vars` ×2) em componentes de **weddings/financeiro/shared** — **idênticos no `main`** (`eslint src` = 12/12 nas mesmas linhas). Originam-se de um **bump do `eslint-plugin-react-hooks`** no `node_modules` (regras novas/mais estritas), posterior ao merge da v4.26. **Não foram introduzidos por esta versão** e **não quebram o build** (`next build` verde). Correção é trabalho à parte (toca componentes não-relacionados a coerção).
2. **Mudança semântica do parêntese é platform-wide (consciente):** `toNum("(x)")` agora dá `-x` em vez de `null` para **todos** os importadores (contas-pagar-receber, fluxo-caixa-titulos, lançamentos, lançamentos-financeiro, Solicitações). Só altera entradas no formato `(...)`, que antes retornavam `null` → captura negativos antes silenciosamente perdidos (em linha com a missão anti-perda do `toNum`). Nenhum importador dependia de `(x)`→null. Documentado no ADR-0130.
3. **Gerencial: negativos `(...)` não chegam ao banco** (antes nem depois): a call-site de `parseGerencialExcel` descarta `valor < 0` (`"valor inválido"`). Com `parseValorMonetario` (`-1000`) ou `toNum` (`-1000`) o resultado é o mesmo — linha ignorada. A extensão do `toNum` mantém o Gerencial **idêntico**; o guard `< 0` foi preservado de propósito (fora de escopo mexer nele).
4. **`vendas-parser.ts` ainda tem um `toIsoDate`/`toStr`/`toBoolean` LOCAIS** (não o canônico de `coercao.ts`). O briefing dizia "o arquivo já usa o `toIsoDate` canônico" — impreciso; o local existe e **não** foi tocado (M1 era só `toNumStr`). Não disparam o lint (nome não casa o padrão de coerção numérica). Convergência futura é candidata, fora deste escopo.

## Arquivos modificados
- `src/lib/carga/coercao.ts` — `toNum` trata `(...)` negativo (M2).
- `src/lib/carga/coercao.test.ts` — casos do parêntese + oráculo congelado `parseValorMonetarioLegado` (M2).
- `src/lib/carga/vendas-parser.ts` — `toNumStr` removido, usa `toNum` (M1).
- `src/lib/carga/vendas-parser.test.ts` — testes de `valor_total`/`receitas` (M1).
- `src/lib/gerencial/parser.ts` — converge ao `toNum`, `parseValorMonetario` removido (M2).
- `eslint-rules/no-coercao-reimpl.mjs` — regra AST nova (M3).
- `eslint.config.mjs` — registra a regra + isenções `files:` (M3).
- `src/lib/carga/coercao-lint.sonda.test.ts` — sonda da regra (M3).
- `package.json`, `package-lock.json` — 4.27.0 (M4).
- `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `docs/adr/0130-…md`, `CLAUDE.md`, este out-briefing (M4).
