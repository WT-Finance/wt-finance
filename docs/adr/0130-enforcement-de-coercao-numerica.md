# ADR-0130 — Enforcement de coerção numérica (convergência ao canônico + lint) e negativo entre parênteses

**Status:** Aceito · **Data:** 2026-06-23 · **Versão:** v4.27.0
**Relaciona-se com:** [ADR-0099](0099-parser-data-valor-nativo-excel.md) (ler o valor `Date`/número NATIVO da célula, não a string formatada) e o bug do saldo **v4.23.1** (um `parseNum` local com `replace(/\./g,'')` multiplicou saldos por ~100, silenciosamente). Estende a convenção do CLAUDE.md "coerção de célula vem de UM módulo só (`@/lib/carga/coercao`)" — adiciona o **enforcement** e uma **extensão semântica** do `toNum`.

## Contexto

A convenção já existia (CLAUDE.md): todo número de célula passa pelo `toNum`/`toIsoDate`/`toStr` canônicos de `@/lib/carga/coercao`; nunca um parser local. O `toNum` ingênuo (`Number(String(v).replace(',','.'))`) corrompia BR com milhar (`"8.840,00"` → `8.84`) — **perda silenciosa**, a mesma classe do bug v4.23.1. Mesmo assim, **duas reimplementações vivas** coexistiam com o canônico:

1. `vendas-parser.ts:toNumStr` — `parseFloat(String(v).replace(',','.'))`, o **único `parseFloat`** do app. Só não corrompia hoje por um detalhe: o caminho de Vendas entrega **número nativo** (`sheet_to_json(header:1)`), e o `String(número)` round-trips. Em string BR, corromperia.
2. `gerencial/parser.ts:parseValorMonetario` — um 2º parser **robusto** (desambigua BR/US pelo último separador) que o `toNum` quase replicava, **exceto** por uma feature: **negativo entre parênteses** (`"(1.000)"` → `-1000`), convenção contábil que o `toNum` não tinha.

Espelha exatamente o aprendizado do ADR-0129 (cor): a regra que **não** voltou foi a única com **lint** (`wt/no-tailwind-var-shorthand`). Convenção sozinha não segura; enforcement segura.

> O traçado de integridade (pré-v4.27) **provou que não há dado corrompido a corrigir**: `raw.vendas_excel` = R$ 182.631.203,48, batendo com `analytics.mv_vendas_diarias`; zero linhas 1000× menores. É **dívida latente**, não incêndio — por isso a versão é **só de código** (SEM migration, SEM `UPDATE`/`DELETE` de dado).

## Decisão

1. **Convergir as duas reimplementações ao `toNum` canônico** e removê-las:
   - Vendas: `toNumStr` → `toNum` (mantendo o retorno `string|null` que o staging casta `::numeric`: `const n = toNum(v); n === null ? null : String(n)`).
   - Gerencial: `parseValorMonetario` → `toNum`, função **removida** (único consumidor era o próprio parser; o guard `valor < 0` da call-site permanece — negativos seguem descartados como antes).

2. **Estender o `toNum` para a convenção contábil do parêntese** (`"(1.000)"` → `-1000`, `"(1.234,56)"` → `-1234,56`): o invólucro `(...)` é detectado **antes** da desambiguação BR/US; o conteúdo segue a regra existente, sem alteração; o sinal é aplicado no fim. **Mudança semântica consciente, válida para TODA a plataforma** (todos os importadores que usam `toNum`): só altera entradas no formato `(...)`, que **antes retornavam `null`** — i.e., captura negativos que eram silenciosamente perdidos, em linha com a missão anti-perda do `toNum`. Nenhum importador dependia de `(x)` significar outra coisa (todos recebiam `null`).

3. **Lint `wt/no-coercao-reimpl`** (AST, irmã das `wt/no-cor-hardcoded` e `wt/no-tailwind-var-shorthand`), nível `error` em `src/**/*.{ts,tsx}`, mira **3 sinais fortes** fora de `coercao.ts`:
   - **(1)** `parseFloat(...)` em qualquer lugar (100% coerção de dinheiro);
   - **(2)** `.replace(<separador numérico>)` na **DIREÇÃO NÚMERO** — alimentando `Number()`/`parseFloat()` OU dentro de função que retorna `number`. O **guard "direção número"** é o que evita os falsos-positivos legítimos: o **sanitizador de `<input>`** (`.replace(/[^\d.,-]/g,'')` cujo resultado volta string para um setter) e o **`toFixed().replace`** (formatação, direção string);
   - **(3)** definir função/const com **nome de coerção** (`/^(to|para|parse).*(num|valor|money|reais|float|decimal)/i`), exceto formatadores (`*BRL*`/`*format*`) — fecha o vetor de **entrada** de um 2º parser.
   - **Isenções** (via `files:` override): `coercao.ts` (a implementação), `**/*.test.ts` (oráculo congelado e a própria sonda), `src/lib/email/**`.

4. **Sonda** (`coercao-lint.sonda.test.ts`, `RuleTester` + vitest): prova que a regra **dispara** no padrão do bug e **silencia** em `parseInt(...,10)`, `Number(e.target.value)`, `toFixed().replace`, sanitizador de input. É o mesmo papel do `tokens.test.ts` para a regra de cor.

**Ordem obrigatória:** convergir/remover (passos 1-2) **antes** de ligar o lint (passo 3) — senão as 2 violações travariam o build.

## Consequências

- **Positivas:** um 3º parser de dinheiro novo passa a **quebrar o lint/build** (provado pela sonda). A não-regressão do `toNum` estendido foi provada por **oráculo congelado** (`parseValorMonetarioLegado` em `coercao.test.ts`): concorda com o `parseValorMonetario` antigo em **todo formato real de moeda** (BR/US, com/sem R$, positivos e negativos entre parênteses). `coercao.test.ts` existente passa **sem alteração** (os casos do parêntese entram como adição) — prova de que a extensão não regride nada.
- **Custo / atenção:** a extensão do parêntese vale **platform-wide** — qualquer importador que receba `"(x)"` agora obtém `-x` em vez de `null`. É o comportamento desejado (capturar o negativo), mas é uma mudança do canônico, registrada aqui.
- **Fora de escopo (follow-up):** o nível **ampliado** do lint (`Number()` por **nome** — ~6 `<input type=number>` legítimos que o ampliado mataria); o lint **não** substitui a revisão de parsers novos — é a rede.

## Alternativas consideradas

- **Manter o `parseValorMonetario` como 2º parser permitido:** descartado — é exatamente a divergência que o canônico existe para eliminar; o purista (um ponto de coerção) é mais barato de manter e auditar.
- **Só reforçar a convenção no CLAUDE.md:** insuficiente (lição do ADR-0129 — a regra sem lint volta). A convenção permanece como documentação; o **lint** é o que segura.
- **Regra por regex de texto (como as irmãs de cor):** insuficiente para o guard "direção número" — distinguir `Number(s.replace(...))` (coerção) de `toFixed().replace(...)` (exibição) e do sanitizador de input exige **AST**, não casamento de string.
