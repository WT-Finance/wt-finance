# WT Finance — Out-Briefing v4.16.2

**Data:** 2026-06-13 · **Branch:** `fix/v4-16-2-quick-wins` (base `main`) · **Versão:** 4.16.1 → **4.16.2** (PATCH)
**Tema:** três **quick-wins priorizados da auditoria técnica** (relatório em `docs/auditoria/WT_Finance_Auditoria_Tecnica_2026-06-13.md`). **Merge e deploy ficam com o usuário.**

---

## O que entra (os 3 achados de maior retorno / menor risco)

| # | Achado (auditoria) | Severidade | Commit |
|---|--------------------|-----------|--------|
| QW1 | `next@16.2.4` com 13 advisories HIGH (incl. bypass de Middleware/Proxy) | alta | `8be0547` |
| QW2 | Carga de Vendas descarta linhas com setor/setor_micro novo SILENCIOSAMENTE | alta | `72cc282` |
| QW3 | Bug do shorthand Tailwind v4 sem guarda/registro permanente | alta | `3744d05` |

### QW1 — Bump de segurança do Next
`next` e `eslint-config-next` 16.2.4 → **16.2.9** (patch dentro do minor, sem quebra). Resolve 13 advisories HIGH, dos quais os mais relevantes são **bypass de Middleware/Proxy** (segment-prefetch e injeção de parâmetro de rota dinâmica) — críticos porque o `proxy.ts` é a **camada 1** do enforcement de auth. `npm audit` após o bump não lista mais o `next` em HIGH (resta só a cadeia dev-only vitest/esbuild/vite, fix semver-major — registrado, fora de escopo). Build revalidado (proxy/middleware compilam, 0 erro).

### QW2 — Guarda contra descarte silencioso na carga de Vendas (migration 0132)
`transform_raw_to_analytics` insere `fato_venda_item` com `INNER JOIN` em `dim_setor`/`dim_setor_micro` (seeds fixos). Um setor/subsetor novo ou renomeado no ERP faria **todas** as linhas daquele valor sumirem dos dashboards — sem erro, sem rollback (o swap concluía "com sucesso" com menos linhas). A pré-validação não-destrutiva (salvaguarda central da v4.12/v4.15) **não cobria** isso.
**0132** estende `validar_carga_staging()` para contar as linhas que o `INNER JOIN` descartaria e **reprovar a carga ANTES do swap** — mesmo padrão da checagem de data fora de range. Mensagem lista os valores ofensores. **Não muda o contrato** (só acrescenta ao array `erros` e zera `ok`); `setor_fora` adicionado ao retorno (schema `.passthrough()` já tolerava; explicitado + caso no `rpc-contrato.test`).
- **Aplicada** em produção (CREATE OR REPLACE, validation-only).
- **Verificada:** teste de lógica read-only (1 boa + 2 ruins → flagra 2 ✓); regressão de staging vazia inalterada (`ok:false` "vazio" ✓).
- **Rollback:** re-aplicar a definição da 0116 (idêntica, sem o bloco de setor). Reversível por CREATE OR REPLACE; não escreve dado.

### QW3 — Convenção permanente anti-regressão (Tailwind v4)
CLAUDE.md (Convenções de código): **token CSS em classe Tailwind é `[var(--token)]`, NUNCA `[--token]`** — a forma v3 compila para `color:--token` (CSS inválido) e a cor é silenciosamente descartada, sem erro de build/tsc/lint. Foi a raiz da incoerência visual corrigida app-wide na v4.16.1; agora está registrada para não voltar.

## Gates
- `npx tsc --noEmit` **0** · `npm run build` **limpo** (next 16.2.9) · `npm test` **97/97** (+1: contrato do `setor_fora`) · `npm run lint` **13 (baseline, zero novos)**.

## Preview / Verificação
**Smoke 4/4 no deploy da branch** (usuário descartável, 0 resíduo), com foco no risco do bump do Next — a camada 1 (proxy): **anon `/solicitacoes` → `/login`** (proxy intacto pós-16.2.9), render autenticado de `/solicitacoes` e `/admin/acessos` (200), `/login` público 200. A migration 0132 foi verificada direto no banco (lógica + regressão de staging vazia).

## Arquivos
- `package.json` (next/eslint/version), `package-lock.json`
- `supabase/migrations/0132_validar_setor_carga_vendas.sql`
- `src/lib/schemas-rpc.ts`, `src/lib/rpc-contrato.test.ts`
- `CLAUDE.md`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`

## Não entrou (segue na fila da auditoria)
Os demais 59 achados (3 alta já era QW; 17 média; 42 baixa) seguem documentados no relatório de auditoria para priorização — ex.: páginas de Fluxo de Caixa via service role, staging sem lock, `database.ts` Functions desatualizado, `toNum` divergente, código morto (rota vestigial/actions órfãs), gate de teste condicional, etc.

---

**PR:** `fix/v4-16-2-quick-wins` → `main`. Merge e deploy ficam com o usuário.
