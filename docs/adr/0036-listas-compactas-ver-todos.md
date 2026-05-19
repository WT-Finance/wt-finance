# ADR 0036 — Padrão de listas compactas com Ver todos

**Status:** Aceito  
**Data:** Maio/2026  
**Versão:** v3.6-m4

## Contexto

As listas dentro da Visão Geral (Próximos Casamentos, Mix por Produto, Vendas em Aberto, Vendas com Prejuízo) podiam ter dezenas ou centenas de linhas. Exibir todas por padrão aumentava o scroll da página e reduzia a densidade informacional para a diretoria, que precisa apenas do resumo.

## Decisão

Todas as listas dentro da Visão Geral exibem **no máximo 5 linhas por padrão**, com botão "Ver todos (N)" / "Ver menos" que expande a lista inline sem nova request.

**Componentes afetados:**
- `ProximosCasamentosCard` — ordenação por data do casamento ascendente
- `MixProdutoTable` — ordenação por faturamento descendente
- `VendasEmAbertoCard` — ordenação por data da venda descendente (mais recente primeiro)
- `PrejuizosTable` — ordenação por valor de prejuízo descendente

**Implementação escolhida:** Opção A — expande inline via `useState`. Modal ou rota dedicada (Opções B/C) ficam reservadas para quando as listas crescerem a 200+ linhas de forma recorrente.

## Justificativa

Equilibra densidade visual com profundidade de informação. A diretoria vê o topo de cada lista; quem precisar de mais detalhe (Yan, análise operacional) usa o botão. Sem nova request à rede — todos os dados já estão carregados no servidor e enviados ao cliente.

## Consequências

**Positivas:**
- Visão Geral mais compacta e escaneável em reuniões
- "Ver todos" não exige round-trip ao servidor

**Negativas / trade-offs:**
- Se uma lista tiver 500+ itens, todos são enviados ao cliente mesmo que só 5 sejam mostrados. Mitigação futura: paginação server-side com route handler dedicado.
