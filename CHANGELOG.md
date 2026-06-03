# Changelog

Todas as mudanças notáveis neste projeto serão documentadas aqui.  
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).  
A partir de v4.4.0 este projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/) (ADR-0084).

---

## [4.9.0] — 2026-06-03

Versão de **integridade de dados**: corrige três bugs de DADO que uma camada de transformação mascarava (Carteira, Convidados, Gerencial), adiciona uma coluna que elimina um join frágil, e leva ajustes visuais conectados (Weddings/Financeiro). ADRs 0097–0100.

### Corrigido
- **Carteira inventava o ano do evento** quando a Data Início era nula — o ETL caía num fallback que parseava o NOME da operação ("…11MAY27" → 2027). Agora `data_evento` usa **somente a Data Início real** do contrato; ausência → **"sem data"** honesto (detector de cadastro incompleto). Função órfã `extrair_data_evento` removida. (M1, migration 0105, ADR-0097)
- **Importação Gerencial invertia dia/mês** — o parser lia a data como **string** no formato de exibição da célula (americano `mm-dd-yy`) e a heurística DD/MM a invertia em junho. Passa a ler o **valor `Date` nativo** do Excel (inequívoco), com a heurística de string só como fallback. Após o re-import, os ~143 registros invertidos são limpos e a Visualização Agregada reflete junho. (M4, ADR-0099)
- **Contagem de convidados** dependia de um join frágil Vendas×Lançamentos. Passa a usar **filtro direto** por `operacao_propria` nas Diárias de Hospedagem (split de Passageiros por vírgula + normalização + DISTINCT + COUNT). (M3, migration 0109 — aplicada após o re-upload, ADR-0098)

### Adicionado
- **Coluna "Operação Própria"** em Vendas por Produto (vinda do ERP): vincula diárias à operação sem cruzar bases. Parser passa a ler a coluna; `raw.vendas_excel` ganha `operacao_propria`. Bundle: corrige também o header da **Data Início** (`'Data de Início'` → `'Data Início'`), que não era ingerido — após o re-upload, a Carteira (M1) volta a ter datas reais. (M2, migration 0107, ADR-0098)
- **Entradas/saídas não liquidadas** no canto do gráfico "Fluxo de Caixa Mensal de Weddings": dois KPIs discretos com o total a receber e a pagar pendentes, independente da data de vencimento. (M5, migration 0106)

### Alterado
- **Resultado Previsto unificado** = `entradas_total − saidas_total` na tabela Lista de Operações **e** no drawer (mesma fórmula explícita, exposta por `get_operacoes_weddings`). Nota: `resultado_caixa` já era coluna gerada igual a essa fórmula, então os **valores exibidos não mudaram**; a unificação agora é explícita no código. Rodapé do Fluxo de Caixa do drawer (Resultado de Caixa / Resultado Previsto / NCG) re-alinhado. (M6, migration 0108)
- **2 casas decimais** em todo valor monetário de **contexto de operação individual** (Lista de Operações e drawer), via helpers centrais `fmtBRL2`/`numBRL2`. Valores agregados e eixos de gráfico permanecem abreviados ("R$ 1,8 Mi"). Convenção documentada em `/admin/design-system`. (M8, ADR-0100)
- **Composição dos Lançamentos** (Fluxo de Caixa Gerencial) em **largura total**: dois donuts maiores (Entradas/Saídas) acima e tabela de decomposição em duas colunas abaixo (Grupo · % · Valor + Total + "Outros"). Drill preservado. (M7)

### Removido (da visualização; mantido no código)
- **Posição por Conta** (Fluxo de Caixa Gerencial) ocultada via flag `MOSTRAR_POSICAO_POR_CONTA` (componente e RPC preservados para revisão futura). (M7)

---

## [4.8.2] — 2026-06-02

Patch de refinamento visual (Weddings). Sem capacidade nova, sem migration.

