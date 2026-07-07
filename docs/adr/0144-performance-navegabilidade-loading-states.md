# ADR-0144 — Performance e navegabilidade: loading states + caminho crítico enxuto

**Status:** Aceito · **Data:** 2026-07-07 · **Versão:** v4.39.0
**Relaciona:** investigação de desempenho consolidada (FCP/LCP; causa nº1 = TTFB por cadeia serial + zero `loading.tsx` + região, amplificado por `iad1×sa-east-1`). **SEM migration.** O **P0** (Function Region `gru1`) já foi aplicado fora de versão pelo Yan.

## Contexto

A plataforma **não manda nenhum byte até TODO o trabalho do servidor terminar** e **não tinha nenhum `loading.tsx`** — resultado: ao navegar, a tela fica congelada (parece travada) mesmo quando está trabalhando. A investigação isolou a **percepção** (sem feedback imediato) e o **caminho crítico serial** como as alavancas de maior retorno, sem tocar em auth nem em contrato de dados.

**Invariantes que regem a versão (inegociáveis):**
- **AUTH INTOCADA** — `proxy.ts`, `getSessao`, `getUser`, permissões: nada muda (o P2c — validação local do JWT — fica para **depois da virada de produção**, em versão própria com auditoria adversarial). O diff não toca nenhum arquivo de auth.
- **Nenhum contrato de dados muda** — RPCs/actions/shapes idênticos; muda **quando** as chamadas acontecem, não **o que** retornam.
- **Skeleton com silhueta real, sem CLS**; a **sidebar nunca entra no skeleton**.
- **Badge de pendências continua existindo** — só sai do caminho bloqueante; sua falha não quebra o layout.

## Decisão — 5 técnicas (P1a, P1b, P2a, P2b, P3)

### 1. `loading.tsx` por segmento com skeleton (P1a/M1)
Módulo `src/components/shared/skeletons.tsx` (silhuetas reutilizáveis: `SkeletonHeader`/`SkeletonFiltros`/`SkeletonKpis`/`SkeletonGrafico`/`SkeletonTabela` + templates `SkeletonDashboard` e `SkeletonPaginaTabela`; tom **neutro** `zinc` + `animate-pulse`, alturas/larguras fixas → **sem CLS**; puros de markup, zero JS). `loading.tsx` nos segmentos pesados — o App Router os mostra **imediatamente** ao navegar, enquanto o RSC resolve. A **sidebar fica fora** por construção: `loading.tsx` só substitui o slot `children` dentro do `<main>` do AppShell (a sidebar é irmã, não filha). Cada `loading.tsx` envolve o skeleton no **mesmo container** (`max-w`/`px`) da sua página — daí não há salto na troca. Uma `loading.tsx` em `/performance` cobre as 4 rotas de Performance; uma em `/admin/solicitacoes` cobre `/movimentacoes`. Acervo replica seu `h-full flex flex-col` (título/busca fixos, lista rola — v4.38.0).

### 2. `useTransition`/`isPending` nos filtros que navegam (P1b/M2)
Os 4 filtros de período/setor que fazem `router.push` (`periodo-filter-pills-url`, `periodo-pills-url`, `periodo-filter-url`, `setor-filter`) envolvem o push em `startTransition` e expõem `isPending` **visível** (pills com `opacity-60 pointer-events-none` + `aria-busy`; selects `disabled`). **Semântica idêntica** — mesma URL, mesmos searchParams, mesmas opções do push; só o feedback é novo. O clique **nunca "morre"**. (O filtro de Weddings é contexto client com loading já derivado — não-URL — e fica como está.)

### 3. Badge de pendências fora do caminho bloqueante (P2a/M3)
O `RootLayout` **deixa de fazer `await getPendencias()`** (era um hop serial que atrasava o 1º byte). Passa a criar a **promise** `getPendencias().catch(() => null)` (não-aguardada) e transmiti-la à Sidebar, que a consome com **`use()` dentro de `<Suspense fallback={null}>`** — o badge **streama** e aparece assim que resolve, sem segurar a renderização do shell/página. `.catch(() => null)` torna a **falha do badge inofensiva** (`use()` nunca lança → badge some, layout intacto). **−1 hop serial** no caminho crítico. O 2º consumidor (`solicitacoes/page.tsx`, contador da caixa) fica intacto (mesma RPC `React.cache`).

### 4. Fluxo de Caixa em UM estágio de RPCs (P2b/M4)
Os **2 blocos seriais** (8 RPCs + 3 gerenciais) viram **um único `Promise.allSettled`** de até 11 chamadas. Os 3 gerenciais entram por **spread condicional** (`temGerencial ? [...] : []` — só disparam para quem tem a área; a permissão já era calculada antes das RPCs, **sem dependência de dados** entre os blocos). Defaults `= empty` no destructuring cobrem o caso não-gerencial. `allSettled`→`empty` preserva o invariante **"seção gerencial indisponível NÃO derruba a página principal"** (cada falha vira `empty` → `unwrapRpc` → `null` → `?? []`). **1 estágio serial a menos** na página mais pesada.

### 5. Bundle: drawers dinâmicos + xlsx no handler (P3a/P3b/M5)
Os 2 drawers com Recharts (`KpiPrincipalDrawer`, `DrilldownDrawer`) carregam via **`next/dynamic(() => import(...), { ssr:false, loading })`** (wrappers `*-drawer-lazy.tsx`; fallback leve no 1º clique) — o código do drawer sai do first-load das rotas de Performance/Weddings e carrega **sob demanda** (ao abrir). Em `lista-operacoes.tsx`, `@e965/xlsx` (chunk de **472 KB**) deixa de ser `import` estático e passa a `await import('@e965/xlsx')` **dentro** do handler de Download (padrão do resto do app) — sai do first-load de Weddings, carrega só ao exportar. **Total de client chunks inalterado** (não duplica código — só re-particiona em chunks assíncronos).

## Consequências
- **Percepção:** skeleton imediato ao navegar (sidebar fixa); clique de filtro com espera visível; nada "congela".
- **Caminho crítico:** −1 hop serial (badge) em toda navegação; fluxo-caixa com 1 estágio de RPCs em vez de 2.
- **Bundle:** recharts (dos drawers) e xlsx (472 KB) fora do first-load de Performance/Weddings (carregam sob demanda).
- **Custo:** `loading.tsx` deve espelhar o container de cada página (senão CLS) — mitigado pelo módulo de skeletons + revisão. A frescura do badge segue a do layout (recomputa em full-load, como antes) — sem regressão.

## Alternativas e fronteira
- **Medição:** o `next build` do Next 16 **não imprime** a coluna *First Load JS* por rota — a medição de bundle é por **chunk** (magnitude do que foi deferido: xlsx 472 KB, recharts ~388 KB) + o **total inalterado** (sem duplicação); o TTFB perceptual é validado no **checkpoint** do Yan (navegar o app). O ganho de caminho crítico é code-level (verificável no diff).
- **FORA (decisão do Yan):** **P2c** (validação local do JWT no proxy) — depois da virada, versão própria com auditoria adversarial de auth; **P4** (refresh granular + virtualização) — v5. **P0** (região `gru1`) já aplicado.
- **Próxima da fila:** v4.40.0 — Rebranding Janus (fecha a v4).
