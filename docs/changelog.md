# Changelog — WT Finance Dashboard

## v3.5 — Aba Weddings: Operações e Receita Líquida (maio/2026)

### v3.5-m1 — Fundação de dados
- Migration 0029: `data_inicio_evento`, `hotel`, `custos_internos`, `margem_liquida_pct` adicionados a `dim_operacao_weddings`
- Função `regenerar_dim_operacao_weddings()` reescrita para usar linha Contrato=1 como pivô da operação
- Receita Líquida = Resultado de Caixa (entradas − saídas), coluna GENERATED no banco
- ADR 0031: data canônica e hotel derivados do Contrato=1

### v3.5-m2 — Confiança visual
- Scroll horizontal corrigido (min-w-0 em células de grid nas tabelas Mix e Prejuízos)
- Cores de subsetor nomeadas (SUBSETOR_COLORS map em vez de array genérico)
- Decomposição de variação: guard para período sem dados no período atual

### v3.5-m3 — Reestruturação Visão Geral
- Seções colapsáveis com `<details>`/`<summary>`: "Visão Geral" e "Visão Analítica por Operação"
- KPIs reordenados: Fat · Rec. Bruta · Margem% · Ticket Médio · Receita Média · Casamentos Entregues
- "Casamentos" renomeado para "Casamentos Entregues"; fórmulas atualizadas (ADR 0030)
- Drawer de Margem%: inclui TendênciaMargem + Margem por Subsetor (via MargemDrawerTrigger)
- SumarioSubsetorCard movido para Visão Geral

### v3.5-m4 — Carteira × Entregas + Próximos Casamentos
- Migration 0030: `data_venda_contrato` adicionado à tabela; `get_carteira_weddings` e `get_proximos_casamentos` criados
- Carteira Vendas × Entregas: matriz pivot ano_venda × ano_casamento com toggle Casamentos / Faturamento / Receita Bruta
- Próximos Casamentos a Entregar: tabela filtrada client-side (18m carregados, horizonte 3/6/12/18m)
- Pipeline removido (ADR 0033)
- ADR 0032: Carteira matrix design
- ADR 0033: Próximos Casamentos substitui Pipeline

### v3.5-m4b — Correções de RPC
- Bug 1 — `get_carteira_weddings`: `array_agg(DISTINCT x ORDER BY y)` corrigido com subquery DISTINCT (migration 0031)
- Bug 2 — `get_proximos_casamentos`: RL prevista inflada (caixa incompleto); filtro de plausibilidade `0 ≤ resultado_caixa ≤ receita_bruta` (migration 0032)

### v3.5-m5 — Receita Líquida na Lista de Operações
- Migration 0033: `get_operacoes_weddings` expõe `hotel`, `custos_internos`, `margem_liquida_pct`
- Novas colunas na tabela: Hotel · Custos Int. · Rec. Líq. · Mg. Líq.
- Linhas com RL < 0: fundo vermelho suave (`bg-red-50/40`)
- Tooltips nos headers com fórmulas; ordenação por Rec. Líq. e Mg. Líq.

### v3.5-m6 — Drill-down educativo
- Migration 0034: `get_operacao_weddings` expõe `hotel`, `custos_internos`, `margem_liquida_pct`
- Componente `EquacaoFinanceira` no drawer: waterfall Faturamento → (−) Fornecedor → Rec. Bruta → (−) Custos → Rec. Líquida
- Operações futuras (sem lançamentos): exibe apenas Faturamento → RB + nota explicativa
- Hotel exibido no header do drawer; seção Visão Financeira separada em Equação + Fluxo de Caixa
- ADR 0030: equação financeira e fontes de RB vs RL documentadas

### v3.5-m7 — Polimento e documentação
- ADRs 0030–0033 criados
- Changelog atualizado

---

## v3.3 — Performance por Setor (maio/2026)

### v3.3-1 — Polimento visual
- Gráfico 12m: meses anteriores em azul ~28% opacity (antes cinza `#cbd5e1`); labels em azul ~50%
- KPI cards clicáveis: `h-full` no wrapper alinha altura com cards adjacentes
- Sparkline: `overflow-hidden` impede vazamento do SVG fora do card
- Datas YoY com ano diferente: formato `abr/25` em vez de `01/04/25–30/04/25`
- Chevron do drawer: sempre visível (opacity 20%), maior (15px), mais claro no hover

