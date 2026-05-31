# Changelog

Todas as mudanças notáveis neste projeto serão documentadas aqui.  
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).  
A partir de v4.4.0 este projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/) (ADR-0084).

---

## [4.7.1] — 2026-05-31

Patch com dois ajustes pedidos pela diretoria na aba Weddings.

### Alterado
- **Lista de Operações:** removidas as colunas Rec. Bruta, Mg. Bruta e Custos; Rec. Líq. renomeada para **Resultado Previsto** e Mg. Líq. para **Margem** (12 → 9 colunas; aplicado em cabeçalhos, células, export Excel, colSpan e skeleton)
- **Card KPI Comercial:** passa a exibir o **nº de Contratos de Casamento vendidos** no período (em vez de faturamento), com YoY da contagem; Receita e Margem mantidas

### Banco
- Migration 0099 — `get_sumario_subsetor` estendida com `n_contratos` por subsetor (`COUNT(DISTINCT venda) FILTER produto = 'Contrato de Casamento'`)

---

## [4.7.0] — 2026-05-29

### Adicionado
- Drawer "Análise Histórica" de Weddings: KPIs em faixa 3×2 no topo + dois gráficos stacked por subsetor (Faturamento e Receita, mesma escala Y) + Composição por Subsetor sem box (ADR-0092)
- Composição dos Lançamentos com dois donuts (Entradas/Saídas) + agregação "Outros" + drill-down por categoria em lista (ADR-0093)
- API Route `/api/gerencial/import` (runtime nodejs) para importação de planilha — resolve PEND-001 (ADR-0091)
- RPC `get_weddings_historico_subsetor` (migration 0097) — série mensal por subsetor
- RPC `get_decomposicao_categoria` + correção de `get_decomposicao_grupo` (migration 0098)
- ADR-0091 (importação via API Route) + ADR-0092 (drawer Análise Histórica) + ADR-0093 (Composição donuts)

### Alterado
- Pills do drawer Weddings: Este ano / Últ. 3m / Últ. 6m / Últ. 12m / Personalizado (month picker, trava futuro); pills sticky
- Composição por Subsetor removida da vista principal de Weddings (agora vive só no drawer)
- Calendário de Liquidez: novo formato de dia com labels "A receber"/"A pagar"/"Saldo", sem sinais +/−; valor do Saldo em destaque
- Projeção diária do Gerencial fixa em 15 dias

### Corrigido
- PEND-001: importação de planilha Gerencial — `@e965/xlsx` isolado do contexto RSC via API Route
- Parser de importação robusto: valores monetários formatados (`R$ 1,000.00` US e BR), datas `DD/MM/YYYY` brasileiras, tipo case-insensitive
- Bug de agregação na Composição dos Lançamentos: grupos de categoria duplicados (uma linha por mês) → agregação correta por grupo no período

---

## [4.6.1] — 2026-05-28

### Adicionado
- Logos SVG Welcome Group e Welcome Weddings (alta resolução, @2x, @3x)
- Ícones do browser: `favicon.ico`, `icon.svg` com dark mode (`@media (prefers-color-scheme: dark)`), `apple-icon.png` (180×180), ícones PWA `icon0.png` (192×192) e `icon1.png` (512×512)
- Layout admin compartilhado (`src/app/admin/layout.tsx`) adicionado neste patch

### Corrigido
- Logo sidebar: `object-cover` → `object-contain` + `origin-left` corrige corte à esquerda no SVG
- Sidebar usa logos `.svg` em vez de `.png` (qualidade superior)
- `layout.tsx`: removidas referências manuais a `/apple-touch-icon.png` e `/favicon.ico` (Next.js auto-detecta os arquivos em `src/app/`)
- `icon.svg`: dark mode usa branco (`#FFFFFF`) em vez de dourado
- Link Weddings em `em-construcao.tsx` restaurado com cor `text-[#BD965C]`

### Pendência técnica registrada
- **Importação de planilha Gerencial (PEND-001)**: importação via Excel não funciona em produção — erro "An error occurred in the Server Components render" ao chamar `computeImportDiff` como Server Action. Parsing no browser funciona (`parseGerencialExcel`), dados chegam ao servidor, mas a execução da Server Action causa falha no re-render do Server Component. `ImportDrawer` foi isolado com `next/dynamic ssr:false` mas o erro persiste. Ver seção de investigação no out-briefing.

---

## [4.6.0] — 2026-05-28

### Adicionado
- Fluxo de Caixa Gerencial — terceira seção da sub-aba, com Visualização Agregada e Base de Dados
- Importação de planilha Excel de curadoria com mesclagem inteligente e preview de diff
- CRUD inline de lançamentos gerenciais (edição, adição e remoção de linhas)
- Saldos iniciais editáveis por conta (Itaú, Asaas, Blimboo, Clara)
- Projeção diária acumulada espelhando cálculo da planilha de curadoria
- Tokens semânticos de gráfico: `--chart-axis-tick`, `--chart-grid`, `--chart-success`, `--chart-warning`, `--chart-danger`, `--chart-neutral`, `--chart-info`
- Layout admin compartilhado em `src/app/admin/layout.tsx`
- ADR-0089 — Fluxo de Caixa Gerencial
- ADR-0090 — Tokens semânticos de gráfico
- `aria-label` em inputs date dos filtros de período

### Alterado
- 25+ hex hardcoded em componentes Recharts substituídos por `var(--chart-*)`
- Subtítulo diferenciador na Section "Fluxo de Caixa Diário": *Baseado em lançamentos de Contas a Pagar/a Receber*
- Migrado `xlsx` para `@e965/xlsx` (fork ativamente mantido, sem vulnerabilidades)

