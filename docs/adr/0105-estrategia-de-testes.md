# ADR-0105 — Estratégia de testes

**Status:** Aceito
**Data:** 2026-06-08
**Contexto:** Até a v4.11 a plataforma não tinha nenhuma suíte de testes automatizados (achado F4 da auditoria pós-v4.11). Para um sistema financeiro, cálculos sensíveis (formatação monetária, períodos/datas, margem, agregações, parsing de planilhas) ficavam sem rede de proteção — e já houve bugs de cálculo/data em produção (inversão dia/mês, ADR-0099; contaminação de vínculo `venda_n`, v4.9.2). A v4.12 introduz o ferramental.

## Decisão

**Runner: Vitest** (rápido, nativo a TS/ESM, sem build extra; alias `@` espelha o tsconfig). Gate novo `npm test` (`vitest run`) somado a `build`/`tsc`/`lint`.

Três fases (as duas primeiras nesta versão):

1. **Unit dos helpers puros** (`src/lib/**`): `fmt`, `periodo`, `decomposicao-variacao`, e funções puras de parsing de carga (`normalizeHeader`, `toIsoDate`). Determinísticos, offline, rápidos. Os testes de data/período **expressam o comportamento correto** (parsing local por componentes, sem deslocamento UTC).

2. **Contrato das RPCs críticas** (`*-contrato.test.ts`): batem nas RPCs via REST com a **service role** (mesmo padrão de verificação já usado no projeto) e validam **shape + invariantes de negócio** (ex.: soma dos % do Mix ≈ 100; `margem ≈ receita/faturamento`; `vendas ≤ limite`). Usam `describe.skipIf(!credenciais)` → **o gate `npm test` passa offline** (sem `.env.local`, são pulados) e roda de verdade no ambiente local/preview. **Só leitura**, nunca escrita.

3. **E2e (Playwright)** — **fora desta versão**; follow-up registrado.

## Consequências

- **DoD ganha `npm test`** (CLAUDE.md). Falha de teste bloqueia o fechamento.
- Para casar a URL do Supabase, os testes de contrato normalizam a base (o `.env` pode vir com `/rest/v1/` e/ou barra final).
- Funções puras de parsing recebem `export` quando precisam ser testadas (refactor mínimo, sem mudança de comportamento).
- Convenção de nomes: `*.test.ts` ao lado do código; contrato em `*-contrato.test.ts`.
