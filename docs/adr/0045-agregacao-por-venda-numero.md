# ADR-0045 — Agregação por Venda Nº

**Status:** Aceito  
**Data:** 2026-05-20  
**Versão:** v3.8-M11

## Contexto

A tabela `raw.vendas_excel` armazena uma linha por produto dentro de uma venda. Uma venda (identificada por `venda_numero`) pode ter múltiplos produtos — por exemplo, um Contrato de Casamento e uma Taxa de Serviço. Isso gerava dupla contagem nas análises de "Vendas em Aberto" e "Receita Negativa": a mesma venda aparecia duas vezes, uma por produto.

Adicionalmente, a situação de uma venda (Aberta/Fechada) podia divergir entre produtos da mesma venda (um Aberto, outro Fechado), tornando o status ambíguo.

## Decisão

Criar a view `analytics.vw_vendas_agregadas` que agrega `raw.vendas_excel` por `(venda_numero, setor_macro)`, eliminando a granularidade por produto:

- **Situação**: `Aberta` se QUALQUER produto da venda estiver em aberto; `Fechada` se TODOS estiverem fechados.
- **Valor Total** e **Receita**: somados de todos os produtos.
- **Vendedor** e **Data de Venda**: mínimo (primeiro registro).

Essa view é a fonte canônica para análises no nível de venda, não de produto.

## Consequências

- `get_vendas_em_aberto_weddings` passa a usar a view — zero dupla contagem.
- `get_vendas_prejuizo_weddings` criado sobre a view — Receita Negativa por venda, não por produto.
- Análises sobre `raw.vendas_excel` diretamente só fazem sentido quando a granularidade de produto é explicitamente necessária.
