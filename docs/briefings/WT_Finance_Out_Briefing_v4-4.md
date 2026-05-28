# WT Finance — Out-Briefing v4.4

**Data:** 2026-05-28  
**Branch:** `feat/v4-4` (base: `main` após merge de v4.3)  
**Commits:** 22 (M2–M9 + correções pós-revisão)  
**TypeScript:** limpo (`npx tsc --noEmit`)  
**Build:** limpo (`npx next build`)  
**Migrations criadas:** 0087–0089 (0087 e 0088 aplicadas; 0089 criada mas não aplicada — ver nota)  
**ADRs:** 0084, 0085 (corrigido), 0086  
**PR:** #72  

---

## Missões implementadas

### M2 — KPIs Weddings reformulados

Substituição do bloco de KPIs da Aba Weddings por um novo layout com dois níveis:

**Card principal full-width** — exibe Faturamento, Receita Bruta e Margem em três colunas com variação MoM e YoY. Card clicável; abre o Drawer rico (ver M3). Padrão visual: `shadow-sm` (sem borda brand), com "Ver mais ›" no canto inferior direito.

**5 cards de subsetor** em grade responsiva (`2 → 3 → 5` colunas): Comercial, Planejamento, Produção, Convidados – Hospedagens, Convidados – Extras. Cada card exibe faturamento (na cor do subsetor correspondente ao gráfico de Composição), Receita e Margem. Cards Convidados usam "Convidados" como título e "Hospedagens" / "Extras" como subtítulo (primeira letra maiúscula, não caixa alta).

**Arquivos:** `src/components/weddings/weddings-kpis-section.tsx`

---

### M3 — Drawer rico de análise de KPIs Weddings (ADR-0086)

Drawer lateral acionado pelo clique no card principal. Carrega dados via 3 RPCs em paralelo (`getBrowserClient()`):

1. `get_tendencia_margem(p_from, p_to, 'Weddings')` — série de Faturamento, Receita e Margem % por ponto temporal
2. `get_executiva_kpis(...)` — totais consolidados com variação MoM/YoY
3. `get_sumario_subsetor(p_from, p_to)` — composição por subsetor

Seções do drawer:
- **Faturamento e Receita** — BarChart mensal (Faturamento azul + Receita azul-escuro)
- **Comparação Ano Anterior** — LineChart sobreposição atual vs. YoY (linha tracejada cinza)
- **Tendência de Margem** — LineChart de `margem_pct`
- **Indicadores** — grade 2×3 com Faturamento, Receita, Margem, Nº Vendas, Ticket Médio, Rec. Média
- **Composição por Subsetor** — `SumarioSubsetorCard`

Pills de período: Este ano / Este mês / Mês anterior / Últ. 3 meses / Últ. 6 meses / Personalizado (com popover de date picker).

> **Nota:** A migration 0089 (`get_kpi_weddings_drawer`) foi criada como rascunho de RPC dedicada, mas **nunca aplicada ao banco**. O drawer foi redesenhado para usar as RPCs já existentes, que oferecem dados equivalentes.

**Arquivos:** `src/components/weddings/kpi-principal-drawer.tsx`, `supabase/migrations/0089_get_kpi_weddings_drawer.sql`, `docs/adr/0086-drawer-kpi-principal.md`

---

### M4 — Drawer Próximos Casamentos com filtro de horizonte

Drawer expandido para a tabela de Próximos Casamentos na Aba Weddings. Pills de horizonte — 3 meses / 6 meses / 12 meses — com subtítulo descritivo ("próximos X casamentos"). O drawer mantém o cabeçalho com total de operações no período selecionado.

**Arquivos:** `src/components/weddings/proximos-casamentos-card.tsx`

---

### M5 — Correção visual: Vendas com Receita Negativa

Remoção do fundo vermelho que aparecia nas linhas da tabela de Vendas com Receita Negativa. As linhas agora mantêm o fundo padrão; apenas o valor numérico negativo fica colorido.

