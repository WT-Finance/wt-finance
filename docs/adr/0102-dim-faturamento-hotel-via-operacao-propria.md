# ADR-0102 — faturamento/receita/hotel da dim via Operação Própria

**Status:** Aceito
**Data:** 2026-06-04
**Contexto:** O ADR-0101 (v4.9.1) trocou `data_evento`/`data_venda_contrato` da `dim_operacao_weddings` para a Operação Própria, mas deixou `faturamento`/`receita`/`hotel` ainda derivados pelo join `venda_n` → Vendas. A investigação do follow-up revelou que essa contaminação é mais grave que a das datas:

- **`W - Darlene e Adnan`** exibia **R$ 375.523** de faturamento — **100% da `W - Daniella e Augusto`** (todos os 31 `venda_n` dos lançamentos da Darlene pertencem, no arquivo de Vendas, à Daniella: 28 linhas Weddings + 1 Produção + 2 WedMe). Pior: a Daniella era contada **duas vezes** (como ela mesma e como Darlene). O faturamento real da Darlene é **R$ 8.999** (só o contrato — ela ainda não tem outras vendas).

## Decisão

`faturamento`, `receita_bruta` e `hotel` da dim passam a ser derivados por **`operacao_propria`** (o mesmo vínculo direto do ADR-0101):
- `faturamento`/`receita_bruta` = soma de `raw.vendas_excel` (todos os produtos/setores) agrupada por `operacao_propria`.
- `hotel` = `fornecedor` da linha de hospedagem/pacote da operação, por `operacao_propria`.

Operação cujo nome no Lançamentos não casa a Operação Própria (nome defasado — ver ADR-0101) fica com faturamento 0 / hotel nulo, consistente com o "sem data" honesto dela.

## Justificativa

A Operação Própria é o vínculo confiável mantido pelo ERP; o `venda_n` digitado contamina e **duplica** valores. Medição: das 231 operações casadas, **214 ficam idênticas** (o `venda_n` estava correto para elas) e só **~17** mudam — exatamente as contaminadas. O total cai de R$ 44,38 Mi para ~R$ 44,14 Mi, removendo as duplas contagens. É correção de integridade, não reformulação de número.

Não subconta: onde o `venda_n` somava mais, o excedente era de outras operações (contaminação), não vendas próprias sem Operação Própria — confirmado no caso Darlene (100% Daniella).

## Escopo

Backend-only, duas migrations:
- **0112** — `regenerar_dim_operacao_weddings`: `faturamento`/`receita`/`hotel` da dim por Operação Própria.
- **0113** — as RPCs que **recalculam** esses valores por conta própria (não liam a dim): `get_operacoes_weddings` (CTEs `vendas_op`, `subsetor_op`, `tipo_contrato_cte`) e `get_operacao_weddings` (faturamento/receita, decomposição por subsetor, tipo de contrato). Descobriu-se que a Lista e o drawer **calculavam faturamento via `venda_n`**, então a 0112 sozinha não corrigia a coluna visível — daí a 0113.

Mapa de fontes (decisão do usuário) já vigente após v4.9.x: na **Lista de Operações**, Hotel/Data do Evento/Duração/Contrato/Conv./Faturamento ← Vendas Por Produto (via Operação Própria); Resultado Previsto ← Lançamentos por Operação; Margem = Resultado Previsto ÷ Faturamento. A **Carteira: Vendas × Entrega** é exclusivamente Vendas (ADR-0101, 0111). Com a 0113, o `venda_n` deixa de ser usado para dados de Vendas em toda a área Weddings.

Pendência operacional (ERP): corrigir os `venda_n` trocados nos Lançamentos (44374/44025/49444) e os nomes de operação defasados (*Camila e Bruno* "SET"≠"SEP"; *Thelma* "DDMMAA") — estas ficam com faturamento 0 / "sem data" até o alinhamento.
