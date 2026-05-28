# ADR-0088 — Filtros sticky e padrão tabular em Próximos Lançamentos

**Status:** Aceito  
**Data:** 2026-05-28  
**Contexto:** Próximos Lançamentos na Aba Financeiro exibia lançamentos em formato de linha minimalista (v4.4 M7) mas sem capacidade de filtrar por tipo (a pagar / a receber). O drawer não tinha elementos sticky, forçando o usuário a rolar até o topo para mudar o filtro de período.

## Decisão

Reformular o componente para formato tabular com 3 colunas e adicionar filtros de tipo que persistem sticky no drawer.

## Estrutura do componente

**Card lateral:**
- Header: título + pills de tipo (Todos / A pagar / A receber)
- Tabela: [ícone + data] | [pessoa / descrição] | [valor]
- Footer: "Ver mais" abre o drawer

**Drawer:**
- Sticky: título + subtítulo + pills de tipo + pills de período
- Rolável: lista completa de lançamentos

## Estados das pills de tipo

- **Todos** — exibe todos os lançamentos (default)
- **A receber** — filtra `tipo === 'Entrada'`
- **A pagar** — filtra `tipo === 'Saída'`
- Toggle exclusivo: clicar numa desativa a outra

## RPC

`get_proximos_lancamentos(p_dias INT DEFAULT 10, p_tipo TEXT DEFAULT NULL)`

`p_tipo` aceita `'A Receber Futuro'`, `'A Pagar Futuro'` ou `NULL` para ambos.

## Bug de descrição (M5.4)

Investigação: a condição `descricao && descricao !== 'Pagamento venda'` está correta. O campo `descricao` é NULL no banco para alguns títulos — ausência de preenchimento na importação, não erro de lógica. Comportamento mantido: exibe descrição se existir e não for o valor excluído.

## Justificativa

Formato tabular estrutura visualmente a lista, facilitando scan por data ou valor. Filtros sticky mantêm o contexto ao rolar — essencial quando o objetivo é operacional (verificar apenas pagamentos do dia, ou confirmar recebimentos esperados).
