# Out-Briefing — v4.39.0 · Performance e navegabilidade (loading states + caminho crítico)

**Tipo:** MINOR · **Migration:** NENHUMA · **ADR:** 0144 · **Base:** main @ v4.38.0 · **Branch:** `feat/v4-39-0-performance-navegacao`

Ataca a **percepção** (a plataforma não mandava byte até todo o trabalho terminar; zero `loading.tsx` → parecia travada) e o **caminho crítico serial**, **sem tocar em auth** (P2c fica para depois da virada) nem em **contrato de dados** (muda *quando* as chamadas acontecem, não *o que* retornam).

## Missões

### M1 — `loading.tsx` por segmento com skeleton (P1a)
- **Novo** `src/components/shared/skeletons.tsx`: primitivos (`SkeletonHeader`/`SkeletonFiltros`/`SkeletonKpis`/`SkeletonGrafico`/`SkeletonTabela`) + templates (`SkeletonDashboard`, `SkeletonPaginaTabela`) + envelope `SkeletonPagina`. Tom neutro `zinc` + `animate-pulse`, alturas fixas → **sem CLS**; puros de markup (server, zero JS).
- **8 `loading.tsx`**: `/performance` (cobre performance/trips/corporativo/weddings), `/financeiro/fluxo-caixa`, `/financeiro/fluxo-caixa/gerencial`, `/solicitacoes`, `/admin/solicitacoes` (cobre `/movimentacoes`), `/admin/acessos`, `/financeiro/acervo` (replica `h-full flex flex-col`), `/financeiro/faturamento-corp`. Cada um usa o **mesmo container** (`max-w`/`px`) da sua página.
- **Sidebar fora do skeleton** por construção (o `loading.tsx` só substitui o `<main>` do AppShell). Fora de escopo: telas `EmConstrucao` (Executiva/Metas) e páginas puramente client sem fetch de servidor (Uploads/Calculadora/Design-System) — `loading.tsx` daria pouco lá.
- **Nota (auto-auditoria):** a rota-BASE `/performance` mostra `EmConstrucao` sem `?preview=1` — o `/performance/loading.tsx` serve os 3 sub-dashboards reais (trips/corporativo/weddings); na base há, no máximo, um flash brevíssimo do skeleton (o `EmConstrucao` renderiza sem RPC, quase instantâneo) — cosmético, sem CLS persistente. Aceito (a alternativa — 3 arquivos em vez de 1 — não compensa).

### M2 — `useTransition`/`isPending` nos filtros (P1b)
- 4 filtros que navegam via `router.push`: `periodo-filter-pills-url.tsx`, `periodo-pills-url.tsx`, `periodo-filter-url.tsx`, `setor-filter.tsx`. `router.push` envolvido em `startTransition`; `isPending` visível (pills `opacity-60 pointer-events-none` + `aria-busy`; selects `disabled`). **Semântica idêntica** (mesma URL/params/opções). O clique nunca "morre".
- Weddings usa filtro de contexto client (não-URL) com loading já derivado — fica como está.

### M3 — badge de pendências fora do caminho bloqueante (P2a)
- `RootLayout` deixa de `await getPendencias()`; cria a promise `getPendencias().catch(() => null)` (não-aguardada) e a passa à Sidebar, consumida via **Suspense + `use()`** (`fallback={null}`). Badge **streama** e aparece ao resolver; **falha inofensiva** (o `.catch` → `use()` nunca lança → badge some, layout intacto). **−1 hop serial** em toda navegação. 2º consumidor (`solicitacoes/page.tsx`) intacto.

### M4 — Fluxo de Caixa em 1 estágio de RPCs (P2b)
- Os 2 blocos seriais (8 + 3 gerenciais) → **um `Promise.allSettled`**; gerenciais por **spread condicional** (`temGerencial ? [...] : []`), defaults `= empty` no destructuring. **Sem dependência de dados** entre blocos (a permissão é calculada antes). `allSettled`→`empty` preserva "gerencial indisponível não derruba a página". Mesmos contratos/resultados.

### M5 — bundle (P3a/P3b)
- 2 drawers com Recharts via `next/dynamic(ssr:false, loading)`: wrappers `kpi-principal-drawer-lazy.tsx` / `drilldown-drawer-lazy.tsx`; 4 call-sites trocam só o import (JSX condicional idêntico). `@e965/xlsx` sai do `import` estático de `lista-operacoes.tsx` → `await import(...)` dentro do handler de Download (`exportarParaExcel` async).

### M6 — fechamento
- Versão **4.39.0** (`package.json` + `package-lock.json` ×2; `version.ts` deriva de `pkg.version`). `CHANGELOG.md`, `CHANGELOG_DIRETORIA` ("a plataforma responde imediatamente ao navegar"), **ADR-0144**, DS doc (receita do skeleton), este out-briefing.

## Medição antes/depois

