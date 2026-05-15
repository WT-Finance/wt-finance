# ADR 0030 — Receita Bruta e Receita Líquida: duas fontes distintas em Weddings

**Status:** Aceito  
**Data:** Maio/2026  
**Versão:** v3.5-m1

## Contexto

A aba Weddings expõe três camadas de resultado financeiro:

1. **Faturamento** — valor total das vendas (soma de `valor_total` em `fato_venda_item`)
2. **Receita Bruta** — faturamento líquido do repasse ao fornecedor principal (hotel, cia. aérea). Calculada como `receitas` em `fato_venda_item`, que já vem com a dedução do fornecedor da planilha de origem.
3. **Receita Líquida** — resultado de caixa da operação = entradas totais − saídas totais dos lançamentos (`resultado_caixa` em `dim_operacao_weddings`).

Antes da v3.5, só Faturamento e Receita Bruta eram visíveis. A v3.4 introduziu Resultado de Caixa (ADR 0027) como proxy de RL exclusivo de Weddings.

## Decisão

**Receita Bruta e Receita Líquida são calculadas a partir de fontes diferentes e não devem ser confundidas:**

- **RB:** calculada sobre os dados de vendas (`fato_venda_item.receitas`), disponível para todas as operações desde a primeira venda.
- **RL:** calculada sobre os lançamentos financeiros (`fato_lancamento_operacao`), disponível apenas quando entradas e saídas foram registradas. Equivale a `resultado_caixa`.

A diferença `Receita Bruta − Receita Líquida` é denominada **Custos Internos** (`custos_internos = GREATEST(receita_bruta − resultado_caixa, 0)`) e inclui comissões, assessoria, e outros custos operacionais internos.

## Equação financeira

```
Faturamento
  (−) Custo Fornecedor   = Faturamento − Receita Bruta
  = Receita Bruta        (Margem Bruta %)
  (−) Custos Internos    = max(Receita Bruta − Resultado Caixa, 0)
  = Receita Líquida      (Margem Líquida %)
```

## Motivo

- A dedução do fornecedor vem da planilha de vendas (campo `receitas`), não dos lançamentos. Os dois sistemas são independentes.
- Os lançamentos capturam o fluxo de caixa real, incluindo parcelamentos, adiantamentos e pagamentos ao hotel — que podem ocorrer em meses diferentes da venda.
- Unificar as duas fontes num único número seria impreciso: o timing difere e a completude dos lançamentos históricos é variável.

## Consequências

- Operações futuras (sem lançamentos ainda) têm RB definida, mas RL = 0 e Custos Internos = 0 até os lançamentos serem registrados.
- RL prevista para operações futuras usa uma razão histórica `RL/RB` filtrada a operações com caixa completo (ver ADR 0034).
- A equação financeira é exibida no drawer de drill-down de operação (Bloco 2.3 expandido na v3.5-m6).
- `margem_bruta_pct = receita_bruta / faturamento × 100`; `margem_liquida_pct = resultado_caixa / faturamento × 100`.