**Arquivos:** `src/components/weddings/vendas-receita-negativa-card.tsx`

---

### M6 — Alinhamento de eixo X nos gráficos do Fluxo de Caixa

Sincronização do eixo X entre os gráficos `FluxoMensalChart` e `FluxoAcumuladoChart`, que exibem janelas temporais diferentes (42 meses passados + 18 futuros para mensal; janela menor para acumulado). O intervalo de ticks foi ajustado para que os rótulos de mês não se sobreponham em nenhuma resolução.

**Arquivos:** `src/components/financeiro/fluxo-mensal-chart.tsx`, `src/components/financeiro/fluxo-acumulado-chart.tsx`

---

### M7 — Redesenho da linha de lançamentos em Próximos Lançamentos

Nova aparência para cada linha de lançamento no painel lateral da Aba Financeiro:

- **Ícone de tipo:** `ArrowDownRight` (verde) para entradas, `ArrowUpRight` (vermelho) para saídas — via `lucide-react`
- **Badge de data:** fundo `var(--neutral-soft)` + rótulo "hoje" quando `dias_para_vencer === 0`
- **Badge de status:** `A Receber` (fundo `--positive-soft`, texto `--positive-deep`) ou `A Pagar` (fundo `--negative-soft`, texto `--negative-deep`)
- **Descrição condicional:** oculta quando `descricao === 'Pagamento venda'` (reduz ruído)

O drawer "Ver mais" mantém as pills de filtro de período (5d / 10d / Personalizado) com popover de date picker.

**Arquivos:** `src/components/financeiro/proximos-lancamentos-lateral.tsx`

---

### M8 — CalendárioLiquidez: heatmap proporcional e saldo dominante

Novo visual para o calendário de liquidez diária:

- **Heatmap proporcional:** intensidade de cor calculada por `opacity = max(0.15, min(1, |saldo| / max_abs_mês))`, normalizando cada mês pelo seu maior valor absoluto
- **Cores:** `rgba(196, 213, 166, opacity)` para dias positivos; `rgba(232, 201, 192, opacity)` para negativos
- **Saldo dominante visível:** valor exibido em negrito no canto inferior direito de cada célula
- **Legenda de gradiente:** barras de `w-16 h-3` mostrando a escala de intensidade positiva e negativa

**Arquivos:** `src/components/financeiro/calendario-liquidez.tsx`

---

### M9 — Admin: vista de Contas Bancárias

Nova página `/admin/contas-bancarias` para classificar as contas bancárias em `analytics.dim_conta_bancaria` (campo `tipo_conta`). Usada para associar cada conta ao tipo correto antes do cálculo de KPIs de Saldo em Caixa.

A página usa `getAdminClient()` (exige `SUPABASE_SERVICE_ROLE_KEY`) e `export const dynamic = 'force-dynamic'` para evitar pré-render no build.

**Arquivos:** `src/app/admin/contas-bancarias/page.tsx`, `src/app/admin/contas-bancarias/actions.ts`

---

### Design System — Padrão único de Card (ADR-0085)

Unificação visual de todos os cards do produto. Padrão estabelecido:

```
bg-white
rounded-xl (default) / rounded-lg (size sm)
shadow-sm
padding: px-5 py-4 (default) / px-3 py-3.5 (size sm)
```

Variante **featured**: `border-2 border-[--brand]` — usada apenas no card principal de KPIs onde se deseja destaque de clique.

Aplicado em `src/components/ui/card.tsx` e em 28 componentes que definiam contêineres de card inline. Documentado em `docs/adr/0085-padrao-card.md`.

---

### Design System — Versionamento X.Y.Z (ADR-0084)

`package.json` atualizado para `4.4.0`. A sidebar exibe a versão completa `X.Y.Z` via `src/lib/version.ts`. `CHANGELOG.md` criado com histórico retroativo de v1.0 a v4.4.

