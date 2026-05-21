# WT Finance — Out-Briefing v3.8

**Data:** 2026-05-21  
**Branch:** `feat/v3-8` (base: `feat/v3-7-design-system`)  
**Commits:** 47 (13 missões + 13 correções pós-review + docs)  
**TypeScript:** limpo (`npx tsc --noEmit --skipLibCheck`)  
**Migrations aplicadas:** 0039, 0040, 0041, 0042

---

## Missões implementadas

### M1 — Cor Corporativo #4B4F54 + logo sidebar (ADR-0047)

`[data-theme="corporativo"]` foi separado de `[data-theme="group"]`. Corporativo agora usa `#4B4F54` (Pantone 7540), enquanto as páginas neutras (home, executiva) mantêm `#75777B` (Pantone Cool Gray 9). A sidebar ganhou espaço reservado com placeholder de texto para o logo Welcome Group — SVG oficial a ser inserido quando disponível.

**Arquivo:** `src/styles/tokens.css`, `src/components/layout/sidebar.tsx`

---

### M2 — Cabeçalhos de seção Opção B (ADR-0048)

Componente `TopSection` extraído para `src/components/shared/top-section.tsx`. Estilo definitivo: fundo `--brand-soft`, borda esquerda `--brand` com pontas arredondadas (`rounded-full` em elemento absoluto), texto Heavy uppercase `--brand-deep`, chevron rotacionado 90° quando aberto. Cor muda automaticamente conforme o setor ativo.

**Arquivo:** `src/components/shared/top-section.tsx`

---

### M3 — Sidebar Performance persistente (ADR-0049)

Estado aberto/fechado do sub-menu de Performance salvo em `localStorage` com a chave `sidebar-perf-open`. Inicializado `true` por padrão; valor lido via `useEffect` após hidratação para evitar mismatch SSR.

**Arquivo:** `src/components/layout/sidebar.tsx`

---

### M4 — Tooltips Recharts no design system

Criado `src/components/charts/custom-tooltip.tsx` (Client Component). Usa tokens CSS: `var(--surface)`, `var(--border)`, sombra `0 4px 12px rgba(45,42,38,0.08)`, fonte Avenir. Props `labelFormatter` e `formatter` permitem formatação por gráfico. Substituído o tooltip padrão do Recharts em todos os gráficos da aba Weddings.

**Arquivo:** `src/components/charts/custom-tooltip.tsx`

---

### M5 — KPI cards: fonte responsiva e alturas fixas (ADR-0050)

Valor principal: `font-size: clamp(16px, 1.8vw, 26px)` com `whitespace-nowrap` — sem quebra de linha em grids compactos de 6 colunas. Zonas de altura fixa eliminam layout shift ao trocar filtros de período: label `h-8` (2 linhas), valor `min-h-16`, nota proporcional `h-4`, comparações `min-h-12`.

**Arquivo:** `src/components/shared/kpi-card.tsx`

---

### M6 — Próximos Casamentos: 3 colunas + data compacta

Removidas colunas financeiras e filtro de horizonte. Mantidas apenas 3 colunas: Data do Evento, Casal, Hotel. Datas formatadas como "07 de novembro de 2026" via `fmtDateLong`. "Ver mais" abre `ListDrawer` com os 18 meses completos. Limite inline: 6 casamentos.

**Arquivo:** `src/components/weddings/proximos-casamentos-card.tsx`, `src/lib/fmt.ts`

---

### M7 — Mix por Produto: sem scroll horizontal

Headers com `whitespace-nowrap`, removidos `min-w-105` e `overflow-x-auto`. Tabela cabe no card sem scroll. `"% Total"` → `"%"`.

**Arquivo:** `src/components/performance/mix-produto-table.tsx`

---

### M8 — Drawer "Ver mais" padrão (ADR-0051)

Criado `src/components/shared/list-drawer.tsx`. Botão "Ver mais" (sem contagem) com footer sempre na base do card (`flex flex-col` + `flex-1` no conteúdo + div-espaçador quando não há "Ver mais"). Aplicado em: Próximos Casamentos, Mix por Produto, Vendas em Aberto, Vendas com Receita Negativa e Vendas com Prejuízo (Performance).

**Arquivo:** `src/components/shared/list-drawer.tsx` + 5 cards

---

### M9 — Design system na aba Performance

`performance-content.tsx` migrado para `TopSection` Opção B — paridade visual com a aba Weddings. Removido código morto: chamada a `get_sparklines` deixada acidentalmente no Promise.all desde v3.7-M6.

**Arquivo:** `src/components/performance/performance-content.tsx`

