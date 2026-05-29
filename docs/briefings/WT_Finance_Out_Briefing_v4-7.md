# WT Finance — Out-Briefing v4.7

**Data:** 2026-05-29  
**Branch:** `feat/v4-7` (base: `main` após merge de v4.6.1)  
**Commits:** 11 (M0–M7)  
**TypeScript:** limpo (`npx tsc --noEmit`)  
**Build:** limpo (`npx next build`)  
**Migrations aplicadas:** 0097–0098  
**ADRs:** 0091, 0092, 0093 (novos)  
**Versão:** 4.7.0  
**PR:** #79  

---

## Estrutura de execução (gating)

A v4.7 teve estrutura particular: **M0 (PEND-001) foi gating** — sequencial isolada, com checkpoint de validação em produção antes de liberar as demais. Após o Yan confirmar que a importação funcionava, M1–M6 rodaram em paralelo (Workflow) e M7 fechou.

---

## Missões implementadas

### M0 — PEND-001: importação Gerencial via API Route (ADR-0091)

A importação de planilha Excel do Fluxo de Caixa Gerencial estava quebrada em produção desde a v4.6 ("An error occurred in the Server Components render"). A causa raiz: `@e965/xlsx` falha no SSR/RSC do Next.js 16 quando o parser convive com Server Actions na mesma cadeia de import.

**Solução:** mover parse + diff + commit para uma **API Route** (`/api/gerencial/import`, `runtime = 'nodejs'`), isolada do contexto RSC.

- `src/app/api/gerencial/import/route.ts` (novo) — POST com `action=preview|commit`; parse + diff + `batch_gerencial_import`
- `src/lib/gerencial/import-types.ts` (novo) — tipos puros + `chaveDuplicata` (sem xlsx, sem server)
- `src/lib/gerencial/parser.ts` — import estático de `@e965/xlsx`, consumido só pela API Route
- `src/components/financeiro/gerencial/import-drawer.tsx` — só `fetch` multipart, sem parser/Server Action de Excel
- `actions.ts` — removidos `computeImportDiff`/`commitImport` e toda referência a `parser.ts`
- `base-dados-tab.tsx` — `ImportDrawer` com import normal (drawer limpo, sem `ssr:false`)

**Parser robusto (dois bugs adicionais revelados pela planilha real):**
- `parseValorMonetario` — valores formatados como moeda (`R$ 1,000.00` US e `R$ 1.000,00` BR); detecta o separador decimal pelo último separador presente
- `parseVencimento` — datas `DD/MM/YYYY` brasileiras, ISO, US `MM/DD`, ano 2 dígitos, Date object (UTC-safe), serial Excel
- `parseTipo` — case-insensitive + variantes (Pagar/Despesa/Saída, Receber/Entrada/Receita)
- Warnings de diagnóstico mostram valor cru + tipo do dado

**Validação:** 33/33 casos unitários (12 moeda + 16 data + 17 tipo — sobrepostos) + smoke test end-to-end (preview/commit HTTP 200) + checkpoint validado pelo Yan em produção com a planilha real (143 linhas).

**Arquivos:** `src/app/api/gerencial/import/route.ts`, `src/lib/gerencial/import-types.ts`, `src/lib/gerencial/parser.ts`, `src/components/financeiro/gerencial/import-drawer.tsx`, `src/app/financeiro/fluxo-caixa/gerencial/actions.ts`, `src/components/financeiro/gerencial/base-dados-tab.tsx`, `docs/adr/0091-import-via-api-route.md`

---

### M1 + M2 — Drawer de Análise Histórica (ADR-0092)

Reformulação do drawer do card principal de Weddings, de "métricas-com-gráficos" para análise histórica estruturada.

**M1 — estrutura:**
- Título → "Análise Histórica"; subtítulo → "Análise da evolução histórica de faturamento e receita do setor"
- 6 KPIs (Faturamento, Receita, Margem, Nº Vendas, Ticket Médio, Rec. Média) movidos para o **topo** em faixa 3×2 com divisórias finas, sem cards cinza — valores em `var(--brand)`, labels uppercase pequeno
- Pills: Este ano (default) / Últ. 3 meses / Últ. 6 meses / Últ. 12 meses / Personalizado. Removidas "Este mês" e "Mês anterior". **Sticky** ao rolar.
- "Personalizado": month picker (seleção por mês), trava de meses futuros
- Composição por Subsetor trazida para dentro do drawer **sem box** (prop `semBox` no `SumarioSubsetorCard`), com "no período selecionado" em dourado; linha "Não Classif." preservada
- Comparação Ano Anterior e Tendência de Margem mantidos

