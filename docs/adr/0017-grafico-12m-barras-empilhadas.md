# ADR 0017 — Gráfico 12m com barras empilhadas por setor

**Data:** 2026-05-05
**Status:** Aceito
**Versão:** v3.3-3

## Contexto

O gráfico de 12 meses na Executiva exibia barras de cor única (azul) representando o faturamento total. Quando o filtro de setor era "todos", não havia visibilidade da composição por setor dentro de cada mês.

## Decisão

Quando `setor=todos`, renderizar **barras empilhadas** com um segmento por setor macro:
- Trips (Lazer): `#378ADD`
- Weddings: `#BA7517`
- Corporativo: `#0F6E56`

Quando filtrado para um setor específico, renderizar barra única na cor do setor.

### Novo RPC `get_historico_12m_setores`

O RPC original `get_historico_12m` retornava apenas totais. A nova função retorna breakdown por setor por mês além de `total`, `receita` e `margem_pct` (mantidos para compatibilidade com `regras-alerta`).

`get_historico_12m` original permanece sem alteração — outras chamadas não foram impactadas.

### Estrutura de dados por mês

```json
{
  "ano": 2025, "mes": 4, "eh_atual": false,
  "total": 10000000, "receita": 1500000, "margem_pct": 15.0,
  "Lazer": 5000000, "Weddings": 3000000, "Corporativo": 2000000
}
```

### Implementação no Recharts

Três componentes `<Bar stackId="fat">` com `<Cell>` individual para controle de opacidade em mês parcial. `<LabelList>` apenas na última barra do stack (Corporativo) mostrando o total.

## Consequências

**Positivas:**
- Composição por setor visível diretamente na linha temporal sem sair da Executiva
- Consistência de cores com Mix por Setor e Decomposição de Variação

**Negativas / trade-offs:**
- Nova RPC e migration `0023` — mais uma função para manter
- Com 3 stacks, o label do mês parcial pode ficar discreto; aceitável para v3.3
