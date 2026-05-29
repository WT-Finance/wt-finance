# ADR-0090 — Tokens semânticos de gráfico

**Status:** Aceito
**Data:** 2026-05-28
**Contexto:** Audit M7 da v4.5 identificou 25+ ocorrências de hex hardcoded em componentes de gráfico Recharts. Cores de ticks, grid e séries semânticas estavam duplicadas e inconsistentes entre componentes.

## Decisão

Estender o sistema de tokens semânticos (ADR-0087) com categoria `--chart-*` dedicada a cores de gráfico. Substitui hex hardcoded por tokens reutilizáveis no arquivo central `src/styles/tokens.css`.

## Tokens novos

```css
--chart-axis-tick:   #52525b;
--chart-grid:        #e4e4e7;
--chart-success:     #10b981;
--chart-warning:     #f97316;
--chart-danger:      #dc2626;
--chart-neutral:     #94a3b8;
--chart-info:        #6366f1;
```

## Exceções

Não entram nesta consolidação (mantidas como hardcoded por serem identitárias de domínio):
- `#0091B3` Entradas Fluxo de Caixa (Pantone 632 Welcome)
- `#D9A23F` Saídas Fluxo de Caixa
- `#2D2A26` Resultado mensal (linha)
- `#378ADD` Setor Lazer
- `#0F6E56` Setor Corporativo
- Cores de subsetor Weddings (já em tokens `--subsetor-*` via ADR-0087)

Cores de setor identitário (Lazer, Corporativo) ficam como pendência futura via tokens `--setor-*`.

## Justificativa

Centralização permite ajuste futuro de paleta em arquivo único. Mantém consistência visual entre componentes. Segue padrão estabelecido em ADR-0087 (subsetores) e ADR-0071 (paleta dessaturada).
