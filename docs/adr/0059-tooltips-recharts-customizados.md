# ADR-0059 — Tooltips Recharts customizados

**Status:** Aceito
**Data:** Maio/2026
**Versão:** v3.10-m3

## Contexto

O componente `CustomTooltip` foi criado na v3.8 (M4) e aplicado nos gráficos da Aba Weddings e Executiva. Um gráfico permanecia com o tooltip padrão do Recharts: o mini-gráfico acumulado dentro do `DrilldownDrawer` em `src/components/weddings/drilldown-drawer.tsx`, que usava `contentStyle` e `labelStyle` inline para estilização ad-hoc.

## Decisão

Aplicar `CustomTooltip` no `drilldown-drawer.tsx`, substituindo o `<Tooltip contentStyle=... labelStyle=...>` pelo padrão `<Tooltip content={<CustomTooltip formatter={fmtBRL} />}>` — idêntico ao adotado nos demais gráficos do projeto.

## Consequências

- Todos os tooltips Recharts do projeto seguem o mesmo padrão visual (tokens CSS, fonte Avenir, sombra do design system)
- `CustomTooltip` é agora o único ponto de manutenção de estilo de tooltip
