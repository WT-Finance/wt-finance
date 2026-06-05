# WT Finance — Out-Briefing v4.10

**Data:** 2026-06-04 · **Branch:** `feat/v4-10` · **Versão:** 4.9.2 → **4.10.0** (MINOR)
**Tema:** Ativação das abas Trips e Corporativo + sistema de cores canônico. ADR-0103.

---

## Missões implementadas

| # | Missão | Resultado |
|---|--------|-----------|
| M1 | Sistema de cores canônico (ADR-0103) | Cash-flow → `--positive`/`--negative`; margem → `--brand-deep`; fallback subsetor → `--brand` central; Mix por Produto → tokens de texto. Tokens `--chart-fluxo-*` removidos (colisão de Trips). |
| M2 | Drawer rico parametrizável por setor | `KpiPrincipalDrawer` ganha `setor`; subsetores podados quando ≠ Weddings; Trips/Corp abrem o rico (não o simples). Weddings intacto. |
| M3 | Pills de período | `PeriodoPillsUrl` (URL-synced) no PerformanceContent; pill ativa na cor da aba. |
| M4 | Afordância de clique | `kpi-drawer-trigger` na convenção `.card-clicavel` (hover na cor da aba); fim do azul hardcoded. |
| M5 | Top Vendedores | `TopVendedoresCard` (5 + Ver mais, Faturamento + Receita); agrega `get_ranking_vendedores` (mensal) pelos meses do período. |
| M6 | Vendas em Aberto / Receita Negativa | Vendas em Aberto via **migration 0114** (`get_vendas_em_aberto` por setor) + `VendasEmAbertoCard` reusado; Receita Negativa já presente (`PrejuizosTable`/`get_prejuizos`). |
| M7 | Ocultar CAGR | `MOSTRAR_CAGR=false` no PerformanceContent (código + RPC mantidos). |
| M8 | Ativar abas | Gate `?preview=1` removido de `/trips` e `/corporativo`. |
| M9 | Fechamento | version 4.10.0, CHANGELOG, ADR-0103, CLAUDE.md, este out-briefing, smoke. |

---

## Migration

| # | O quê | Estado |
|---|-------|--------|
| **0114** | `get_vendas_em_aberto(p_setor, p_limite, p_offset)` — generaliza a lógica weddings (vendas `situacao='Aberta'` na `vw_vendas_agregadas`, conceito por venda) para qualquer setor. Aditiva (RPC nova; a weddings antiga é mantida dormente). | **Aplicar na consolidação (com confirmação)** + verificar via REST (anon <3s) |

Única migration da versão. Aplicar **antes do merge** (a `/trips` e `/corporativo` chamam a RPC ao deployar). Verificar: `get_vendas_em_aberto` para `p_setor='Lazer'` e `'Corporativo'` retorna vendas; cabe no timeout anon.

## ADR
- **0103** — Paleta de cores canônica (cor por contexto semântico, via token); extensão do ADR-0095. Documenta a tabela canônica e as duas cores por setor (destaque `--brand` vs identidade `--setor-*`).

---

## ⚠️ Telas que mudaram de cor (intencional — Opção B)

A unificação do cash-flow para `--positive`/`--negative` (verde/terracota) muda visualmente:
1. **Weddings — card "Fluxo de Caixa Mensal de Weddings"**: entrada turquesa (#0091B3) → verde sage (`--positive`); saída mostarda (#D9A23F) → terracota (`--negative`).
2. **Weddings — gráfico "Caixa Acumulado por Mês"** (`acumulado-receb-pag-chart`): idem.
   - Ambos agora **acompanham o drawer de operação** (Caixa Acumulado no drilldown), que já era verde/terracota — antes havia duas paletas para a mesma semântica.
3. **Weddings — "Tendência de Margem"** (gráfico genérico `tendencia-margem-chart`, usado no margem-drawer): indigo (#6366f1) → `--brand-deep` (oliva), unificando com a Tendência de Margem do drawer rico.
4. **Financeiro — "Fluxo Acumulado"**: ponto/linha de referência negativos `#B85C5C` → `var(--danger)` (tokenização; mesmo hex, **sem mudança visual**).
5. **Mix por Produto** (Trips/Corp/Geral): textos de valor passam de cinza Tailwind cru para tokens (variação visual mínima).

Nenhuma mudança de cor de SÉRIE em Trips/Corp por si (eram preview); as cores deles herdam a aba via `--brand` (turquesa/verde-escuro).

---

## Gates
- ✅ `npx tsc --noEmit` zero erros · ✅ `npx next build` limpo.
- ✅ `npm run lint`: arquivos editados sem warning/erro NOVO (baseline pré-existente do React Compiler inalterado).
- ⏳ Smoke visual em `/trips` e `/corporativo` (preview do deploy) + verificação REST da 0114 — no fechamento/pós-merge.

## Pendências / follow-up
- **Ranking de vendedores por range** — uma RPC de ranking por período eliminaria o fan-out mensal do M5 (hoje agrega chamadas mensais paralelas).
- **CAGR** — fora por ora (M7); revisar com horizonte de dado confiável por setor.
- **Qualidade do dado de Trips/Corp** — não auditada a fundo (a v4.9.x auditou Weddings); investigar se a diretoria questionar números.
- **Dívida de cor remanescente (incremental):** `historico-12m-chart`/`RitmoDiarioChart`/`HistoricoMensalChart` ainda hardcodam as cores de setor (deveriam usar `SETOR_COLORS`); `VendasEmAbertoCard` e trilhos `bg-zinc-*` usam cinzas Tailwind. Fora do escopo das 4 divergências do M1; migrar quando tocados.
- Pendências herdadas da v4.9.x (curadoria ERP: venda_n trocados, nomes defasados; Posição por Conta; RPA) seguem abertas.

## CLAUDE.md
Adicionada convenção permanente: paleta de cores canônica (ADR-0103) + as duas cores por setor (destaque vs identidade).

## Arquivos
**Novos:** `docs/adr/0103-*.md`; `src/components/performance/top-vendedores-card.tsx`; `src/components/shared/periodo-pills-url.tsx`; `supabase/migrations/0114_*.sql`; `docs/briefings/WT_Finance_Out_Briefing_v4-10.md`.
**Modificados:** `src/components/charts/chart-theme.ts`; `src/styles/tokens.css`; `src/lib/config.ts` (sem mudança — já central); `src/components/weddings/{kpi-principal-drawer,weddings-kpis-section,sumario-subsetor,fluxo-caixa-mensal,acumulado-receb-pag-chart}.tsx`; `src/components/performance/{performance-content,tendencia-margem-chart,mix-produto-table}.tsx`; `src/components/financeiro/fluxo-acumulado-chart.tsx`; `src/components/shared/kpi-drawer-trigger.tsx`; `src/app/admin/design-system/page.tsx`; `src/app/performance/{trips,corporativo}/page.tsx`; `package.json`; `CHANGELOG.md`; `CLAUDE.md`.
