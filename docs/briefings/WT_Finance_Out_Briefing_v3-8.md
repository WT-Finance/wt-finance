# WT Finance — Out-Briefing v3.8

**Data:** 2026-05-20  
**Branch:** `feat/v3-8` (base: `feat/v3-7-design-system`)  
**Commits:** 13 missões + documentação

---

## O que foi entregue

### Refinamento visual (M1–M9)

**M1 — Cor Corporativo + logo sidebar**  
A aba Corporativo ganhou identidade visual própria: `#4B4F54` (Pantone 7540), separada do cinza institucional `#75777B` que permanece nas páginas neutras. A sidebar agora tem área reservada para o logo do Welcome Group — SVG oficial pendente de entrega por Yan.

**M2 — Cabeçalhos de seção Opção B** (ADR-0048)  
Componente `TopSection` extraído para uso compartilhado. Estilo definitivo: fundo `--brand-soft`, borda esquerda colorida, texto Heavy uppercase — identificação visual imediata do contexto de seção.

**M3 — Sidebar Performance persistente** (ADR-0049)  
Estado aberto/fechado do sub-menu de Performance salvo em `localStorage`. O usuário não precisa mais reabrir o menu a cada navegação.

**M4 — Tooltips Recharts no design system**  
Novo `CustomTooltip` compartilhado: usa tokens do design system (`var(--surface)`, `var(--border)`, fonte Avenir). Substituído em todos os gráficos da aba Weddings — visual consistente em vez do tooltip padrão do Recharts.

**M5 — KPI cards: fonte responsiva e alturas fixas** (ADR-0050)  
`clamp(20px, 2.5vw, 32px)` no valor principal — sem overflow em grids compactos. Zonas de altura fixa eliminam layout shift ao trocar filtros de período.

**M6 — Próximos Casamentos: layout limpo**  
De 7 para 3 colunas: Data do Evento, Casal, Hotel. Colunas financeiras removidas (redundantes com outros cards). Data no formato "12 out 2027". Drawer "Ver mais" para a lista completa dos 18 meses.

**M7 — Mix por Produto: sem scroll horizontal**  
Headers `whitespace-nowrap`, tabela sem `overflow-x-auto`. A tabela agora cabe confortavelmente no card sem scroll.

**M8 — Drawer "Ver mais" padrão** (ADR-0051)  
Componente `ListDrawer` compartilhado. Botão "Ver mais" substitui "Ver todos (N)" em todas as listas compactas. Padrão: 5 itens inline + restante no drawer. Zero layout shift.

**M9 — Performance com TopSection**  
`performance-content.tsx` migrado para `TopSection` — paridade visual com a aba Weddings. Removido código morto da chamada `get_sparklines` (deixada acidentalmente no v3.7-M6).

---

### Gráficos com filtro por Operação (M10)

Novo `DropdownOperacao` acima dos gráficos da seção "Visão Analítica por Operação" — permite filtrar Fluxo de Caixa Mensal e Acumulado de Recebimentos/Pagamentos por casamento específico.

Paleta harmonizada: entradas em `#0091B3` (teal), saídas em `#D9A23F` (âmbar), resultado em `#2D2A26`. Ponto vermelho no gráfico de linha quando resultado mensal é negativo.

O filtro usa URL state (`?operacao=...`) — compartilhável e preservado na navegação.

---

### Dados por Venda Nº (M11)

View `analytics.vw_vendas_agregadas` elimina dupla contagem nas análises. Uma venda com múltiplos produtos agora aparece como uma linha, não duas.

Política de situação: Aberta se qualquer produto estiver em aberto; Fechada apenas se todos estiverem fechados. (ADR-0045)

---

### Vendas com Receita Negativa (M12)

Card dedicado para Weddings, usando a view de agregação por Venda Nº. Terminologia corrigida: "Receita Negativa" em vez de "Prejuízo" — semanticamente preciso para o contexto de agenciamento turístico. (ADR-0046)

O `PrejuizosTable` genérico permanece na aba Performance (análise cross-setor por produto/vendedor).

---

