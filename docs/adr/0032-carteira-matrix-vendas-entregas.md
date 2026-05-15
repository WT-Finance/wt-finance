# ADR 0032 — Carteira Vendas × Entregas: matriz pivot por ano

**Status:** Aceito  
**Data:** Maio/2026  
**Versão:** v3.5-m4

## Contexto

Weddings tem um padrão característico: casamentos são vendidos meses ou anos antes da data do evento. Um casal pode contratar em 2024 para um casamento em 2026. Isso cria uma "carteira" de compromisos futuros que não aparece nos KPIs do período corrente.

A gestão precisa visualizar:
- Quanto do pipeline atual já está comprometido para anos futuros
- Qual proporção das vendas de cada ano foi "entregue" no mesmo ano vs. em anos seguintes
- Faturamento e Receita Bruta associados a essa distribuição

## Decisão

**Matriz pivot `ano_venda_contrato × ano_casamento`:**

- **Linhas:** ano em que o Contrato de Casamento foi vendido (`data_venda_contrato`, ADR 0031)
- **Colunas:** ano em que o casamento acontece (`data_evento`)
- **Células:** count de casamentos, faturamento total ou receita bruta total (toggle)
- **Diagonal:** ano_venda = ano_casamento → casamento vendido e entregue no mesmo ano (destaque âmbar)
- **Acima da diagonal:** entrega futura (usual para casamentos)
- **Linha/coluna "Total":** totais marginais

Operações sem `data_evento` aparecem na coluna `sem_data`. Operações sem `data_venda_contrato` são excluídas (não têm linha de Contrato=1).

## Motivo

- Formato padrão em gestão de carteiras de serviços com lead time longo (reservas de hotel, agências de casamento, construtoras).
- Permite identificar "anos vazios" (ex: 2025 com poucas entregas) e prever faturamento futuro comprometido.
- Dados disponíveis sem esforço extra: `data_venda_contrato` e `data_evento` já existem em `dim_operacao_weddings` (ADR 0031).

## Consequências

- O RPC `get_carteira_weddings(p_metric)` retorna a matriz como JSON com `anos_casamento[]` e `linhas[]`.
- Toggle no front: Casamentos / Faturamento / Receita Bruta, sem nova chamada de rede (3 RPCs paralelos na carga da página).
- Operações sem Contrato=1 não aparecem na Carteira — são a minoria.
- Pipeline (lista de casamentos futuros com probabilidade) foi **removido** (ADR 0033) por ser redundante com a Carteira.