### v3.3-2 — Sub-abas de Performance na sidebar
- Item "Performance" vira botão toggle — abre/fecha sub-menu sem navegar
- Sub-menu com 4 itens: Geral, Trips, Weddings, Corporativo
- ChevronRight rotacionado indica estado; auto-abre quando pathname começa com `/performance`
- Rotas criadas: `/performance/trips`, `/performance/weddings`, `/performance/corporativo`
- ADR 0016: sub-abas de Performance como dropdown na sidebar

### v3.3-3 — Barras empilhadas no gráfico 12m
- `setor=todos`: barras empilhadas por setor (Trips `#378ADD` / Weddings `#BA7517` / Corporativo `#0F6E56`) com legenda
- `setor` específico: barra única na cor do setor; mês corrente em azul primário
- Migration `0023`: novo RPC `get_historico_12m_setores` com breakdown por setor + total + receita + margem_pct
- ADR 0017: gráfico 12m com barras empilhadas por setor

### v3.3-4 — Conteúdo de Performance por setor
- `PerformanceContent`: async Server Component compartilhado entre as 4 sub-abas
- Cada sub-aba exibe KPIs, Mix, Tendência e Prejuízos filtrados ao setor da rota
- `SetorFilter` oculto nas sub-abas de setor (setor determinado pela rota)
- ADR 0018: PerformanceContent como componente compartilhado

### v3.3-5 — Polimento e documentação
- ADRs 0016–0018 criados
- Changelog atualizado

---

## v3.2 — Sidebar e Polimento Visual (maio/2026)

### v3.2-1 — Sidebar lateral
- Substitui navegação por top tabs por sidebar lateral fixa (250px desktop, drawer mobile)
- Ícones Lucide: LayoutDashboard, TrendingUp, Target
- Item ativo: barra azul `var(--primary)` + fundo sutil
- Botão `<` recolhe sidebar; botão `>` reabre
- Footer da sidebar reservado para avatar/logout (v4)
- Variáveis CSS `--primary`, `--primary-bg`, `--sidebar-bg`, `--sidebar-border` adicionadas

### v3.2-2 — Gráfico 12 meses melhorado
- Mês corrente em azul saturado (`var(--primary)`)
- Meses anteriores em cinza-azulado (`#cbd5e1`)
- Valores abreviados acima de cada barra (ex: `4,8M`)
- Eixo Y fixo: `0 / – / 5M / – / 10M`
- Grid horizontal sutil; rótulo e tick do mês corrente em destaque

### v3.2-3 — KPIs clicáveis com drawer histórico
- Faturamento e Receita clicáveis em Executiva e Performance
- Drawer lateral com gráfico de linha 24 meses + tabela últimos 6 meses
- Variações vs anterior e YoY calculadas no endpoint `/api/dashboard/kpi-historico`
- Respeita filtro de setor; ignora filtro de período (sempre 24 meses)
- Fecha com X, Esc ou clique no overlay; animação slide 280ms

### v3.2-4 — Polimento e documentação
- ADR 0014: migração top tabs → sidebar
- ADR 0015: KPIs clicáveis com drawer
- Changelog criado

---

## v3.1 — Polimento e Correções (maio/2026)

### v3.1-1 — Correção de bugs críticos
- Realizado ≠ Projeção na Aba Metas (guarda denominador zero antes das variações)
- WEDME removido do ranking (`dim_vendedor_tipo`, filtro `tipo_id = 1`)
- YoY -100% corrigido (`AND v_vendas > 0` nos guards de variação)
- Default Executiva alterado para "mês passado" (dados da carga manual)

### v3.1-2 — Métricas e filtros
- 6ª métrica adicionada: Receita/Venda (`receita_media`)
- Datas YoY/anterior com ano explícito quando difere do ano atual
- Tooltip rico com fórmula + valor exato ao passar o mouse no rótulo

### v3.1-3 — Refinamento visual
- Sparklines com cores de tendência (verde/vermelho/cinza)
- Barra do mês corrente parcial em cinza com tooltip "em andamento"
- Seções colapsáveis na Performance (`<details>/<summary>`)

### v3.1-4 — Drill-down nos setores
- Clicar em setor no Mix por Setor (Executiva) navega para Performance filtrada
- Clicar em linha do Mix por Setor (Performance) filtra a própria página
- Preset do período preservado na navegação

---

## v3.0 — Storytelling e Alertas (abril/2026)

- Sumário Executivo gerado automaticamente
- Benchmarks configuráveis (margem alvo e atenção)
- Alertas automáticos com Pontos de Atenção
- Decomposição de variação (efeito volume vs margem)
- Histórico 12 meses com gráfico de barras
