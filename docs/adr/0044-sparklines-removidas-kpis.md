# ADR-0044 — Sparklines removidas dos KPIs

**Status:** Aceito  
**Data:** 2026-05-19  
**Versão:** v3.7-M6

## Contexto

Os KPI cards tinham sparklines opcionais (mini-gráficos de linha) renderizadas via uma RPC separada `get_sparklines`. A implementação causava dois problemas:

1. **Custo de dados**: `get_sparklines` era chamada em paralelo no carregamento da página mesmo quando os dados não eram exibidos na maioria dos cards
2. **Valor visual baixo**: a área disponível para o sparkline dentro do card era muito pequena (~40×16px) para comunicar tendências com precisão. Os valores de variação (vs anterior, YoY) já comunicavam a tendência de forma mais precisa e compacta

Adicionalmente, um bug silencioso havia sido introduzido: ao remover a RPC do `Promise.all`, o destructuring deixou um `sparkRes` solto que deslocava todos os valores subsequentes no array.

## Decisão

Remover sparklines dos KPI cards completamente:
- Props `sparklineData` e `sparklineLabels` removidas de `KpiCardProps`
- RPC `get_sparklines` removida do `Promise.all` de `weddings-content.tsx` e `performance-content.tsx`
- Componente `Sparkline` não é mais importado em `kpi-card.tsx`

## Consequências

- KPI cards mais limpos e focados nos valores numéricos
- Eliminada uma chamada de banco por carregamento de página
- Bug de destructuring corrigido como efeito colateral
- Se sparklines forem retomadas no futuro, devem ser implementadas com dados já disponíveis (ex: derivados do histórico 12m) sem RPC adicional
