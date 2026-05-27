# ADR-0080 — Estrutura dual da sub-aba Fluxo de Caixa

**Status:** Aceito  
**Data:** 2026-05-27  
**Contexto:** A v4.2 entregou Fluxo de Caixa funcional (Abordagem B), mas a apresentação visual misturava visões retrospectivas e acionáveis em uma única tela plana, sem hierarquia clara.

**Decisão:** A sub-aba Fluxo de Caixa passa a ter duas seções recolhíveis principais:

- **Visão Geral** — retrospectiva analítica com filtro de período. Responde "como está sendo o ano".
- **Fluxo de Caixa Diário** — visão acionável do mês corrente. Responde "o que preciso fazer hoje / esta semana".

Ambas iniciam expandidas por padrão. O estado de expansão é local (não persiste entre navegações nesta versão). Cada seção tem horizonte temporal próprio: Visão Geral responde ao filtro de período; Diário opera sempre no mês corrente com Calendário de Liquidez navegável.

**Estrutura visual:**
```
Sub-aba: FLUXO DE CAIXA
  ▼ VISÃO GERAL (recolhível, expandida por padrão)
    ├ PeriodoFilterPillsUrl (dentro da seção)
    ├ KPIs 3 cards: Entradas, Saídas, Resultado do período
    ├ Gráfico Fluxo de Caixa Mensal (24m passado + 18m futuro)
    ├ Gráfico Acumulado de Recebimentos e Pagamentos
    ├ Composição do Período (agrupada por Grupo + Ver mais)
    ├ Posição por Conta (agrupada por tipo + Ver mais)
    ├ Títulos em Aberto por Aging (sem mudança)
    └ Próximos Vencimentos (sem mudança)
  ▼ FLUXO DE CAIXA DIÁRIO (recolhível, expandida por padrão)
    ├ KPIs 4 cards: Saldo em Caixa, A receber 10d, A pagar 10d, NCG 10d
    └ [grid 2 colunas]
        ├ CalendarioLiquidez (mês corrente com navegação)
        └ Próximos Lançamentos (lista lateral, 10d)
```

**Justificativa:** Visão Geral e Diário respondem perguntas operacionais distintas. Separar reduz carga cognitiva e permite cada vista ser otimizada para seu propósito. O Calendário de Liquidez não faz sentido sob um filtro "últimos 6 meses" — opera sempre no imediato.

**Consequências:** Persistência do estado de expansão das seções (localStorage) fica como pendência v4.4+.
