# ADR-0097 — Carteira sem fallback de data (honestidade de dado)

**Status:** Aceito
**Data:** 2026-06-03
**Contexto:** A Carteira de Weddings lê `analytics.dim_operacao_weddings`, populada pelo ETL `regenerar_dim_operacao_weddings()`. O `data_evento` era derivado como `COALESCE(ci.data_inicio_evento, analytics.extrair_data_evento(operacao))` — quando a Data Início real do contrato era nula, caía num fallback que **parseia o NOME da operação** ("W - Paula e Fernando - 11MAY27" → 2027-05-11). Em produção, as operações de 2023 sem Data Início cadastrada apareciam com anos de evento **inventados** (ex.: célula espúria "2023 → 2027"), e o Yan encontrou esse "2027" que não existia na origem. Não é bug de cálculo — é dado faltante no ERP mascarado por heurística.

## Decisão

`data_evento` passa a ser **somente** `ci.data_inicio_evento` (a Data Início real do Contrato de Casamento). Nula → `NULL` → a operação aparece honestamente em **"sem data"** na Carteira, em vez de um ano inventado. A coluna `situacao` (`passado`/`futuro`/`sem_data`) deriva da mesma data real.

- Migration `0105` (CREATE OR REPLACE da função; não destrutiva — a dim é repovoada chamando-a).
- A função `analytics.extrair_data_evento(text)` ficou órfã (era usada só nesse fallback) → **dropada**.
- `data_venda_contrato` **não foi tocado** (já vinha correto da Data Venda).

## Justificativa

Mesmo princípio da remoção da Equação Financeira na v4.8: **melhor não mostrar do que mostrar errado**. A Carteira deixa de inventar anos e passa a funcionar como **detector de cadastro incompleto** — "sem data" é um sinal acionável (a curadoria preenche a Data Início no ERP), não um valor falso que esconde o buraco. A correção de raiz é parar de adivinhar; a fonte real (Data Início) volta a alimentar a Carteira após o re-upload de Vendas com o header corrigido (ADR-0098).