### Alterado
- **Drawer "Análise Histórica":** pills de período grudadas ao cabeçalho (sem fresta); subtítulo "Indicadores" acima dos KPIs; "Não Classif." removido dos gráficos de Faturamento/Receita por Subsetor e da legenda; gráficos "Comparação Ano Anterior" e "Tendência de Margem" alinhados verticalmente (eixos Y de mesma largura); na Comparação, as linhas do período atual param no mês corrente (não se estendem até o fim do ano).
- **Drawer da Lista de Operações:** Duração, Tipo de Contrato e Convidados agora em dourado (como os demais); Fluxo de Caixa reorganizado — "A receber" abaixo de "Recebido", "A pagar" abaixo de "Pago", e a linha de baixo com **Resultado de Caixa**, **Resultado Previsto** (entradas − saídas totais) e **NCG**.
- **Próximos Casamentos a Entregar:** coluna "Data do Evento" → "Data" no formato "17 de jun de 2026"; tabela do card sem rolagem horizontal em telas menores (`table-fixed` + truncate, mantendo as 4 colunas — Data/Casal/Hotel/Resultado); pills do drawer agora flutuantes (sticky, sem fresta).
- **Carteira: Vendas × Entregas:** removidos os filtros Faturamento e Receita Bruta — exibe apenas Casamentos (sem seletor); RPC chamada 1× (antes 3×).
- **Lista de Operações — alinhamento das colunas:** Duração à **direita**; Contrato e Conv. **centralizados**; Faturamento e Resultado Previsto em **formato contábil** ("R$" à esquerda, valor à direita).
- **Duração** (Lista de Operações e drawer) passa a ser exibida em **meses com 1 casa** ("3,7 meses") em vez de dias.
- **Eixo Y sem quebra** nos gráficos de Weddings (Fluxo de Caixa Mensal e Acumulado); `fmtAxisBRL` passou a formato compacto (1 casa em Mi / 0 em k).
- **Cards de subsetor:** Receita/Margem alinham entre cards em telas menores (`flex flex-col h-full` + rodapé `mt-auto`); o valor principal não quebra mais em 2 linhas no layout de 5 colunas (`whitespace-nowrap` + fonte reduzida em `lg`).

### Corrigido
- Ordenar a Lista de Operações por **Duração, Contrato ou Convidados** retornava **HTTP 400** — o `z.enum` de `ordenar_por` na API route não incluía `duracao`/`tipo_contrato`/`convidados` (a RPC já suportava). Adicionados ao enum.

### Removido (da visualização; mantido no código)
- Cards "Vendas em Aberto" e "Vendas com Receita Negativa" ocultos via flag `MOSTRAR_VENDAS_DIAGNOSTICO` (componentes preservados para retorno futuro).

---

## [4.8.1] — 2026-06-01

Patch de refinamento visual sobre a v4.8 — drawers de Weddings, padrão de gráficos e cards clicáveis. Sem capacidade nova (refina dentro dos ADRs 0095 e 0096).

### Alterado
- **Drawer "Análise Histórica":** eixo Y sem quebra de linha em Faturamento/Receita por Subsetor e na Comparação Ano Anterior; **Comparação Ano Anterior** agora plota **4 linhas** (Faturamento + Receita, atual sólido / ano anterior tracejado; cor distingue métrica, traço distingue período) e o título perde "(Faturamento)"; pills sticky grudadas ao cabeçalho (sem fresta); tooltip de subsetor com nome à esquerda / valor à direita.
- **Drawer da Lista de Operações:** **Caixa Acumulado** agora mostra **duas linhas separadas** — Entradas (verde) e Saídas (vermelho) — cada uma com trecho efetivo sólido + projetado tracejado e marcador "hoje"; largura igualada à do drawer principal; KPIs 3×2 sem bordas pretas (divisórias finas); mais espaçamento entre seções.
- **Tooltip primitivo** (`CustomTooltip`): valores com `tabular-nums` (dígitos alinhados em todos os gráficos que o usam).

