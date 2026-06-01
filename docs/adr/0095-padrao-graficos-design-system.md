# ADR-0095 — Padrão de gráficos do design system

**Status:** Aceito
**Data:** 2026-06-01
**Contexto:** Cada gráfico da plataforma foi construído na versão em que nasceu, com decisões locais — eixos, barras, grade, linhas e tooltips diferentes entre si. Cores de setor e formatadores de mês estavam duplicados em vários componentes. Faltava um padrão central. É a evolução do que a v4.5 fez com cores, agora com formatação de gráfico.

## Decisão

Estabelecer um **padrão central de formatação de gráficos (tom discreto)** e implementá-lo como **primitivos reutilizáveis** em `@/components/charts` — tema Recharts central, helpers de formatação de eixo, e componentes de grade/eixo/legenda/tooltip padronizados — documentados na `/admin/design-system` (§8). Aplicação **incremental**: os gráficos desta versão (drawers de Weddings) usam os primitivos; os demais migram quando tocados.

## Especificação do padrão

- **Eixos:** labels abreviados sem quebra (`R$ 1,8 Mi` / `R$ 600 k` / `R$ 0`). Mês minúsculo (`jan/26`).
- **Grade:** horizontal tracejada (`3 4`) sutil; linha do zero sólida e mais forte; sem grade vertical.
- **Barras:** cantos 2px só nas pontas externas; stacked com segmentos internos contínuos.
- **Linhas:** principal 2px sólida com pontos; comparação/projeção tracejada (`5 4`) 1,5px.
- **Convenção de tracejado:** sólido = dado real/efetivo; tracejado = referência (ano anterior) ou projeção (futuro).
- **Donut:** furo com total no centro; cauda agregada em cinza neutro ("Outros").
- **Barra horizontal:** fina (5px), bolinha de subsetor à esquerda, percentual à direita.
- **Eixo temporal:** SEMPRE contínuo (todos os meses do intervalo, mesmo sem dado) — helper `fillMonths`.
- **Tooltip:** container claro, borda 0,5px, label do período no topo, séries com bolinha de cor + valor abreviado.

## Primitivos (API pública `@/components/charts`)

Tema (`chartColors`, `fluxoColors`, `chartMargins`, `dashArrays`, `strokeWidths`, `barRadius`, `barSizes`); factories de grade/eixo (`ChartGrid`, `ChartZeroLine`, `ChartReferenceLineY`, `ChartXAxisMes`, `ChartYAxisBRL`, `ChartYAxisPct`, …); `ChartLegend`; `CustomTooltip` estendido (borda 0,5px + `showColorDot`); `fillMonths`. Cores de setor/subsetor consolidadas em `@/lib/config`; formatadores de eixo em `@/lib/fmt` (`fmtAxisBRL`/`fmtAxisPct`/`fmtAxisMes`).

## Justificativa

Encapsular o padrão em primitivos evita a divergência por copy-paste e torna a consistência o caminho de menor esforço. Documentar na `/admin/design-system` dá o exemplo canônico de consumo. Migração incremental evita reformar ~12 gráficos de uma vez (risco desnecessário).
