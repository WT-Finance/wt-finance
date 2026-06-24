# WT Finance — Out-Briefing v4.27.3

**Data:** 2026-06-24 · **Branch:** `fix/v4-27-3-inp-drawer-performance` (base `main` @ v4.27.2) · **Versão:** 4.27.2 → **4.27.3** (PATCH)
**Tema:** Responsividade ao clique — reduzir o **INP** (Interaction to Next Paint) do **card de KPI principal** em `/performance/weddings`, que abre o `KpiPrincipalDrawer`. Frontend puro, **SEM migration**. **Merge e deploy ficam com o usuário.**

## Contexto e diagnóstico (investigação prévia)
O clique no card de KPI principal de Weddings media **INP ≈ 1840ms** ("poor"; meta "great" = <200ms). A investigação adversarial (workflow de 7 agentes, 3/3 veredictos) **REFUTOU** a hipótese ingênua de que os **gráficos da página** (FluxoCaixaMensal/AcumuladoRecebPag) re-renderizavam no clique — eles vivem sob um Server Component e o `onClick` é só `setDrawerOpen(true)` (estado local de uma ilha-cliente; **não** cascateia para as ilhas irmãs). A causa real foi localizada em duas frentes:
1. **No frame (síncrono, bloqueante):** o mount do overlay do `ListDrawer` — `fixed inset-0` + `document.body.style.overflow='hidden'` (reflow de página inteira) + 4 efeitos de mount + transição CSS de 280ms — disparado **sincronamente** pelo handler do clique (sem `useTransition`).
2. **Diferido (long task pós-fetch):** os 4 gráficos Recharts do drawer (`kpi-principal-drawer`), renderizados depois do fetch (skeleton-first), com dados recriados inline.

**Lever nº1** (este patch) ataca a frente 1 — a única garantida e de baixíssimo risco.

## A regra deste patch: MEDIR decide o escopo
> "Sem o INP medido (antes/depois), não há prova de que funcionou. Parar no suficiente."

- **<200ms após o lever nº1 → patch completo** (não aplicar levers 2–3).
- **>200ms → fase 2** (lever 2: adiar `overflow:hidden`; lever 3: montar gráficos do drawer incrementalmente + memo).

**A medição do INP exige um navegador real e é entregue ao Yan** (este ambiente é headless — sem Chrome/Profiler/Speed Insights). Protocolo abaixo.

---

## M1 — Lever nº1 (`useTransition` na abertura do drawer) — ÚNICO aplicado

**Arquivo:** `src/components/weddings/weddings-kpis-section.tsx` (a seção que contém o `card-clicavel` do KPI principal de Weddings — o alvo do INP).

- `import { useEffect, useState, useTransition } from 'react'`.
- `const [, startTransition] = useTransition()` + `const abrirDrawer = () => startTransition(() => setDrawerOpen(true))`.
- `onClick={abrirDrawer}` e `onKeyDown` (Enter) → `abrirDrawer` (antes: `setDrawerOpen(true)` direto).

**Por que funciona:** marcar a abertura como **transição não-urgente** faz o handler do clique **retornar rápido** e o React agendar o mount pesado do overlay como trabalho **interrompível**, fora do frame de resposta ao input. **Muda QUANDO renderiza, não O QUE** — o drawer abre com o mesmo conteúdo e a mesma aparência (visualmente idêntico).

**Escopo deliberadamente estreito:** aplicado **só** no card de Weddings (pior caminho medido). Os `KpiPrincipalCard` de Trips/Corp (seletor de 2 níveis, não casa com o pior caminho) **não** foram tocados — "não expandir sem medir". Follow-up opcional se a medição em Trips/Corp justificar.

## O que NÃO foi feito (por disciplina do briefing)
- **NÃO** memoizei os gráficos da página (FluxoCaixaMensal/AcumuladoRecebPag) nem mexi no `PeriodoFilterProvider` — **refutados 3/3, impacto zero**.
- **NÃO** apliquei levers 2–3 — ficam **condicionados à medição** do Yan.
- **FCP/LCP de ~3,25s** (carga inicial da página) fica **FORA** — frente separada e futura.

---

## Medição (entregue ao Yan) — protocolo

| | Antes | Depois |
|---|---|---|
| Origem | **produção** (`main` @ v4.27.2) | **preview** da PR (Vercel) |
| Página | `/performance/weddings` | idem |
| Ação | clicar no **card de KPI principal** (full-width, "Ver mais ›") | idem |
| Métrica | **INP ≈ 1840ms** (conhecido) | **A MEDIR** |

**Como medir (Chrome DevTools):** abrir a página → **Performance** → **Record** → clicar no card uma vez (esperar o drawer abrir) → **Stop** → na trilha **Interactions**, ler a duração do evento (input delay + processing + presentation). Alternativa de campo: **Vercel Speed Insights** (INP da rota) após o preview acumular interações.

**Decisão:** `INP < 200ms` → fechar e mergear; `INP ≥ 200ms` → me avisar para a **fase 2** (levers 2–3 na mesma branch/PR).

---

## Migrations / ADRs
- Nenhuma migration. Nenhum ADR (otimização de render pontual, sem decisão arquitetural nova).

## Gate de fechamento
- `npx tsc --noEmit` → **0 erros** em `src/` (ruído de `agent/` untracked excluído — fora do build/PR).
- `npm run lint` → arquivo tocado **limpo** (mantém o verde da v4.27.2).
- `npm test` → **246/246** (15 arquivos).
- `npm run build` → **limpo**.
- **Medição de INP antes/depois → pendente (Yan, no preview).**

## Achados / fora de escopo
- Levers 2–3 (overlay `overflow:hidden` diferido; gráficos do drawer incrementais + memo) — **condicionais à medição**.
- FCP/LCP ~3,25s da carga inicial — **frente futura separada**.
- `useTransition` nos drawers de Trips/Corp — follow-up opcional, só com medição.

## Arquivos modificados
- `src/components/weddings/weddings-kpis-section.tsx` (lever nº1).
- `package.json`, `package-lock.json` (4.27.3); `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, este out-briefing (fechamento).