---

### M10 — Filtro por Operação + cores harmonizadas nos gráficos

**Paleta unificada:** entradas `#0091B3` (teal), saídas `#D9A23F` (âmbar), resultado `#2D2A26`. Ponto vermelho `#B85C5C` no Fluxo de Caixa quando resultado mensal é negativo.

**`AcumuladoRecebPagChart`:** label da linha de referência atualizado para "Total previsto de saídas: R$ X"; margem direita aumentada para 80px (espaço para o label); prop `operacaoLabel` no título.

**`DropdownOperacao`:** seletor de operação via URL state (`?operacao=...`). Texto de busca, fechamento por clique externo, badge X para limpar. Lista ordenada alfabeticamente por nome do casal. Posicionado com `right-0` para não sair da tela.

**`weddings-content.tsx`:** `get_operacoes_lista_weddings` no Promise.all; dropdown exibido acima dos gráficos; ambos filtrados pela operação selecionada.

**Migration:** `0039_m10_filtro_operacao_acumulado.sql`

**Arquivos:** `src/components/weddings/fluxo-caixa-mensal.tsx`, `src/components/weddings/acumulado-receb-pag-chart.tsx`, `src/components/weddings/dropdown-operacao.tsx`, `src/components/performance/weddings-content.tsx`

---

### M11 — Agregação por Venda Nº (ADR-0045)

View `analytics.vw_vendas_agregadas` agrega `raw.vendas_excel` por `(venda_numero, setor_macro)`, eliminando dupla contagem de vendas com múltiplos produtos. Política de situação: Aberta se qualquer produto em aberto; Fechada apenas se todos fechados. `get_vendas_em_aberto_weddings` refatorado para usar a view.

**Migration:** `0040_m11_vw_vendas_agregadas.sql`

---

### M12 — Vendas com Receita Negativa (ADR-0046)

`VendasReceitaNegativaCard` criado para a aba Weddings. Colunas: Data da Venda, Venda Nº, Valor Total, Receita (em `text-danger`), Vendedor. Linhas com `receita < -1000` com fundo `bg-danger-bg/40`. "Ver mais" via `ListDrawer`. Terminologia corrigida: "Prejuízo" → "Receita Negativa" em todos os rótulos da aba Weddings. `PrejuizosTable` permanece na aba Performance (análise cross-setor com granularidade diferente).

**RPC:** `get_vendas_prejuizo_weddings(p_from, p_to)` (migration 0040)

**Arquivo:** `src/components/weddings/vendas-receita-negativa-card.tsx`

---

### M13 — Lista de Operações reformulada

| Antes | Depois |
|-------|--------|
| Dropdown Situação (4 opções) | Pills: Todas / **Realizados** (default) / Futuros |
| Dropdown Subsetor | Removido |
| Dropdown Ordenar por | Removido |
| Coluna Flags | Removida |
| Ponto colorido de situação | Removido |
| Código W na célula casal | Só o nome do casal |
| "Evento" | "Data do Evento" |
| "Custos Int." | "Custos" |
| Datas `dd/mm/aa` | "07 de novembro de 2026" (`fmtDateLong`) |
| Ordenação estática | Todos os headers clicáveis com ▲/▼ toggle |
| Default: Todos sem ordem clara | Realizados + Data do Evento desc |

Pills usam `var(--brand-soft)` / `var(--brand)` / `var(--brand-deep)` via `style` inline, seguindo o padrão da sidebar.

**Migration:** `0041_m13_sort_colunas_extras.sql` — estende o CASE de ordenação da RPC `get_operacoes_weddings` para incluir `nome_casal`, `hotel`, `faturamento` e `custos`.

**Arquivo:** `src/components/weddings/lista-operacoes.tsx`

---

## Correções pós-review

### TopSection — barra lateral arredondada

A barra da esquerda foi convertida de `border-l-4` para um elemento `<span>` absolutamente posicionado com `top-2 bottom-2 w-1 rounded-full` — pontas arredondadas como na versão anterior do componente.

---

### TopSection — fundo brand-soft ausente

`bg-[--brand-soft]` como classe Tailwind não resolvia a variável CSS neste projeto. Corrigido para `style={{ background: 'var(--brand-soft)' }}` via inline style — mesmo padrão já adotado na sidebar para tokens de marca.

---

### Sidebar — sub-aba ativa ao recolher

O filtro de visibilidade usava `pathname.startsWith(s.href + '/')`, o que fazia `/performance/weddings` casar tanto com `{ href: '/performance' }` quanto com `{ href: '/performance/weddings' }`. Corrigido para `pathname === s.href` (match exato), mostrando apenas a sub-aba da rota atual.

