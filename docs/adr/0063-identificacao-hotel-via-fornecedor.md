# ADR-0063 — Identificação de hotel via coluna Fornecedor

**Status:** Aceito
**Data:** Maio/2026
**Versão:** v4.0-m1

## Contexto

ADR-0052 (v3.9-m1) estabeleceu que o hotel de uma operação é o campo `fornecedor` da linha com `contrato = true` em `raw.vendas_excel`, após o re-seed de maio/2026 que passou a capturar a coluna Fornecedor das planilhas Excel. Com esse re-seed, 171/226 operações (75,7%) passaram a ter hotel identificado.

Os 55 restantes (24,3%) são operações genuinamente sem linha `contrato = true` linkada — dados históricos sem re-seed completo ou operações atípicas. Para essas operações, o campo `hotel` continuava NULL, prejudicando filtros e agrupamentos por hotel no dashboard.

## Decisão

Adicionar um fallback secundário em `analytics.regenerar_dim_operacao_weddings()`: para operações que não têm linha `contrato = true`, buscar o Fornecedor a partir do produto vendido, com prioridade:

1. `Diárias de Hospedagem` (prioridade 1)
2. `Pacote de Casamento` (prioridade 2)

O `COALESCE(ci.hotel, hpb.hotel)` na query principal aplica o fallback apenas quando `contrato_info` não retorna hotel.

A lógica foi implementada na migration `0054_hotel_fallback_diarias.sql` como novo CTE `hotel_por_produto` em `analytics.regenerar_dim_operacao_weddings()`.

**Cobertura resultante (conforme comentário da migration):** ~41 operações ganham hotel via Diárias, +3 via Pacote, ~4 ficam NULL — cobertura de aproximadamente 96% vs. 75,7% antes do fallback.

## Consequências

- Cobertura de hotel passa de ~76% para ~96% das operações, reduzindo o número de operações sem hotel no filtro do dashboard
- O fallback via Diárias/Pacote pode ser menos preciso que via Contrato — o Fornecedor nessas linhas é o mesmo venue, mas não há garantia de que seja o hotel do casamento em operações com múltiplos fornecedores
- A função `regenerar_dim_operacao_weddings()` mantém dois caminhos de busca (contrato_info + hotel_por_produto), aumentando levemente a complexidade da query de regeneração
- As ~4 operações que ficam NULL após o fallback são casos sem linha de Contrato, Diárias nem Pacote — consideradas irrecuperáveis sem intervenção manual nos dados de origem
