# ADR 0015 — KPIs clicáveis abrem drawer lateral

**Data:** 2026-05-05
**Status:** Aceito
**Versão:** v3.2-3

## Contexto

Os KpiCards de Faturamento e Receita exibem sparklines de tendência, mas não permitem leitura precisa de valores históricos. O usuário precisava navegar para outra aba e reconfigurar filtros para investigar um número específico.

## Decisão

KpiCards de **Faturamento** e **Receita** ficam clicáveis (Executiva e Performance), abrindo um **drawer lateral pela direita** com:

- Gráfico de linha com os últimos 24 meses
- Tabela dos últimos 6 meses com variações vs anterior e YoY
- Filtro de setor da página respeitado; filtro de período ignorado (sempre 24 meses fixos)

### Arquitetura escolhida

```
KpiDrawerTrigger (Client Component)
  └── KpiCard (Server Component) — passado como children
  └── KpiDetailDrawer (Client Component) — renderizado quando open=true
```

`KpiCard` permanece Server Component — apenas `KpiDrawerTrigger` (wrapper fino) carrega estado. Isso evita tornar toda a grade de KPIs um Client Component.

O drawer busca dados do endpoint `GET /api/dashboard/kpi-historico?metrica=&setor=` ao abrir.

### Por que drawer e não página nova?

Padrão de mercado em ferramentas analíticas: o drawer preserva o contexto da página (filtros visíveis, outros KPIs comparáveis), enquanto uma navegação para nova página quebraria o fluxo.

### Por que 24 meses e não 36?

O RPC `get_historico_mensal` retorna 24 meses. Os dados históricos começam em 2024; 36 meses atrás (meados de 2023) não há dados. A diferença é irrelevante na prática. Sem necessidade de nova migration.

### Quais KPIs são clicáveis

Apenas Faturamento e Receita nesta versão — ambos têm grandeza absoluta (R$) com histórico comparável mês a mês. Margem %, Vendas, Ticket Médio e Receita/Venda ficam para iterações futuras.

## Consequências

**Positivas:**
- Profundidade analítica sem sair da página atual
- Estrutura do `KpiDrawerTrigger` permite adicionar mais KPIs clicáveis facilmente

**Negativas / trade-offs:**
- Novo endpoint de API (`/api/dashboard/kpi-historico`) — mais uma rota para manter
- O drawer não tem URL própria — não é "linkável" ou compartilhável diretamente
