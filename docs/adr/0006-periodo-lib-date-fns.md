# ADR 0006 — Biblioteca date-fns para cálculos de período

**Status:** aceito  
**Data:** 2026-04-30

## Contexto

O v2 introduz filtros de período com presets (este mês, últimos 3 meses, este ano, personalizado) e comparações contra período anterior e YoY. Cálculos manuais com `Date` nativo são frágeis em casos como: anos bissextos (29 Fev), fins de mês com durações diferentes, e fusos horários.

## Decisão

Usar `date-fns` (v4) para todos os cálculos de datas. Centralizar em `src/lib/periodo.ts` as funções:

- `resolvePeriodo(preset, hoje?, inicio?, fim?)` — converte preset em `{ inicio, fim }`
- `calcularPeriodoAnterior(periodo)` — período contíguo imediatamente anterior de mesma duração
- `calcularPeriodoYoY(periodo)` — mesmo intervalo do ano anterior (lida com 29 Fev via `subYears`)
- `granularidadeSugerida(periodo)` — retorna `'diario' | 'semanal' | 'mensal'` para gráficos adaptativos

## Consequências

- `date-fns` é tree-shakeable; só as funções importadas entram no bundle.
- CAGR calculado nos dashboards exclui o ano corrente (2026) por estar incompleto — isso é uma regra de negócio, não da lib.
- Todos os cálculos de período em Server e Client Components passam por `periodo.ts`, evitando duplicação.
