# Out-briefing — v6.1.2 · Segurança: alertas do Dependabot

**Branch:** `feat/v6-1-2-seguranca-deps` · **Rota:** C (patch técnico; o escopo é o pedido do Yan de
01/10: "aplique o patch com as correções de segurança apontadas pelo dependabot") · **Migrations:** N/A ·
**ADR:** N/A · **Fechada em:** 01/10/2026

## 1. Resumo

Os 4 alertas abertos do Dependabot no `main` (avisados no push de 01/10) foram fechados. `npm audit`
passou de 1 crítico + 1 high para **0**. Nenhum arquivo de `src/` mudou: só `package.json` e
`package-lock.json`.

| Alerta | Severidade | Pacote | Escopo | Advisory | De → para |
|---|---|---|---|---|---|
| #54 | **crítico** | `next` | runtime, direto | GHSA-vcvr-r3jv-pc5j — RCE em `next/og` `ImageResponse` (16.2.0–16.3.5) | 16.3.4 → **16.3.8** |
| #51/#52/#53 | moderado | `brace-expansion` | dev, transitivo | GHSA-q2hr-2g5m-vwhr — DoS por expansão quadrática (+ GHSA-qhr7-859c-m2p7 e GHSA-6j4f-fj2g-mc7p, high, no `npm audit`) | 1.1.18 → 1.1.21 · 2.1.4 → 2.1.7 · 5.0.9 → 5.0.12 |

## 2. Decisões técnicas

- **`next` 16.3.8, não 16.3.6.** 16.3.6 é o primeiro corrigido (22/09); 16.3.8 é o último patch da mesma
  minor (30/09) e o alvo do próprio `npm audit fix --force`. Patch dentro da 16.3: sem mudança de API. O
  risco de uma versão de 1 dia foi coberto pelos gates e pelo smoke de `next start` (§4).
- **Pin exato mantido** (`--save-exact`), como já estava; `eslint-config-next` acompanha o `next`.
- **`brace-expansion` por `npm audit fix` sem `--force`**: as três versões cabem nas faixas que os
  `minimatch` já declaram — só o lockfile muda, sem `overrides`.
- **Exposição real do crítico:** o app não importa `next/og` nem `ImageResponse` (grep em `src/` vazio) —
  não era explorável pelo código atual; o bump é obrigatório porque a superfície existe no pacote.
- `node_modules` da worktree por `npm ci` real (não hardlink da raiz): com lockfile mudando, hardlink
  arriscaria escrever em arquivo compartilhado com o checkout raiz.

## 3. Arquivos

`README.md` (versão do Next na stack), `package.json` (next, eslint-config-next, version 6.1.2), `package-lock.json` (família `next` —
`next`, `@next/env`, `@next/swc-*`, `@next/eslint-plugin-next`, `eslint-config-next` — e as 3 cópias de
`brace-expansion`; nada mais), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, este out-briefing,
`docs/WORKING-CONTEXT.md`.

## 4. Gates e prova

- `npx tsc --noEmit` ✓ · `npm run lint` ✓ · `npm run build` ✓ (Next.js 16.3.8 · Turbopack, sem warnings).
- `npm test`: **1.870 passaram, 6 skipped**; 1 arquivo vermelho — `oraculo-demonstrativo.test.ts`
  (ENOENT da fixture `demonstrativo-cru.xlsx` de 21/09, perdida, B-38). **Controle:** resultado idêntico
  ao da v6.1.1 no mesmo dia — o bump não mudou nenhum resultado.
- **Smoke do servidor de produção** (`next start`, porque a suíte não exercita o framework de verdade —
  lição da v5.10.2): `/login` 200; `/`, `/admin/ingestao`, `/admin/api-externa`, `/financeiro/dre` 307 →
  `/login?next=…` (proxy ativo); `/api/ingestao/vigia` 401 sem credencial; log sem erro nem aviso.
- `npm audit` = 0.

## 5. Parecer da revisão

**revisor: APROVADO COM RESSALVAS** — sem CRÍTICO/ALTO/MÉDIO.
- Lockfile: 706 = 706 entradas (nada novo nem removido); só a família `next` (36 ocorrências 16.3.4 →
  16.3.8) e as 3 cópias de `brace-expansion` mudaram; 699/699 `resolved` em `registry.npmjs.org` com
  `integrity` sha512; dependências de `next` 16.3.8 iguais às da 16.3.4 (sem arrasto de transitivos).
- Pin exato preservado; peers `react`/`react-dom` 19.2.4 satisfeitos; `engines` do `next` 16.3.8 =
  `>=20.9.0`, o mesmo piso do projeto (não subiu).
- `next/og` confirmado ausente (nem `opengraph-image`/`twitter-image`/`icon.tsx`; os ícones são estáticos)
  — exposição real do #54 era nula.
- BAIXO `README.md:30` citava Next.js 16.3.4 → **corrigido**. BAIXO `WORKING-CONTEXT` com a data do
  fechamento anterior → **corrigido**.
- **Risco residual registrado:** sem release notes locais de 16.3.5–16.3.8; o smoke de `next start` só
  prova o ramo NÃO autenticado do `proxy.ts`. 🔴 Yan: no preview, um login real (sessão → rota protegida
  200) e uma tela com dados (ex.: DRE) fecham a lacuna.

## 6. Pendências

- Os alertas do Dependabot só fecham sozinhos depois do merge (o GitHub lê o `main`).
- Herdadas da v6.1.1 (inalteradas): conferência visual restante, guarda anti-fórmula do Exportar, EBITDA,
  split de `puladas[].ids` no cliente da RPA, cadastros duplicados no Monde.

## Advisor

| Agente | Consultas | Mudaram o rumo |
|---|---|---|
| Orquestrador | 0 | — (Carta: não consulta) |
| revisor | 0 | — |

Custo: pendência do Yan (`/usage`).