---

### "Ver mais" fixo na base de todos os cards

O botão "Ver mais" flutuava dependendo do número de linhas, quebrando o alinhamento visual entre cards em grid. Solução: `flex flex-col` no wrapper do card + `flex-1` na área da tabela + footer sempre renderizado (botão ou `div` espaçador de mesma altura). Aplicado nos 5 cards com "Ver mais". Junto com esta correção: **Próximos Casamentos** passou de 5 para 6 linhas visíveis.

---

### Carteira: Vendas × Entregas — labels

- Subtítulo: "ano do casamento" → "ano de entrega"  
- Header da primeira coluna: "Ano da Venda" → "Ano da Venda / Entrega"  
- Legenda: "Colunas: ano do casamento" → "Colunas: ano da Entrega do casamento"

---

### Vendas em Aberto — labels e scroll

- "Data" → "Data da Venda"
- "Idade" → "Tempo"
- "Vendas com situação Aberta no cadastro" → "Vendas com situação Aberta no sistema"
- Removido `min-w-140` que forçava largura mínima de 560px, causando scroll horizontal desnecessário.

---

### Vendas com Receita Negativa — subtítulo e scroll

- "Vendas Weddings com receita bruta negativa no período" → "Vendas com receita bruta negativa"
- Removido `min-w-140` pelo mesmo motivo acima.

---

### Fluxo de Caixa Mensal — alinhamento do eixo X

`margin.right` alinhado com o Acumulado de Recebimentos: `16` → `80`. Ambos os gráficos agora têm a mesma configuração de margens e a mesma largura de YAxis (`72px`), garantindo alinhamento perfeito do eixo X entre os dois painéis.

---

### Lista de Operações — pills com cores da ID Visual

As pills (Todas / Realizados / Futuros) estavam sem cor ativa. Corrigido com `style` inline: `background: 'var(--brand-soft)'`, `borderColor: 'var(--brand)'`, `color: 'var(--brand-deep)'` — mesmo padrão dos itens ativos da sidebar.

---

### Datas em extenso — fmtDateLong

`fmtDateLong` adicionada a `src/lib/fmt.ts` — formato "07 de novembro de 2026". O dia usa a string ISO diretamente (não `parseInt`) para preservar o zero à esquerda. Aplicada em Próximos Casamentos e Lista de Operações em substituição a `fmtDateCompact`.

---

### KPI cards — refinamento de layout pós-validação visual

Após validação com grid de 6 colunas em viewport xl (1280px):
- **Valor principal:** `clamp(20px, 2.5vw, 32px)` → `clamp(16px, 1.8vw, 26px)` + `whitespace-nowrap` — evita quebra em cards estreitos (~136px de largura útil)
- **Label:** `h-5` → `h-8` com `leading-[1.3]` — comporta até 2 linhas sem vazar sobre o valor
- **Comparações:** removido `h-4 overflow-hidden`; wrapper `flex items-baseline gap-1 min-w-0`, variação com `shrink-0`, período com `flex-1 min-w-0 truncate`

---

### Sidebar — sub-aba ativa duplicada

`subActive` usava `pathname.startsWith(sub.href)`, fazendo tanto a sub-aba `/performance` quanto `/performance/weddings` aparecerem destacadas simultaneamente quando na rota weddings. Corrigido para `pathname === sub.href` (match exato), exibindo apenas a aba da rota atual.

---

### KPI cards — valor principal em dourado da ID Visual

`valorColor` (classe Tailwind) substituído por `valorColorClass + valorColorStyle`. Quando não há `benchmarkAlvo`, o valor recebe `style={{ color: 'var(--brand)' }}` inline — dourado `#BD965C` nas páginas de tema `group`, teal `#0091B3` na aba Weddings. Quando há `benchmarkAlvo`, a classe semântica de `margemColor()` continua ativa sem conflito (inline `color: undefined` não interfere).

---

### Dropdown Operação — posição, labels e ordenação

- Posicionamento: `left-0` → `right-0` — o painel abre para a esquerda do botão, sem sair da página.
- Labels na lista: passa a exibir o label completo `W - Casal - DD/MM/YYYY` para facilitar a identificação da operação. O botão do filtro continua exibindo apenas o nome do casal.
- Ordenação: lista ordenada alfabeticamente por nome do casal (`localeCompare('pt-BR')`).
- Largura: `w-72` → `w-96` para acomodar o label completo.

---

## Estado final do codebase

