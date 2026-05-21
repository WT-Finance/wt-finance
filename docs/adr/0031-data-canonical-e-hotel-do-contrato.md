# ADR 0031 — Data canônica do evento e Hotel a partir da linha Contrato=1

**Status:** Supersedido por ADR-0052  
**Data:** Maio/2026  
**Versão:** v3.5-m1

## Contexto

Cada operação de casamento tem múltiplas vendas associadas (hospedagem, aéreo, transfers, etc.). Entre elas, existe tipicamente uma linha com `contrato = true` na planilha — o "Contrato de Casamento", que representa o produto principal.

Dois campos precisam de uma fonte canônica por operação:

1. **Data do evento** (data do casamento) — existe como `data_inicio_evento` apenas nas linhas de Contrato=1; nas demais linhas a data pode estar ausente ou ter outro significado.
2. **Hotel** (fornecedor principal) — o fornecedor do casamento é o campo `fornecedor` na linha de Contrato=1. Em outras linhas, `fornecedor` pode ser uma cia. aérea, serviço de transfer, etc.

Antes da v3.5, `data_evento` era extraída da linha de Contrato ou fallback de regex sobre o código da operação (`extrair_data_evento()`). Hotel não existia como campo estruturado.

## Decisão

**Usar a linha Contrato=1 como pivô canônico da operação:**

- `data_evento` = `data_inicio_evento` do Contrato=1, com fallback para `extrair_data_evento(operacao)`
- `hotel` = `fornecedor` do Contrato=1 (NULL quando a linha não existe)
- `data_venda_contrato` = `data_venda` do Contrato=1, usado como "ano de venda" na Carteira Vendas×Entregas

Implementado via CTE `DISTINCT ON (l.operacao)` em `regenerar_dim_operacao_weddings()`:
```sql
contrato_info AS (
  SELECT DISTINCT ON (l.operacao)
    l.operacao,
    r.data_inicio_evento,
    r.data_venda AS data_venda_contrato,
    r.fornecedor AS hotel
  FROM analytics.fato_lancamento_operacao l
  JOIN raw.vendas_excel r ON r.venda_numero = l.venda_n::text AND r.contrato = true
  ORDER BY l.operacao, r.id
)
```

## Motivo

- O Contrato de Casamento é o documento central que define a operação: data, local e contratante.
- `data_inicio_evento` é preenchida apenas nesse tipo de linha (é um campo específico do sistema de origem para contratos).
- O `fornecedor` do contrato é sempre o hotel/venue — em outros produtos pode ser cia. aérea, etc.
- Usar `DISTINCT ON` com `ORDER BY r.id` garante determinismo quando há múltiplas linhas de contrato para a mesma operação.

## Consequências

- Operações sem linha Contrato=1: `data_evento` cai para regex sobre o código (`extrair_data_evento`), que extrai `YYYY-MM-DD` do padrão `OP-YYYYMMDD-...`. Hotel fica NULL.
- Operações completamente sem data estruturada: `situacao = 'sem_data'`, aparecem na Carteira na coluna `sem_data`.
- O `hotel` é exibido no header do drawer de drill-down e na tabela "Próximos Casamentos".
