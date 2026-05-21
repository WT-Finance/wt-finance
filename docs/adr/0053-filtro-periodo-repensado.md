# ADR-0053 — Filtro de período repensado: escopo seletivo + posicionamento contextual

**Status:** Aceito
**Data:** Maio/2026
**Versão:** v3.9-m2
**Supersede:** filtro global do canto superior direito da Aba Weddings

## Contexto

A v3.8 tinha um filtro de período global no canto superior direito da Aba Weddings (componente `PeriodoFilter` baseado em URL params). Ele afetava todos os componentes igualmente, incluindo Próximos Casamentos, Vendas em Aberto e Carteira — que têm lógica temporal própria e não fazem sentido serem filtrados por período de faturamento.

O audit técnico pós-v3.8 identificou isso como UX incoerente: o filtro "Este ano (YTD)" suprimia vendas futuras que deveriam aparecer em Próximos Casamentos. Além disso, o filtro era um `<select>` discreto no canto, sem indicação visual de quais componentes ele afetava.

## Decisão

1. **Posicionamento**: filtro movido do canto superior direito para dentro da Visão Geral, imediatamente acima dos KPI cards.

2. **UI**: substituir `<select>` por 6 pills horizontais, mesma estilização dos filtros de Situação na Lista de Operações:
   - [Este ano (YTD)] [Este mês] [Mês anterior] [Últimos 3 meses] [Últimos 6 meses] [Personalizado]
   - Pill ativo: `background: var(--brand-soft)`, `borderColor: var(--brand)`, `color: var(--brand-deep)`
   - Personalizado: popover com dois `<input type="date">` + validações

3. **Escopo seletivo**: somente KPIs, Mix por Produto e Composição por Subsetor reagem ao filtro. Componentes com lógica temporal própria permanecem inalterados:
   - Próximos Casamentos (horizonte futuro)
   - Vendas em Aberto (status atual)
   - Vendas com Receita Negativa (histórico completo — ADR-0053 remove o corte temporal)
   - Carteira × Entregas (matriz com lógica própria)
   - Visão Analítica por Operação

4. **Persistência**: Context Provider (`PeriodoFilterProvider`) no layout `/performance/*` mantém estado entre as 4 sub-abas (Geral, Trips, Weddings, Corporativo). Estado é descartado ao sair de `/performance/*`.

5. **Arquitetura**: KPIs, Mix e Composição tornam-se Client Components que chamam Server Actions ao mudar o período. Os demais componentes permanecem Server Components.

6. **Marcador visual**: label "no período selecionado" (13px, `--text-muted`) acima de cada seção afetada para deixar explícito o contrato visual.

## Validações do Personalizado

- `data_fim ≥ data_inicio`
- `data_fim ≤ hoje` (sem datas futuras)
- Range máximo: 36 meses

## Consequências

- KPIs, Mix e Composição respondem ao filtro em tempo real (sem refresh de página)
- Próximos Casamentos e Vendas em Aberto ignoram o filtro (comportamento correto)
- Filtro persiste ao navegar entre Weddings → Geral → Weddings
- Filtro reseta ao sair para Executiva/Metas/Upload (provider desmonta)
- Padrão escalará naturalmente para Trips e Corporativo em versão futura