| Área | Status |
|------|--------|
| TypeScript (`npx tsc --noEmit --skipLibCheck`) | ✅ Limpo |
| Migrations 0039, 0040 e 0041 | ✅ Aplicadas no remote |
| Design tokens | ✅ Aplicados em todo o codebase |
| Recharts tooltips | ✅ Design system em todos os gráficos Weddings |
| ADRs 0045–0051 | ✅ Documentados |
| Changelog | ✅ Atualizado |

---

## Pendências para v3.9+

**Nome do hotel ausente na base de dados**  
`raw.vendas_excel.fornecedor` é NULL em todas as 31.744 linhas — os arquivos `_tratada.xlsx` não incluem a coluna "Fornecedor". A migration `0042_fix_hotel_via_pagante.sql` implementou um fallback via nome do pagante, mas a coluna permanece NULL na fonte. Próximo passo: incluir "Fornecedor" nos arquivos Excel e refazer o upload. Após o upload, executar `regenerar_dim_operacao_weddings()`.

**Cor do tema Corporativo**  
Cor atual `#4B4F54` (Pantone 7540) ainda percebida como mais azul do que cinza. Rever hex com a equipe — puxar para um cinza mais neutro, menos azulado.

**Logo Welcome Group na sidebar**  
Espaço reservado com placeholder de texto "Welcome Group / Finance Dashboard". Quando o PNG/SVG oficial estiver disponível, substituir o componente `WelcomeGroupLogo()` em `src/components/layout/sidebar.tsx`.

**Fluxo de Caixa — granularidade efetivado/previsto intra-mês**  
A distinção atual é por mês inteiro via `eh_futuro`. Para separar dentro do mesmo mês, precisaria de RPC `get_fluxo_caixa_mensal_weddings` com campos `entrada_efetivado` e `entrada_previsto` separados. A base já tem a informação (data do lançamento vs data do evento).

**Aba Trips e Corporativo**  
Exibem `PerformanceContent` genérico. Conteúdo específico depende de alinhamento com a diretoria.

**Demonstração para a gestora de Weddings**  
Pendente desde v3.6. A v3.8 concluiu a reformulação da Lista de Operações — momento oportuno.

---

## Arquivos modificados ou criados na v3.8

```
src/styles/tokens.css                                    ← Corporativo #4B4F54 separado do Group
src/components/layout/sidebar.tsx                        ← logo placeholder, localStorage, fix sub-aba
src/components/shared/top-section.tsx                    ← novo: Opção B, barra rounded-full, inline style
src/components/charts/custom-tooltip.tsx                 ← novo: tooltip design system
src/components/shared/list-drawer.tsx                    ← novo: drawer "Ver mais"
src/components/shared/kpi-card.tsx                       ← clamp() + alturas fixas
src/components/weddings/proximos-casamentos-card.tsx     ← 3 colunas, 6 linhas, fmtDateCompact, footer fixo
src/components/performance/mix-produto-table.tsx         ← sem scroll, header nowrap, footer fixo
src/components/performance/prejuizos-table.tsx           ← footer fixo
src/components/weddings/fluxo-caixa-mensal.tsx           ← cores, ponto negativo, margin.right 80
src/components/weddings/acumulado-receb-pag-chart.tsx    ← cores, label saídas, margin.right 80
src/components/weddings/dropdown-operacao.tsx            ← novo: right-0, label completo, w-96, alfabético
src/components/weddings/vendas-em-aberto-card.tsx        ← labels, sem min-w, footer fixo
src/components/weddings/vendas-receita-negativa-card.tsx ← novo: Receita Negativa, sem min-w, footer fixo
src/components/weddings/carteira-matrix-card.tsx         ← labels "entrega"
src/components/weddings/lista-operacoes.tsx              ← reformulação M13: pills brand, todos os headers sortáveis, ▲/▼
src/app/api/dashboard/weddings/operacoes/route.ts        ← enum ordenar_por estendido
src/components/performance/weddings-content.tsx          ← TopSection, filtro operação
src/components/performance/performance-content.tsx       ← TopSection, remove sparklines morto
src/lib/fmt.ts                                           ← fmtDateCompact, fmtDateLong
src/types/api.ts                                         ← VendaEmAberto, VendasReceitaNegativa, OperacoesLista
src/types/database.ts                                    ← RPCs M10/M11/M12
supabase/migrations/0039_m10_filtro_operacao_acumulado.sql
supabase/migrations/0040_m11_vw_vendas_agregadas.sql
supabase/migrations/0041_m13_sort_colunas_extras.sql
supabase/migrations/0042_fix_hotel_via_pagante.sql      ← fallback via pagante (hotel permanece NULL — v3.9)
```
