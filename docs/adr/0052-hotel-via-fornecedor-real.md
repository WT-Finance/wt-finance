# ADR-0052 — Hotel via fornecedor real

**Status:** Aceito
**Data:** Maio/2026
**Versão:** v3.9-m1
**Supersede:** ADR-0031, Migration 0042

## Contexto

ADR-0031 (v3.5) definiu que o hotel de cada operação é o campo `fornecedor` da linha Contrato=1 em `raw.vendas_excel`. A implementação funcionava corretamente — porém a coluna `fornecedor` estava vazia em toda a base de dados original, então o campo `hotel` ficava NULL para todas as operações.

Migration 0042 (v3.8) adicionou um fallback: quando `fornecedor` era NULL, buscava o hotel pelo `pagante` (nome do cliente) no `raw.vendas_excel`. Esse workaround resolveu parcialmente o problema, mas dependia de matching por nome (impreciso) e mascarava a causa raiz.

O audit técnico pós-v3.8 identificou que as planilhas Excel de origem tinham a coluna Fornecedor preenchida mas o script de ingestão nunca a capturava. A correção foi atualizar o script de seed para incluir a coluna Fornecedor.

## Decisão

Após re-seed com planilhas atualizadas (mai/2026):

1. `raw.vendas_excel.fornecedor` passou a ser preenchido com o nome real do hotel/venue para todos os contratos de casamento.
2. Migration 0052 remove o CTE `contrato_via_pagante` e o `COALESCE` duplo de `regenerar_dim_operacao_weddings()`, voltando ao caminho único de ADR-0031: `fato_lancamento_operacao.venda_n → raw.vendas_excel (contrato = true)`.
3. O campo `hotel` em `dim_operacao_weddings` agora reflete o fornecedor real para todos os contratos com `venda_n` linkado.

## Consequências

- Cobertura de hotel: 171/226 operações (75,7%) — os 55 sem hotel são operações genuinamente sem linha Contrato=1 linkada (operações antigas sem venda_n nos lançamentos)
- Qualidade dos dados: hotel passa a ser o nome exato do venue, não uma aproximação via pagante
- Código mais simples: `regenerar_dim_operacao_weddings()` volta a ter um único caminho de busca
- Fallback via `extrair_data_evento()` para data_evento permanece (esse é um fallback legítimo para operações sem contrato estruturado)