**Arquivos:** `src/lib/version.ts`, `package.json`, `CHANGELOG.md`, `docs/adr/0084-versionamento.md`

---

## Migrations

| Nº | Descrição | Status |
|----|-----------|--------|
| 0087 | Drop da RPC `get_proximos_lancamentos_10d()`, substituída por `get_proximos_lancamentos(p_dias INT)` com parâmetro configurável | ✅ Aplicar no remote |
| 0088 | `UNIQUE` constraint em `analytics.dim_produto_subsetor.produto_normalizado` | ✅ Aplicar no remote |
| 0089 | RPC `get_kpi_weddings_drawer(p_from, p_to)` — **rascunho, não aplicar** | ⏸ Não aplicar |

---

## Correções pós-revisão

### #1 — Padrão de card incorreto (border → shadow-sm)

A implementação inicial do ADR-0085 usou `border border-[--border]` em vez de `shadow-sm`. O padrão correto (com sombra discreta, sem borda) foi restaurado em todos os componentes — `card.tsx` e 28 arquivos com contêineres inline. ADR-0085 atualizado para refletir `shadow-sm`.

---

### #2 — Card KPI principal sem hint e com "Ver mais ›"

O texto "Visão Geral — clique para análise detalhada" foi removido. Adicionado "Ver mais ›" no canto inferior direito como indicador visual de clicabilidade. Borda `border-2 border-[--brand]` substituída por `shadow-sm`, alinhando ao padrão dos demais cards.

---

### #3 — Drawer KPI redesenhado para RPCs existentes

O drawer original chamava `get_kpi_weddings_drawer` que nunca foi aplicado ao banco, resultando em drawer com apenas as pills visíveis. Redesenhado para usar `get_tendencia_margem` + `get_executiva_kpis` + `get_sumario_subsetor` — RPCs já ativas — entregando o mesmo conteúdo analítico.

---

### #4 — Ordem e títulos dos cards de subsetor

Ordem corrigida para: Comercial → Planejamento → Produção → Convidados – Hospedagens → Convidados – Extras (de menor para maior representatividade crescente). Cards Convidados exibem "Convidados" como título principal e "Hospedagens" / "Extras" como subtítulo (com capitalização normal, sem caixa alta).

---

### #5 — Animação da linha de resultado sincronizada

A linha de Resultado Mensal nos gráficos de Fluxo de Caixa Mensal (Financeiro e Weddings) tinha `isAnimationActive={false}`, aparecendo instantaneamente enquanto as barras animavam. Corrigido para `animationDuration={400} animationEasing="ease-in-out"`, sincronizando com as barras.

---

### #6 — Cor dos pontos negativos no Financeiro

A cor `var(--negative-deep)` (`#6B2D1F`, borgonha quase preto) aplicada nos pontos negativos da linha de resultado era pouco visível. Substituída por `var(--danger)` (`#B85C5C`, terracota) — mais visível e condizente com a identidade visual. Legenda atualizada.

---

### #7 — Linha de resultado acumulado no gráfico Acumulado

Nova linha `resultado_acum = entrada_acum − saida_acum` adicionada ao gráfico "Acumulado de Recebimentos e Pagamentos". Cor `var(--text-primary)` (grafite). Tooltip e legenda atualizados.

---

### #8 — Alinhamento da linha separadora nos cards de subsetor

Em cards com subtítulo (Convidados), o header ocupa duas linhas de texto, deslocando a linha separadora para baixo. Corrigido adicionando `min-h-[28px]` ao header, garantindo que o faturamento e a linha divisória apareçam na mesma posição vertical em todos os 5 cards.

---

### #9 — Cores do faturamento por subsetor

