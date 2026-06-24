# WT Finance — Out-Briefing v4.27.2

**Data:** 2026-06-24 · **Branch:** `fix/v4-27-2-lint-react-hooks` (base `main` @ v4.27.1) · **Versão:** 4.27.1 → **4.27.2** (PATCH)
**Tema:** Higiene de lint — zerar os 12 achados `react-hooks`/`no-unused-vars` pré-existentes. **SEM migration, SEM ADR** (higiene). **Merge e deploy ficam com o usuário.**

## Contexto
Os 12 vinham do bump do **`eslint-plugin-react-hooks@7.1.1`** (ruleset do **React Compiler**) no `node_modules`, posterior à v4.26 — **código pré-existente recém-sinalizado**, idêntico no `main`; `next build` sempre verde. Esta versão zera todos → **`npm run lint` 100% verde** pela 1ª vez desde o bump.

## Invariante central
**O gate (tsc/build/lint) NÃO vê "comporta-se igual".** A prova de não-regressão é conferência funcional: nos 10 mecânicos, conferência leve no preview (mesma UX); nos **2 de risco**, **conferência visual do Yan** — **confirmada: renderização idêntica** (mantidos, não viraram baseline).

---

## M1 — Os 10 mecânicos

### 2 TRIVIAL — código morto (`9a405ce`)
- `executiva/mix-setor-chart.tsx`: arg `_name` (2º do formatter Recharts) removido — `(value) =>` é assinável.
- `financeiro/proximos-lancamentos-lateral.tsx`: `const isHoje` computada e nunca lida — removida.

### 8 SEGURO (`91fcac2`)
- **`set-state-in-effect` de fetch** (`weddings-mix-section`, `calendario-liquidez`, `kpi-principal-drawer:261`): `loading` deixa de ser estado setado sincronamente no efeito e passa a ser **DERIVADO** de uma chave "última carregada" (`loadedKey !== <chave atual>`); o `.then` seta dado **+** chave. Durante o refetch, segue mostrando os dados anteriores com `loading=true` — **idêntico**. (`calendario` preserva o reset de `cells` para `[]` durante a carga.)
- **init de mount** (`kpi-principal-drawer:312`): `activeDates` passa a usar **initializer** `useState(() => pillToDates('este-ano'))`; o efeito de mount foi removido. (Remove um flash inicial de "Selecione um período" — equivalente/melhor.)
- **popover de período** (`shared/periodo-filter`, `shared/periodo-filter-pills-url`): os inputs são semeados no **handler de abrir** (evento), não num efeito on-open. Caminho de abertura é único (toggle) → comportamento idêntico.
- **carga de status do upload** (`admin/uploads/page:297`): `useEffect(() => { void (async () => { await carregarStatus() })() }, [carregarStatus])` — o `setState` cai após o `await` (não síncrono). `carregarStatus` segue um `useCallback` reusado (pós-upload e botão "atualizar"). StrictMode: igual ao anterior (dois loads no mount em dev; idempotente).
- **`immutability`** (`financeiro/gerencial/visualizacao-agregada-tab:78`): a soma acumulada por linha vira **prefix-sum** (`projecao.slice(0,i+1).reduce(...)`) — sem reassignar um `let` capturado. Valores idênticos (projeção ≤90 dias).

## M2 — Os 2 arriscados + CHECKPOINT (`e992022`, commit isolado)
- `weddings/sumario-subsetor.tsx` (`static-components` ×2): o `Wrapper` era definido **dentro do render** (tipo novo a cada render → **remontava** a subárvore). Hasteado para o **módulo**, `semBox` por prop. Conteúdo stateless → saída idêntica.
- **CHECKPOINT cumprido:** o componente só é usado em **um modo** (`semBox`, tabela sem caixa) e em **dois lugares** — o drawer do **KPI principal de Weddings** e o **drawer de drill-down**. **Yan conferiu visualmente os dois → renderização idêntica. Mantido** (não foi necessário o baseline/`eslint-disable`).

## M3 — Fechamento
4.27.2 (`package.json`+lock; `version.ts` deriva). CHANGELOG, CHANGELOG_DIRETORIA (breve, sem efeito visível), reforço no CLAUDE.md (convenção do ruleset react-hooks v7 + os padrões canônicos de correção), este out-briefing. **Sem ADR** (higiene).

---

## Migrations / ADRs
- Nenhuma migration. Nenhum ADR (higiene de lint, sem decisão arquitetural nova).

## Gate de fechamento
- `npx tsc --noEmit` → **0**.
- `npm run lint` → **VERDE (0 problemas)** — 1ª vez desde o bump do plugin.
- `npm test` → **246/246** (15 arquivos).
- `npm run build` → **limpo**.
- Conferência visual (Yan): tabela "Composição por Subsetor" idêntica nos 2 drawers.

## Achados / fora de escopo
- Outros débitos de lint que não os 12; `zinc`/paleta fechada do DS; demais tooling — **fora**.
- Backup-gate restante (durabilidade off-machine #3, COPY paralelo #4) — fila.

## Arquivos modificados
- `src/components/executiva/mix-setor-chart.tsx`, `src/components/financeiro/proximos-lancamentos-lateral.tsx` (2 triviais).
- `src/components/weddings/weddings-mix-section.tsx`, `src/components/financeiro/calendario-liquidez.tsx`, `src/components/weddings/kpi-principal-drawer.tsx`, `src/components/shared/periodo-filter.tsx`, `src/components/shared/periodo-filter-pills-url.tsx`, `src/app/admin/uploads/page.tsx`, `src/components/financeiro/gerencial/visualizacao-agregada-tab.tsx` (8 seguros).
- `src/components/weddings/sumario-subsetor.tsx` (2 arriscados).
- `package.json`, `package-lock.json` (4.27.2); `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `CLAUDE.md`, este out-briefing (M3).
