# ADR-0086 — Drawer rico para o card KPI principal (Weddings)

**Status:** Aceito  
**Data:** 2026-05-27

## Contexto

O card principal da aba Weddings exibia apenas 3 KPIs (Faturamento, Receita, Margem) com variações MoM/YoY. A gestora precisava de uma visão analítica mais profunda sem sair da página.

## Decisão

O card principal é clicável e abre um drawer rico lateral (60vw no desktop, fullscreen no mobile) com:
- Pills de filtro de período (Este ano / Este mês / Mês anterior / Últ. 3m / Últ. 6m / Personalizado)
- Gráfico de barras: Faturamento e Receita mensais
- Gráfico de linhas: Comparação YoY de Faturamento
- Gráfico composto: Margem % (linha) + Nº Vendas (barras)
- Três métricas inline: Ticket Médio, Receita Média, Nº de Vendas
- Tabela de composição por subsetor

O drawer usa `getBrowserClient()` para carregar dados dinamicamente com a RPC `get_kpi_weddings_drawer(p_from, p_to)`.

## Consequências

- Nova RPC `get_kpi_weddings_drawer` (migration 0089)
- Componente `kpi-principal-drawer.tsx` encapsula toda a lógica do drawer
- `ListDrawer` existente é reutilizado como shell do drawer
