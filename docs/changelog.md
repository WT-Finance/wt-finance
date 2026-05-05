# Changelog — WT Finance Dashboard

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
