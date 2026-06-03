# ADR-0100 — Casas decimais por contexto (operação individual vs. agregado)

**Status:** Aceito
**Data:** 2026-06-03
**Contexto:** Os valores monetários no app usavam, em geral, formato sem casas decimais (`fmtBRL`, `maximumFractionDigits: 0`) ou abreviado (`fmtMi`/`fmtAxisBRL`, "R$ 1,8 Mi"). Em **contexto de operação individual** (uma operação Weddings específica — a Lista de Operações e seu drawer), arredondar para reais inteiros esconde centavos relevantes na conferência de uma operação. Faltava uma regra clara de quando usar 2 casas e quando manter o abreviado, e a formatação estava espalhada (helper local `numBRL` na Lista de Operações, além do `@/lib/fmt`).

## Decisão

**Convenção de design system:** todo valor monetário em **contexto de operação individual** exibe **2 casas decimais**; valores **agregados** e **eixos de gráfico** mantêm o formato **abreviado**.

- Helpers centrais em `@/lib/fmt` (nunca formatação local):
  - `fmtBRL2(v)` → `"R$ 344.444,40"` (com símbolo)
  - `numBRL2(v)` → `"344.444,40"` (sem símbolo, para o formato contábil com "R$" à esquerda)
- Aplica em: **Lista de Operações** (Faturamento, Resultado Previsto) e **drawer de operação** — Informações Gerais (Faturamento, Receita Bruta) e Fluxo de Caixa (todos os valores; inclui o tooltip do Caixa Acumulado).
- **Permanecem abreviados:** KPIs e totais agregados (`fmtMi`) e **eixos de gráfico** (`fmtAxisBRL`/`ChartYAxisBRL`) — a regra de 2 casas é só para operação individual.
- Convenção documentada em `/admin/design-system`.

## Justificativa

O nível de precisão deve seguir o nível de leitura: agregados e eixos pedem leitura rápida (abreviado, sem ruído de centavos); a conferência de **uma** operação pede o valor exato (centavos). Centralizar os formatadores em `fmt.ts` evita divergência entre telas e remove a formatação local duplicada.
