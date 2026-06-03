# ADR-0098 — Operação Própria como vínculo direto operação↔diárias

**Status:** Aceito
**Data:** 2026-06-03
**Contexto:** A contagem de convidados de uma operação Weddings = passageiros únicos das **Diárias de Hospedagem** daquela operação. Para saber quais linhas de Vendas por Produto eram as diárias de uma operação, o sistema **cruzava** Vendas × Lançamentos por Operação: pegava `venda_n` de `analytics.fato_lancamento_operacao` (WHERE `operacao = p_operacao`), juntava em `raw.vendas_excel` por `venda_numero` e filtrava o produto. Esse join é **frágil** — fonte de divergência: o mesmo passageiro aparece em várias diárias, e o vínculo por `venda_n` nem sempre cobre todas as diárias da operação. O ERP passou a exportar uma coluna **"Operação Própria"** em Vendas por Produto, contendo o NOME da operação no mesmo formato de Lançamentos por Operação.

## Decisão

Adicionar a coluna **`operacao_propria`** a `raw.vendas_excel` (vinda do ERP) e usá-la como **vínculo direto** operação↔diárias, eliminando o cruzamento:

- Parser de Vendas por Produto mapeia `'Operação Própria' → operacao_propria` (migration `0107`: `ALTER TABLE ADD COLUMN` + `inserir_lote_raw` grava o campo).
- `contar_convidados_operacao` passa a filtrar **`raw.vendas_excel WHERE operacao_propria = p_operacao AND produto = 'Diárias de Hospedagem'`** e contar passageiros (split por vírgula + normalização + DISTINCT) — sem tocar em `fato_lancamento_operacao` (migration `0109`, com índice parcial para caber no timeout anon).
- **Dependência de re-upload:** Vendas por Produto usa substituição total; a coluna só existe nos dados após o Yan re-subir o arquivo COM a coluna. Até lá, a versão antiga da contagem vale sobre os dados atuais; `0109` só é aplicada **após** o re-upload.

## Justificativa

Substituir um join frágil por um **filtro direto** com uma chave de negócio explícita (o nome da operação, mantido pelo ERP) é mais simples, mais correto e mais barato. A contagem deixa de depender da cobertura do vínculo `venda_n` e passa a ler exatamente as diárias que o ERP atribuiu à operação. **Risco residual:** o formato do nome em `operacao_propria` deve casar exatamente com o de Lançamentos por Operação (espaços/acentos/maiúsculas); divergências de formato fazem o filtro falhar — validar o match com uma operação conhecida antes de confiar (curadoria de ~29 operações com formato suspeito é pendência operacional no ERP).
