# ADR-0092 — Drawer de Análise Histórica (Weddings)

**Status:** Aceito
**Data:** 2026-05-29
**Contexto:** O drawer do card principal de Weddings (v4.4, ADR-0086) misturava métricas-resumo (KPIs em cards cinza embaixo, destoantes do design system) com gráficos de barras agrupadas Faturamento+Receita. A Composição por Subsetor vivia duplicada: na vista principal de Weddings E disponível para análise.

## Decisão

Reformular o drawer de uma vista de "métricas-com-gráficos" para uma vista de **análise histórica estruturada**:

- KPIs sobem ao TOPO em faixa 3×2 com divisórias finas (sem cards cinza), valores em `var(--brand)`, labels uppercase pequeno em `var(--text-muted)`. Ordem: Faturamento, Receita, Margem, Nº Vendas, Ticket Médio, Rec. Média.
- Faturamento e Receita viram **dois gráficos stacked bars** segmentados por subsetor (absoluto em R$), com a **MESMA escala Y** e alinhados verticalmente — as barras de receita ficam visivelmente menores, comunicando que receita é fração do faturamento.
- A **Composição por Subsetor migra** da vista principal para dentro do drawer, sem box (sem Card container).
- Comparação Ano Anterior e Tendência de Margem permanecem.

## Estrutura (de cima para baixo)

```
Análise Histórica                                      [X]
Análise da evolução histórica de faturamento e receita do setor
────────────────────────────────────────────────────────
[Este ano] [Últ.3m] [Últ.6m] [Últ.12m] [Personalizado]   ← sticky
────────────────────────────────────────────────────────
KPIs faixa 3×2 (divisórias finas, sem cards cinza):
  Faturamento | Receita | Margem
  Nº Vendas   | Ticket  | Rec. Média
────────────────────────────────────────────────────────
FATURAMENTO POR SUBSETOR  [stacked bars mensais]
RECEITA POR SUBSETOR      [stacked bars — MESMA escala Y]
  (legenda de subsetores compartilhada)
────────────────────────────────────────────────────────
COMPARAÇÃO ANO ANTERIOR (linha) — permanece
TENDÊNCIA DE MARGEM (linha) — permanece
────────────────────────────────────────────────────────
Composição por Subsetor  no período selecionado (sem box)
  [tabela: Subsetor | Distrib. | Fat | Rec | Margem + Não Classif]
```

## Pills de período

Este ano (default) / Últ. 3 meses / Últ. 6 meses / Últ. 12 meses / Personalizado. Removidos "Este mês" e "Mês anterior". Pills sticky ao rolar. Personalizado usa **month picker** (seleção por mês, não dia), com trava de meses futuros — eixo X sempre mensal.

## RPC

`get_weddings_historico_subsetor(p_from, p_to)` → série mensal `{ mes, subsetor, faturamento, receita }`, segmentada por subsetor, no setor Weddings (migration 0097). Cores dos segmentos via tokens `--subsetor-*` (ADR-0087).

## Justificativa

Subir os KPIs ao topo dá leitura imediata dos números-chave. Os gráficos stacked por subsetor revelam a composição de cada mês. Mover a Composição por Subsetor para o drawer remove a duplicação da vista principal (pendência registrada desde a v4.4) e concentra a análise profunda num só lugar. Estabelece o padrão de "drawer analítico histórico" replicável em outros cards.