**M2 — gráficos stacked por subsetor:**
- **Migration 0097:** RPC `get_weddings_historico_subsetor(p_from, p_to)` → série mensal `{ mes, subsetor, faturamento, receita }`, joins idênticos ao 0077 (DISTINCT ON produto_normalizado)
- Dois gráficos stacked bars: Faturamento por subsetor e Receita por subsetor, com a **MESMA escala Y** (domínio do faturamento) e alinhados — barras de receita visivelmente menores (proposital)
- Cores via tokens `--subsetor-*`; legenda única compartilhada; tooltip por subsetor

**Coordenação:** M1 e M2 tocam o mesmo arquivo (`kpi-principal-drawer.tsx`) → rodaram **sequenciais** (M1 deixou placeholder, M2 preencheu).

**Arquivos:** `src/components/weddings/kpi-principal-drawer.tsx`, `src/components/weddings/sumario-subsetor.tsx`, `supabase/migrations/0097_get_weddings_historico_subsetor.sql`, `docs/adr/0092-drawer-analise-historica.md`

---

### M3 — Remover Composição por Subsetor da vista principal

A Composição por Subsetor passou a viver só no drawer (M1). Removida da vista principal de Weddings (`weddings-content.tsx`); o componente órfão `weddings-composicao-section.tsx` foi deletado. `sumario-subsetor.tsx` preservado (reusado pelo drawer). Layout renumerado, sem espaço vazio.

**Arquivos:** `src/components/performance/weddings-content.tsx`, `src/components/weddings/weddings-composicao-section.tsx` (deletado)

---

### M4 — Composição dos Lançamentos: donuts + drill-down + fix agregação (ADR-0093)

**M4.1 — correção da agregação (bug):** A RPC `get_decomposicao_grupo` consumia `vw_decomposicao_grupo`, que agrupa por `(mes, grupo, sinal)` — devolvia uma linha por mês, repetindo a mesma label de grupo. **Migration 0098** reescreve a RPC para agregar por `(grupo_categoria, sinal)` no período (lê direto de `fato_lancamentos JOIN dim_categoria`, mesma lógica de sinal da view), retornando `ABS(SUM)` (magnitude). Nova RPC `get_decomposicao_categoria(p_from, p_to, p_grupo)` para o drill-down.

Validação contra dados reais: **3 grupos de entrada / 12 de saída, zero labels duplicadas**, Receita de Vendas 96,3%, Repasse 50,5% — batem com a referência do briefing.

**M4.2/M4.3 — donuts + drill-down:**
- Dois donuts (Entradas | Saídas), Recharts PieChart com innerRadius; centro = total do lado
- Fatias = grupos por proporção; "Outros" agrega a cauda (Saídas)
- Legenda clicável; drill-down inline em **lista** de categorias do grupo (Receita de Vendas → 8 categorias; RH → 21), com botão voltar
- Subtítulo "no período selecionado" + nota de regime contábil mantidos

**Arquivos:** `src/components/financeiro/composicao-lancamentos.tsx`, `src/app/financeiro/fluxo-caixa/page.tsx`, `src/types/database.ts`, `supabase/migrations/0098_fix_decomposicao_grupo.sql`, `docs/adr/0093-composicao-lancamentos-donuts.md`

---

### M5 — Calendário de Liquidez: novo formato de dia

Cada célula de dia reformatada: número do dia + linhas "A receber" / "A pagar" / "Saldo" com label à esquerda e valor à direita. Label "Saldo" do mesmo tamanho das outras, mas valor do saldo em destaque maior. Sinais +/− removidos (labels esclarecem; heatmap verde/vermelho comunica). Responsividade tratada (tabular-nums, truncate).

**Arquivos:** `src/components/financeiro/calendario-liquidez.tsx`

---

### M6 — Projeção diária Gerencial: 15 dias fixos

`get_gerencial_projecao_diaria` chamada com `p_dias: 15` (era 90). Feito inline antes da fase paralela, pois compartilha `fluxo-caixa/page.tsx` com M4.

**Arquivos:** `src/app/financeiro/fluxo-caixa/page.tsx`

---

### M7 — Fechamento

- `package.json` → `4.7.0`
- `CHANGELOG.md` entrada `[4.7.0]` completa
- ADRs 0091–0093 registrados
- `prefer-const` corrigido no parser

---

## Orquestração (Workflow paralelo)

Após o checkpoint de M0, as missões rodaram via **Workflow** com paralelização segura:
- **Track A (sequencial):** M1 → M2 (mesmo arquivo `kpi-principal-drawer.tsx`)
- **Track B (paralelo):** M3, M4, M5 (arquivos disjuntos)
- **M6** feito inline antes (compartilha page.tsx com M4)