**Bundle (`.next/static/chunks`):**
| Item | Antes (v4.38.0) | Depois (v4.39.0) | Efeito |
|---|---|---|---|
| Total client chunks | 4.7 MB | 4.7 MB | inalterado → M5 **re-particiona** (defere), não duplica código |
| chunk `@e965/xlsx` | 472 KB, import **estático** (via `lista-operacoes.tsx`) | 472 KB, `await import` **assíncrono** (handler de Download) | fora do first-load de Weddings |
| chunk Recharts (drawers) | ~388 KB, import **estático** (drawers) | ~388 KB, `next/dynamic(ssr:false)` **sob demanda** | fora do first-load de Performance/Weddings |

- **Metodologia/limitação (honesta):** o `next build` do **Next 16 não imprime a coluna *First Load JS* por rota** — a medição de bundle é por **chunk** (magnitude do que foi deferido) + o **total inalterado** (prova de que não há duplicação/regressão). O deferimento em si é **determinístico** (code-splitting do webpack sobre `import()` dinâmico / `next/dynamic`), verificável no diff.

**Caminho crítico (code-level, verificável no diff — TTFB perceptual validado no checkpoint):**
- **M3:** −1 RPC serial (`getPendencias`) no caminho bloqueante do layout, em **toda** navegação (o badge passou a streaming).
- **M4:** Fluxo de Caixa de **2 → 1** estágio de RPCs (os 3 gerenciais correm em paralelo com os 8, para quem tem a área). ~1 round-trip Supabase a menos na página mais pesada (região `sa-east-1`; ~140 ms/hop pela análise de região).

## Invariantes preservados
- **AUTH INTOCADA:** o `git diff` não toca `proxy.ts` nem `src/lib/auth/**`. `layout.tsx` mudou só o tratamento de `getPendencias` (não o `await getSessao()`).
- **Contrato de dados idêntico:** mesmas RPCs/actions/shapes; M4 só muda *quando* as 11 chamadas acontecem.
- **Skeleton:** silhueta real, sem CLS, sidebar fora, tom neutro (`zinc`).
- **Badge:** existe e é async; falha não quebra layout.
- **useTransition:** só adiciona `isPending`; semântica dos filtros idêntica.
- **Lazy:** drawers abrem igual (fallback leve no 1º clique); download xlsx idêntico.

## Gate de fechamento
`npx tsc --noEmit` → **0** · `npx vitest run` → **354** verdes · `eslint` nos arquivos alterados → **0** · `npx next build` → exit **0**. **SEM migration.** (A worktree nasceu limpa dos dirs não-versionados → gates rodam normal.)

**Auto-auditoria adversarial (subagente):** APROVADA — 6/6 invariantes OK (auth intocada — diff sem arquivo de auth; contrato de dados idêntico no M4; skeleton casa o container de cada página, sidebar fora, tom zinc; badge async com falha inofensiva e `use`/Suspense corretos; useTransition só adiciona `isPending`; lazy sem regressão). Sem achado CRÍTICO/IMPORTANTE. 1 nota cosmética (flash na rota-base `/performance` = EmConstrucao) aceita; M4 ficou mais resiliente (allSettled isola cada falha gerencial).

## Arquivos
- **Novos:** `src/components/shared/skeletons.tsx`; `src/components/weddings/kpi-principal-drawer-lazy.tsx`, `drilldown-drawer-lazy.tsx`; 8× `loading.tsx` (performance, financeiro/fluxo-caixa, .../gerencial, solicitacoes, admin/solicitacoes, admin/acessos, financeiro/acervo, financeiro/faturamento-corp); `docs/adr/0144-*.md`; este out-briefing.
- **Alterados:** `src/app/layout.tsx` (M3), `src/components/layout/sidebar.tsx` (M3), `src/app/financeiro/fluxo-caixa/page.tsx` (M4), `src/components/shared/{periodo-filter-pills-url,periodo-pills-url,periodo-filter-url,setor-filter}.tsx` (M2), `src/components/shared/kpi-drawer-trigger.tsx` + `src/components/performance/kpi-principal-card.tsx` + `src/components/weddings/{weddings-kpis-section,operacoes-section,lista-operacoes}.tsx` (M5); `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `docs/design-system.md`, `package.json`, `package-lock.json`.

## Checkpoint do Yan (antes do merge)
Navegar o app inteiro (skeletons imediatos, sidebar fixa); trocar períodos no Gerencial e no Fluxo de Caixa (pending visível); badge aparecendo async; drawers de Performance abrindo; download xlsx de Weddings; veredito: "parou de parecer travado?".

## Fronteira
- **FORA:** P2c (validação local do JWT — depois da virada, versão própria com auditoria adversarial de auth); P4 (refresh granular + virtualização — v5); P0 (região `gru1` — já aplicado).
- **Próxima da fila:** v4.40.0 — Rebranding Janus (fecha a v4).
