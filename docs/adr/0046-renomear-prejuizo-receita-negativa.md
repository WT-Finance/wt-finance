# ADR-0046 — Renomear "Prejuízo" → "Receita Negativa"

**Status:** Aceito  
**Data:** 2026-05-20  
**Versão:** v3.8-M12

## Contexto

O termo "Prejuízo" tem carga semântica forte e pode ser mal interpretado: no contexto de Weddings, o que estamos medindo é a Receita Bruta negativa de uma venda individual — ou seja, o fornecedor recebeu mais do que o cliente pagou. Isso não é necessariamente um prejuízo operacional da empresa (pode ser um adiantamento, uma correção, ou um caso de margem negativa planejada).

O uso de "Prejuízo" gerava confusão com a Receita Líquida negativa (resultado de caixa da operação), que é um conceito diferente.

## Decisão

Renomear todos os rótulos voltados ao usuário de "Vendas com Prejuízo" para "Vendas com Receita Negativa" na aba Weddings.

- Card: `VendasReceitaNegativaCard` (componente separado de `PrejuizosTable`)
- RPC dedicado: `get_vendas_prejuizo_weddings` (nome interno mantido por consistência com convenção snake_case; rótulo externo é o que importa)
- `PrejuizosTable` permanece na aba Performance (análise cross-setor com granularidade diferente)

## Consequências

- Linguagem mais precisa para a gestora de Weddings.
- Dois componentes separados para dois contextos diferentes: Weddings usa o card de Receita Negativa (por Venda Nº, setor Weddings); Performance usa `PrejuizosTable` (por produto/vendedor, todos os setores).
- Se outros setores precisarem do card de Receita Negativa no futuro, o componente pode ser generalizado com um prop `setor`.