Os subagentes apenas editaram arquivos; o orquestrador centralizou build, aplicação de migrations (0097/0098), smoke tests e commits por missão — evitando race de índice git, banco e portas.

---

## Migrations

| Nº | Descrição | Status |
|----|-----------|--------|
| 0097 | RPC `get_weddings_historico_subsetor` — série mensal por subsetor (Weddings) | ✅ Aplicada |
| 0098 | Fix `get_decomposicao_grupo` (agregação por grupo no período) + nova `get_decomposicao_categoria` (drill-down) | ✅ Aplicada |

---

## Estado final do codebase

| Área | Status |
|------|--------|
| TypeScript (`npx tsc --noEmit`) | ✅ Limpo |
| Build (`npx next build`) | ✅ Sem erros |
| Migrations 0097–0098 | ✅ Aplicadas no remote |
| ADRs 0091–0093 | ✅ Documentados |
| Importação Gerencial (PEND-001) | ✅ Resolvida e validada em produção |
| Smoke tests (`/financeiro/fluxo-caixa`, `/performance/weddings`) | ✅ HTTP 200, sem regressão |
| PR #79 | ✅ Aberto, pronto para merge |

---

## Pendências para v4.8+

### v4.8 reservada (DRE) — 6º adiamento formal
- DRE evolutiva mensal
- Segregar Conta Investimento XP como Receitas Financeiras
- Comparativo mês atual vs média YTD; Top despesas do mês
- Decomposição Receita Bruta turismo vs Receita Líquida contábil

### Revisões adiadas
- Posição por Conta (revisão maior — não mudou na v4.7)
- Conectividade cross-section; persistência de expansão das Section; lançamentos em atraso

### Decorrentes da v4.6 ainda abertas
- `page.tsx` ainda chama `get_fluxo_caixa_kpis_b` em vez de `_diario`; migrar e dropar a `_b`
- Favicon: confirmar se ficou quadrado; decisão dark mode branco vs dourado
- Cores de setor identitárias (Lazer #378ADD, Corporativo #0F6E56) como tokens `--setor-*`
- Auditoria por usuário na feature Gerencial; sincronização saldos manuais × dim_conta_bancaria
- Limpeza do action órfão `fetchWeddingsComposicao` (sem consumidores após M3)

### Operacionais (não-código)
- Demonstração para a gestora de Weddings — momento ideal AGORA com o drawer reformulado
- 20 operações Weddings graves no ERP; 29 com formato errado de Operação Própria
- 725 títulos + 554 lançamentos sem Conta (cadastral progressivo)
- Recategorização contábil Reembolso Fornecedor (R$ 4,6 Mi em Receita de Vendas)

---

## Arquivos modificados ou criados na v4.7

```
src/app/api/gerencial/import/route.ts                          ← novo: API Route import (runtime nodejs)
src/lib/gerencial/import-types.ts                              ← novo: tipos puros + chaveDuplicata
src/lib/gerencial/parser.ts                                    ← parser robusto (moeda, data BR, tipo)
src/components/financeiro/gerencial/import-drawer.tsx          ← só fetch multipart
src/app/financeiro/fluxo-caixa/gerencial/actions.ts            ← removido Excel; só CRUD
src/components/financeiro/gerencial/base-dados-tab.tsx         ← ImportDrawer import normal
src/components/weddings/kpi-principal-drawer.tsx               ← drawer Análise Histórica (M1+M2)
src/components/weddings/sumario-subsetor.tsx                   ← prop semBox
src/components/performance/weddings-content.tsx                ← remove Composição da vista principal
src/components/weddings/weddings-composicao-section.tsx        ← deletado (órfão)
src/components/financeiro/composicao-lancamentos.tsx           ← donuts + drill-down
src/components/financeiro/calendario-liquidez.tsx              ← novo formato de dia
src/app/financeiro/fluxo-caixa/page.tsx                        ← RPC categoria + projeção 15d
src/types/database.ts                                          ← assinatura get_decomposicao_categoria
package.json / CHANGELOG.md                                    ← version 4.7.0
docs/adr/0091-import-via-api-route.md                          ← novo
docs/adr/0092-drawer-analise-historica.md                     ← novo
docs/adr/0093-composicao-lancamentos-donuts.md                 ← novo
supabase/migrations/0097_get_weddings_historico_subsetor.sql   ← novo
supabase/migrations/0098_fix_decomposicao_grupo.sql            ← novo
```