### Removido
- Vista admin `/admin/contas-bancarias` (não utilizada na prática)
- 6 RPCs órfãs: `get_fluxo_caixa_mensal`, `get_fluxo_caixa_mensal_b`, `get_historico_12m`, `get_proximos_vencimentos`, `get_proximos_vencimentos_v2`, `get_config_numeric`

### Corrigido
- Vulnerabilidades npm via `npm audit fix` (`brace-expansion`, `ws`, `next`)
- `labelFormatter` em `CustomTooltip` tipado corretamente para compatibilidade com Recharts

---

## [4.5.0] — 2026-05-28

### Adicionado
- Tokens CSS semânticos para cores de subsetores Weddings (`--subsetor-comercial`, `--subsetor-planejamento`, `--subsetor-producao`, `--subsetor-hospedagens`, `--subsetor-extras`)
- Página `/admin/design-system` — catálogo visual de tokens e componentes
- Filtros de tipo (Todos / A pagar / A receber) em Próximos Lançamentos com pills sticky no drawer
- Parâmetro `p_tipo` na RPC `get_proximos_lancamentos` (migration 0091)
- YoY nos cards de subsetor Weddings — aguarda extensão da RPC `get_sumario_subsetor` (pendência M3b)
- Relatório de audit completo em `docs/audits/2026-05-28-audit-completo-v4-5.md`
- ADR-0087 — Tokens semânticos consolidados
- ADR-0088 — Filtros sticky e padrão tabular em Próximos Lançamentos

### Alterado
- Próximos Lançamentos reformulado em formato tabular com 3 colunas (ícone+data | pessoa/descrição | valor)
- Card principal KPIs Weddings: padding compactado (sem vazio excessivo abaixo de "Ver mais ›")
- Cards Weddings: removido indicador MoM — exibido apenas YoY
- "Composição do Período" renomeada para "Composição dos Lançamentos" com subtítulo "no período selecionado"
- Cores de subsetores migradas de hex hardcoded para tokens semânticos `var(--subsetor-*)`
- Nota retroativa adicionada ao ADR-0071/0081 sobre uso de `var(--danger)` em pontos de gráfico negativos

### Corrigido
- Função `calcularDuracao` em Lista de Operações Weddings: timezone-safe + silencia durações negativas
- Import não usado em `periodo-filter.tsx`
- Card residual com `border border-[--border]` migrado para `shadow-sm`

### Removido
- RPC `get_sparklines` — morta no frontend desde v3.9 (migration 0090)
- Migration 0089 (`get_kpi_weddings_drawer`) descartada definitivamente — drawer KPI usa RPCs existentes

### Pendências registradas para v4.6+
- YoY nos cards de subsetor (aguarda extensão da RPC `get_sumario_subsetor`)
- Middleware de proteção `/admin/*` (atualmente depende de proteção upstream)
- 7 RPCs órfãs no banco
- Vulnerabilidades npm (next, xlsx — sem fix oficial disponível)
- Ver relatório completo em `docs/audits/2026-05-28-audit-completo-v4-5.md`

---

## [4.4.0] — 2026-05-27

### Adicionado
- ADR-0084: modelo de versionamento X.Y.Z formal
- ADR-0085: padrão único de Card no design system (sem sombra, border-radius 12px)
- ADR-0086: drawer rico para KPI principal Weddings
- CHANGELOG.md na raiz do repositório
- Sidebar exibe versão completa MAJOR.MINOR.PATCH
- KPIs Weddings reformulados: 1 card principal + 5 subsetores (Layout A)
- Drawer rico no card principal Weddings (gráfico, YoY, tendências, métricas, composição)
- Vista admin `/admin/contas-bancarias` para classificação de dim_conta_bancaria
- CalendárioLiquidez redesenhado: heatmap com intensidade proporcional ao saldo
- Tabela Próximos Lançamentos redesenhada: formato minimalista com paleta dessaturada
- Drawer Próximos Casamentos: pills 3m/6m/12m + subtítulo

### Alterado
- Padrão visual de Card unificado em todo o produto (sem sombra, rounded-xl)
- Sidebar mostra 'version 4.4.0' com 3 níveis (era major.minor)
- Gráficos Fluxo Mensal e Acumulado com eixo X alinhado verticalmente

### Corrigido
- Fundo vermelho removido das linhas da tabela Vendas com Receita Negativa
- RPC `get_proximos_lancamentos_10d` substituída por `get_proximos_lancamentos(p_dias)`
- UNIQUE constraint adicionada em `analytics.dim_produto_subsetor.produto_normalizado`

### Removido
- RPC `get_proximos_lancamentos_10d` (inerte após migração para versão paramétrica)

---

## Referência histórica (versões pré-convenção)

*Versões anteriores a 4.4.0 não seguiam a convenção X.Y.Z formal. Reclassificadas retroativamente como referência — ver ADR-0084.*

| Versão | Data aprox. | Principais mudanças |
|---|---|---|
| 4.3.0 | Maio 2026 | Reformulação visual Fluxo de Caixa; CalendárioLiquidez; ProximosLancamentos lateral |
| 4.2.0 | Mai 2026 | Feedback gestora Weddings; Composição por Subsetor; Vendas por Produto drag-and-drop |
| 4.1.0 | Abr 2026 | Fluxo de Caixa Abordagem B (regime caixa-banco); TopSection accordion |
| 4.0.0 | Mar 2026 | Aba Financeiro completa com Fluxo de Caixa v1 |
