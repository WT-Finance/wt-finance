# ADR-0101 — data_evento da Carteira/Lista vem da Data Início da Vendas (via Operação Própria)

**Status:** Aceito
**Data:** 2026-06-04
**Contexto:** A v4.9 (ADR-0097) já tinha tirado o fallback que inventava a data do evento pelo nome da operação; `data_evento` passou a vir da linha de Contrato da base de Vendas. Mas a ligação Lançamentos→Vendas ainda era feita pelo `venda_n` (digitado no ERP no Lançamentos). Em produção, esse `venda_n` aponta, em algumas operações, para o **contrato de OUTRO casamento de nome parecido** — confirmado com 3 casos:
- `W - Paula e Fernando - 11MAY27` → `venda_n` 44374 = contrato da *Paula e Bruno* (2023)
- `W - Darlene e Adnan` → `venda_n` 44025 = contrato da *Daniella e Augusto* (2024)
- `W - Larissa e Vitor` → `venda_n` 49444 = contrato da *Larissa e Thiago* (2025)

Resultado: 3 casamentos de 2027 apareciam em 2023/2024/2025 na Carteira: Vendas × Entrega e na Lista de Operações. Os totais ficavam "quase certos" — fora por ~3 por ano.

## Decisão

**`data_evento` vem SEMPRE da coluna `Data Início` da base VendasPorProduto, da linha `Produto = 'Contrato de casamento'`, casada pela `Operação Própria` (o nome da operação mantido pelo ERP) — em qualquer lugar do app.**

- **Carteira: Vendas × Entrega** (`get_carteira_weddings`) passa a ser construída **só da base de Vendas**: cada casamento = 1 linha `Contrato de casamento`; linha da matriz = ano de `Data Venda`, coluna = ano de `Data Início`; faturamento/receita = soma dos produtos da operação por `operacao_propria`. Deixa de ler `dim_operacao_weddings`.
- **Lista de Operações / drawer / KPIs** (`dim_operacao_weddings`): em `regenerar_dim_operacao_weddings`, `data_evento` e `data_venda_contrato` passam a vir da linha `Contrato de casamento` casada por `operacao_propria = operacao`. **Sem fallback por `venda_n`** — operação cujo nome no Lançamentos esteja defasado (ex.: `...DDMMAA` em vez da data real) não casa e fica "sem data" honesto, até a equipe alinhar o nome no ERP.

`faturamento`/`receita`/`hotel` da dim continuam, por ora, derivados pelo `venda_n` (mesma contaminação, tratada em follow-up).

## Justificativa

A `Operação Própria` é o vínculo direto e confiável entre Vendas e a operação (mesmo princípio do ADR-0098 para a contagem de convidados); o `venda_n` é digitado e erra. Usar a Data Início do próprio contrato da operação, achado pela Operação Própria, é a fonte correta e inequívoca para a data do evento. "Sem data" honesto para o nome defasado é preferível a herdar a data de outro casamento (mesma filosofia do ADR-0097).

## Dependência

Exige a coluna `Operação Própria` ingerida em `raw.vendas_excel` — o que dependeu de corrigir o parser para casar cabeçalhos com tolerância a acento/caixa/espaço (o arquivo traz `Operação Propria`, sem acento) e de um re-upload de Vendas.
