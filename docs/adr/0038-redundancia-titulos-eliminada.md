# ADR 0038 — Redundância de títulos eliminada

**Status:** Aceito  
**Data:** Maio/2026  
**Versão:** v3.6-m2

## Contexto

Quando uma seção recolhível (`Section`) tem título X, o card interno frequentemente repetia o mesmo título X como `<h2>`. O resultado era redundância visual:

```
> Carteira: Vendas × Entregas          ← Section header
  ┌─────────────────────────────────┐
  │ Carteira: Vendas × Entregas     │  ← card interno (duplicata)
  │ Matriz cruzando ano da venda... │
  └─────────────────────────────────┘
```

## Decisão

**Regra:** Quando uma seção tem header recolhível com título X, o card interno NÃO repete o título X. O card mantém apenas um **subtítulo descritivo curto** (uma frase explicando o conteúdo).

**Antes → Depois (exemplos):**

| Componente | Antes | Depois |
|---|---|---|
| `CarteitraMatrixCard` | `<h2>Carteira: Vendas × Entregas</h2>` | `<p>Vendas por ano de venda × ano do casamento</p>` |
| `ProximosCasamentosCard` | `<h2>Próximos Casamentos a Entregar</h2>` | `<p>RL prevista baseada em margem histórica de X%</p>` |
| `MixProdutoTable` | `<h2>Mix por Produto (Top 10)</h2>` | `<p>Faturamento e margem por produto no período</p>` |
| `PrejuizosTable` | `<h2>Vendas com Prejuízo</h2>` | `<p>Operações com margem negativa no período</p>` |
| `SumarioSubsetorCard` | `<h2>Resumo por Subsetor</h2>` | `<p>Distribuição de faturamento por subsetor no período</p>` |

## Justificativa

O título da seção recolhível já serve como identificador. O subtítulo descritivo comunica o **conteúdo específico** (período, métrica, ordenação), que é informação diferente do título. Eliminar a redundância reduz ruído visual e deixa mais espaço para os dados.

## Consequências

**Positivas:**
- Menor densidade de texto, mais foco nos dados
- Cards com subtítulo descritivo são mais informativos que cards com título repetido

**Negativas / trade-offs:**
- Cards usados fora do contexto de uma `Section` (ex: futuras páginas dedicadas) ficam sem título identificador. Mitigação: adicionar título condicionalmente via prop se necessário no futuro.