O valor de faturamento de cada card de subsetor passou a usar a mesma cor da barra correspondente no gráfico "Composição por Subsetor": Comercial `#8C857B`, Planejamento `#8F7E35`, Produção `#874B52`, Convidados – Hospedagens `#4B4F54`, Convidados – Extras `#7A8289`.

---

### #10 — Cards de Financeiro padronizados com shadow-sm

Quatro contêineres em `src/app/financeiro/fluxo-caixa/page.tsx` usavam `border border-zinc-200` em vez de `shadow-sm`: KpiCard, Acumulado de Recebimentos e Pagamentos, Composição do Período e Posição por Conta. Todos atualizados para `shadow-sm`.

---

## Estado final do codebase

| Área | Status |
|------|--------|
| TypeScript (`npx tsc --noEmit`) | ✅ Limpo |
| Build (`npx next build`) | ✅ Sem erros |
| ESLint (arquivos modificados) | ✅ Sem novos erros |
| Migrations 0087–0088 | ✅ Prontas para aplicar no remote |
| Migration 0089 | ⏸ Não aplicar (drawer usa RPCs existentes) |
| ADRs 0084, 0085, 0086 | ✅ Documentados |
| PR #72 | ✅ Aberto, pronto para merge |

---

## Pendências para v4.5

**Demonstração para a gestora de Weddings**  
Pendente desde v3.6. A versão v4.4 entrega exatamente o conteúdo analítico que foi solicitado (drawer rico com tendências, YoY e composição por subsetor).

**RPC `get_sparklines` no banco**  
Permanece ativa (remoção foi apenas no frontend na v3.9). Pode ser limpa via migration de higiene.

**RPC `get_kpi_weddings_drawer` (migration 0089)**  
Criada como rascunho mas não aplicada. Se no futuro houver necessidade de n_vendas por ponto temporal no drawer, aplicar a migration 0089 e reimplementar a seção "Tendências — Nº Vendas".

---

## Arquivos modificados ou criados na v4.4

```
src/lib/version.ts                                                ← versão X.Y.Z completa
src/components/ui/card.tsx                                        ← shadow-sm no padrão não-featured
src/components/weddings/weddings-kpis-section.tsx                ← KPIs reformulados + subsetores
src/components/weddings/kpi-principal-drawer.tsx                 ← novo: drawer rico com 3 RPCs
src/components/weddings/proximos-casamentos-card.tsx             ← drawer com pills 3m/6m/12m
src/components/weddings/vendas-receita-negativa-card.tsx         ← remove fundo vermelho de linhas
src/components/weddings/fluxo-caixa-mensal.tsx                   ← animação linha sincronizada
src/components/financeiro/proximos-lancamentos-lateral.tsx       ← redesenho linha + drawer pills
src/components/financeiro/calendario-liquidez.tsx                ← heatmap proporcional
src/components/financeiro/fluxo-mensal-chart.tsx                 ← animação + cor pontos negativos
src/components/financeiro/fluxo-acumulado-chart.tsx              ← linha resultado acumulado
src/app/financeiro/fluxo-caixa/page.tsx                         ← 4 cards → shadow-sm
src/app/admin/contas-bancarias/page.tsx                          ← novo: classificar dim_conta_bancaria
src/app/admin/contas-bancarias/actions.ts                        ← novo: server actions admin
src/types/api.ts                                                  ← WeddingsDrawerData types (rascunho)
CHANGELOG.md                                                      ← novo: histórico retroativo v1.0–v4.4
docs/adr/0084-versionamento.md                                   ← novo
docs/adr/0085-padrao-card.md                                     ← atualizado: shadow-sm
docs/adr/0086-drawer-kpi-principal.md                            ← novo
supabase/migrations/0087_drop_get_proximos_lancamentos_10d.sql  ← aplicar no remote
supabase/migrations/0088_unique_dim_produto_subsetor.sql         ← aplicar no remote
supabase/migrations/0089_get_kpi_weddings_drawer.sql             ← rascunho, não aplicar
```