### Lista de Operações reformulada (M13)

Simplificação drástica dos controles de filtro:

| Antes | Depois |
|-------|--------|
| Dropdown Situação (4 opções) | Pills horizontais: Todas / Realizados / Futuros |
| Dropdown Subsetor | Removido |
| Dropdown Ordenar por | Removido |
| Coluna Flags | Removida |
| Ponto colorido de situação | Removido |
| "Evento" | "Data do Evento" |
| "Custos Int." | "Custos" |
| Código W no nome | Só o nome do casal |
| Datas dd/mm/aa | "12 out 2027" |
| Default: Todos + sem ordem clara | Default: Realizados + Data do Evento desc |

Headers de coluna clicáveis para ordenação toggle com indicador ↑/↓.

---

## Estado do codebase

| Área | Status |
|------|--------|
| TypeScript (`npx tsc --noEmit`) | ✅ Limpo |
| Design system tokens | ✅ Completos e aplicados |
| Recharts tooltips | ✅ Custom em todos os gráficos Weddings |
| ADRs 0045–0051 | ✅ Documentados |
| Changelog | ✅ Atualizado |

---

## Limitações conhecidas e pendências para v3.9+

**Logo Welcome Group na sidebar**  
Espaço reservado com placeholder de texto. Yan precisa fornecer o SVG oficial para substituição.

**Fluxo de Caixa — granularidade efetivado/previsto intra-mês**  
Registrado desde v3.7. Para separar efetivado de previsto dentro de um mesmo mês, precisaria de RPC `get_fluxo_caixa_mensal_weddings` com campos separados. A base já tem a informação.

**Aba Trips e Corporativo**  
Ainda exibem `PerformanceContent` genérico. Conteúdo específico por setor depende de alinhamento com a diretoria.

**DropdownOperacao — bug de reset de paginação**  
Ao trocar de operação nos gráficos, a Lista de Operações (componente separado) não é afetada. Isso é correto por design — são dois contextos independentes. Se no futuro quisermos sincronizá-los, a URL state já está em posição para isso.

**Demonstração para a gestora de Weddings**  
Pendente desde v3.6. A v3.8 completou a reformulação da Lista de Operações — momento ideal para agendar demonstração estruturada.

---

## Arquivos-chave criados ou modificados na v3.8

```
src/styles/tokens.css                                    ← separação Corporativo / Group
src/components/layout/sidebar.tsx                        ← logo placeholder + localStorage
src/components/shared/top-section.tsx                    ← Opção B extraído como componente
src/components/charts/custom-tooltip.tsx                 ← novo: tooltip design system
src/components/shared/list-drawer.tsx                    ← novo: drawer "Ver mais"
src/components/shared/kpi-card.tsx                       ← clamp() + alturas fixas
src/components/weddings/proximos-casamentos-card.tsx     ← 3 colunas + fmtDateCompact
src/components/performance/mix-produto-table.tsx         ← sem scroll, header nowrap
src/components/weddings/fluxo-caixa-mensal.tsx           ← cores + ponto negativo + filtro
src/components/weddings/acumulado-receb-pag-chart.tsx    ← cores + label + filtro
src/components/weddings/dropdown-operacao.tsx            ← novo: seletor por URL state
src/components/weddings/vendas-em-aberto-card.tsx        ← novo tipo venda_no + drawer
src/components/weddings/vendas-receita-negativa-card.tsx ← novo: Receita Negativa Weddings
src/components/weddings/lista-operacoes.tsx              ← reformulação completa M13
src/components/performance/weddings-content.tsx          ← TopSection + filtro operação
src/components/performance/performance-content.tsx       ← TopSection + remove sparklines
src/lib/fmt.ts                                           ← fmtDateCompact
src/types/api.ts                                         ← VendaEmAberto, VendasReceitaNegativa, OperacoesLista
src/types/database.ts                                    ← get_acumulado_weddings p_operacao, RPCs M11/M12
supabase/migrations/0039_m10_filtro_operacao_acumulado.sql
supabase/migrations/0040_m11_vw_vendas_agregadas.sql
```