### Adicionado
- **Afordância de card clicável:** hover na cor da aba (borda + sombra + CTA "Ver mais" → `var(--brand)`). Utilitária `.card-clicavel`/`.card-clicavel-cta`; aplicada ao card KPI de Weddings (dourado), documentada na `/admin/design-system`. Vira convenção (abas futuras herdam pela var de tema).
- Token `--text-secondary` (#4B4F54) que estava documentado mas ausente em `tokens.css`/`globals.css`.

### Banco
- Migration **0104** — `get_operacao_weddings`: `acumulado_mensal` reescrito para `entrada_efetiva`/`entrada_projetada`/`saida_efetiva`/`saida_projetada` (entradas e saídas separadas), em vez de saldo único.

---

## [4.8.0] — 2026-06-01

Consolidação da área de dados + padrão de gráficos + reformulações Weddings. Dois temas paralelos independentes + faxina.

### Adicionado
- **Padrão de gráficos do design system** (ADR-0095): primitivos reutilizáveis em `@/components/charts` (tema Recharts central, grade/eixos/linha-do-zero, `ChartLegend`, `CustomTooltip` estendido, `fillMonths` para eixo temporal contínuo) + formatadores de eixo em `fmt.ts` (`fmtAxisBRL`/`fmtAxisPct`/`fmtAxisMes`) + cores de setor/subsetor consolidadas em `config.ts`. Documentado na `/admin/design-system` (§8) com showcase e convenção sólido/tracejado. Migração dos gráficos legados é incremental.
- **Lançamentos por Categoria** e **Fluxo de Caixa (CAP/CAR)** no menu unificado `/admin/uploads` (antes em página separada), reusando parsers e RPCs existentes.

### Alterado
- **Área de upload unificada** (ADR-0094): aviso forte (modal com contagem antes/depois) em **todas** as 4 bases; texto explicativo por base ("substitui toda a base; importe sempre o arquivo completo"); página dirigida por configuração. `/admin/uploads/financeiro` agora redireciona para `/admin/uploads`.
- **Drawer da Lista de Operações de Weddings** reformulado (ADR-0096): cabeçalho empilhado sem badge; Informações Gerais 3×2 (Duração/Tipo de Contrato/Convidados + Faturamento/Receita Bruta/Margem Bruta); Fluxo de Caixa com NCG (A pagar − A receber, sem rótulo); Composição por Subsetor (tabela completa); Caixa Acumulado Efetivo (sólido) + Projetado (tracejado) com marcador "hoje". **Removida a Equação Financeira** (Custos Internos não confiáveis), a Receita por Subsetor antiga e o Detalhamento dos Lançamentos.
- **Drawer "Análise Histórica" de Weddings** (polish): legenda dos subsetores entre os dois gráficos stacked; gráfico de Receita com escala Y independente; faixa de KPIs 3×2 sem vazio à direita; eixos sem quebra (primitivos do padrão de gráficos).

### Removido
- **Base morta "Vendas por Forma de Pagamento"** (`raw.vendas_pagamento`: 0 linhas, 0 consumidores) — código (parser/action/tipos/card) + tabela + RPCs.
- Action órfão `fetchWeddingsComposicao` (sem callers).
- RPCs órfãs `truncar/inserir_lote/contar_contas_pagar_receber` (tabela dropada na v4.2).

### Banco
- Migration **0102** — dropa `raw.vendas_pagamento` + suas RPCs (M3) e as RPCs órfãs de `contas_pagar_receber` (faxina #4).
- Migration **0103** — estende `get_operacao_weddings` (tipo_contrato, convidados, data_venda_contrato, decomposição no formato SumarioSubsetor, caixa acumulado efetivo/projetado contínuo).

### Notas
- Faxina #1 (`get_fluxo_caixa_kpis_b`): investigação mostrou que `_b` (KPIs de período da Visão Geral) e `_diario` (posição atual + 10 dias) **não são equivalentes** e ambas são usadas pela página. Decisão: **manter as duas**, não dropar `_b`.
- Carga incremental e DRE permanecem fora de escopo (reservadas; a dor de atualização será resolvida por RPA).

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
