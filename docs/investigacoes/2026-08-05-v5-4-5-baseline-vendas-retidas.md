# Baseline v5.4.5 — vendas retidas no espelho do Monde (o "antes")

Medido em **2026-08-05**, READ-ONLY, contra a **API do Monde** venda a venda — nunca contra o
upload de Excel. Este é o estado ANTES da correção da v5.4.5, e é o gabarito para provar o
"depois". Os dados brutos estão em `2026-08-05-v5-4-5-baseline-vendas-retidas.json`.

## O que foi medido

Para cada um dos 12 últimos meses: quantas vendas o espelho tem que a API **já não considera
espelháveis**, e quanto elas inflam faturamento e receita. "Espelhável" replica as três exclusões
do `transformSale`: `welcome`, `sem_setor` e `sem_item_ativo`.

| mês | espelho | API | sobrando | faturamento que sai | receita que sai |
|---|---|---|---|---|---|
| 2026-08 | 64 | 66 | 0 | — | — |
| **2026-07** | 752 | 776 | **6** | **R$ 455.170,09** (6,26%) | **R$ 295.988,60 (25,19%)** |
| **2026-06** | 637 | 670 | **6** | R$ 307.831,65 (4,50%) | R$ 10.953,68 (1,17%) |
| 2026-05 | 637 | 664 | 2 | R$ 1.552,97 (0,04%) | R$ 110,82 (0,02%) |
| 2026-04 | 731 | 764 | 1 | R$ 15.198,17 (0,28%) | R$ 4.309,90 (0,61%) |
| **2026-03** | 874 | 916 | **6** | R$ 62.971,08 (0,77%) | R$ 8.313,03 (0,78%) |
| 2026-02 | 641 | 675 | 1 | R$ 8.316,00 (0,15%) | R$ 1.737,42 (0,20%) |
| 2026-01 | 574 | 608 | 0 | — | — |
| 2025-12 | 550 | 589 | 1 | R$ 40.000,00 (0,89%) | **−R$ 40.000,00 (−7,61%)** |
| 2025-11 | 713 | 750 | 1 | R$ 5.678,94 (0,14%) | R$ 1.008,60 (0,18%) |
| 2025-10 | 798 | 843 | 0 | — | — |
| 2025-09 | 851 | 888 | 0 | — | — |
| **TOTAL** | | | **24** | **R$ 896.718,90** | **R$ 282.422,05** |

## Cinco leituras que importam

1. **Causa única.** As 24 são `sem_item_ativo` — a origem cancelou todos os produtos depois de a
   venda ser espelhada. Nenhuma é Welcome, nenhuma mudou de setor, nenhuma saiu da janela de data.
2. **Não é "tudo cai".** Em **dez/2025** a receita retida é **negativa** (−R$ 40.000,00): remover
   aquela venda faz a receita do mês **subir** 7,61%. A correção acerta o número, não o reduz.
3. **Concentração.** Uma venda (`73083`, jul/2026) responde por R$ 331.980,20 de faturamento e
   R$ 293.721,82 de receita — sozinha, quase toda a distorção de julho. Na API hoje ela vale
   R$ 19.712 com receita −R$ 687,96 e o único produto cancelado em 24/07.
4. **É contínuo, não um evento.** Há vendas retidas em 8 dos 12 meses, do mais antigo (nov/2025) ao
   corrente. E cresce: entre 04/08 e 05/08, julho foi de 5 para 6 e junho de 5 para 6.
5. **Auto-corrigível.** As **24 têm `raw_hash` divergente** do que a API devolve hoje ⇒ quando
   voltarem a ser espelháveis, o UPSERT as regrava sozinho. **Nenhuma precisa de DML.**

## O que este número NÃO é

Não é o Δ que se vê comparando "espelho hoje" × "API hoje". Essa comparação mistura duas coisas:
o efeito desta versão **e** a defasagem natural do espelho (venda que mudou na origem e ainda não
foi reconciliada). Em julho, por exemplo, há **13 vendas defasadas** — algumas com faturamento
*subindo* R$ 4.346 —, que a reconciliação corrigiria com ou sem a v5.4.5.

Rodando o `transformSale` **antigo e o novo sobre o mesmo input** da API, o resultado é **776
vendas idênticas, 0 mudam**: a versão **não altera cálculo nenhum**. O efeito dela é permitir que
o UPSERT **sobrescreva a linha velha**, que hoje é intocável.

## Método

- Conexão ao banco com `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` (trava mecânica).
- API só por GET; chave nunca impressa. Concorrência 8, o mesmo teto da ingestão.
- ~8,4 mil chamadas de detalhe (uma por venda espelhada), salvas por mês para ser resumível.
- Scripts efêmeros no tmp do job, fora do repositório. O JSON ao lado é a saída preservada.
