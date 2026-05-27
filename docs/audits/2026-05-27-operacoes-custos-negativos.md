# Auditoria: Operações Weddings com Custos Negativos

**Data:** 2026-05-27
**Contexto:** Após remoção do `GREATEST` em migration 0079 (v4.2), operações com `resultado_caixa > receita_bruta` passaram a exibir Custos negativos (em vermelho) na Lista de Operações. Este relatório documenta as 58 operações afetadas e propõe ações corretivas.

---

## Resumo Executivo

Foram identificadas **58 operações Weddings** onde o `resultado_caixa` (entradas − saídas de caixa) supera a `receita_bruta` calculada a partir dos registros de vendas, resultando em Custos negativos. O gap total é de **R$ 765.321,28**, distribuído em três categorias: 5 operações sem nenhuma venda linkada (R$ 61.734), 16 com vendas muito incompletas — abaixo de 50% do caixa recebido (R$ 406.140), e 37 com vendas parcialmente incompletas (R$ 297.447). A raiz do problema é incompletude de dados (registros de vendas ausentes ou parciais no ERP), não um bug de código. A hipótese de Reembolso Fornecedor via cartão de crédito como causa das parciais foi testada e **refutada** — nenhuma das 37 operações parcialmente incompletas possui entradas em conta cartão. A ação prioritária é o recadastro de vendas para as 21 operações mais críticas (gaps acima de R$ 5.000).

---

## Categorias

### Categoria 1: Sem Venda Linkada (5 operações)

Operações com `receita_bruta = 0` — nenhuma `venda_n` foi associada a qualquer lançamento. O sistema não possui sequer parcial dos dados de vendas para essas operações.

**Soma do gap: R$ 61.733,85**

| Operação | Gap R$ |
|---|---|
| W - Josnaila e Diego - 29MAY2024 | R$ 20.483,95 |
| W - Julia e Ciro - 01JUN2024 | R$ 14.884,46 |
| W - Carolina e Sergio - 06SEP2024 | R$ 14.616,15 |
| W - Tatiane e Colin - 29APR2024 | R$ 7.826,62 |
| W - Daniele e Luis - 11APR2024 | R$ 3.922,67 |

**Ação:** Verificar `venda_n` nos lançamentos no ERP e vincular/recadastrar venda se ausente.

---

### Categoria 2: Muito Incompletas (16 operações)

Operações onde `receita_bruta < 50%` do `resultado_caixa`. A diferença é tão expressiva que provavelmente há registros de vendas inteiramente faltantes — não apenas parcelas ou timing.

**Soma do gap: R$ 406.140,30**

| Operação | Rec. Bruta | Resultado Caixa | Gap R$ | Gap % |
|---|---|---|---|---|
| W - Darlene e Adnan - DDMMAA | R$ 23.397,80 | R$ 70.368,80 | R$ 46.971,00 | 66,7% |
| W - Daniella e Augusto - 08APR2024 | R$ 23.397,80 | R$ 70.368,80 | R$ 46.971,00 | 66,7% |
| W - Rafaela e Gabriel - 14FEB24 | R$ 8.850,91 | R$ 50.453,72 | R$ 41.602,81 | 82,5% |
| W - Julia & Marcel - 24MAY24 | R$ 21.657,60 | R$ 61.582,85 | R$ 39.925,25 | 64,8% |
| W - Gabriela e Lucas - 12APR2024 | R$ 6.661,16 | R$ 46.027,37 | R$ 39.366,21 | 85,5% |
| W - Rafael e Maike - 25APR2024 | R$ 8.969,20 | R$ 38.730,46 | R$ 29.761,26 | 76,8% |
| W - Milene e Luis Gustavo - 09MAR2024 | R$ 6.364,72 | R$ 35.868,38 | R$ 29.503,66 | 82,3% |
| W - Amanda e João Paulo - 10AUG2024 | R$ 16.182,78 | R$ 45.272,99 | R$ 29.090,21 | 64,3% |
| W - Isabella e Bruno - 10NOV2024 | R$ 21.215,17 | R$ 48.584,30 | R$ 27.369,13 | 56,3% |
| W - Jessica e Renan - 12FEB2024 | R$ 22.023,95 | R$ 47.423,40 | R$ 25.399,45 | 53,6% |
| W - Lais e Jonas - 04OCT2024 | R$ 8.157,26 | R$ 31.918,60 | R$ 23.761,34 | 74,4% |
| W - Erica e Hector - 17OCT2024 | R$ 665,24 | R$ 6.741,19 | R$ 6.075,95 | 90,1% |
| W - Ana Carla e Artur - 17OCT2024 | R$ 1.850,94 | R$ 7.069,89 | R$ 5.218,95 | 73,8% |
| W - Deborah e Gabriel - 12SET2024 | R$ 2.818,15 | R$ 5.694,86 | R$ 2.876,71 | 50,5% |
| W - Helen e Catia - 22APR2024 | R$ 915,00 | R$ 4.405,71 | R$ 3.490,71 | 79,2% |
| W - Bruna e Otavio 06APR24 | R$ 2.690,40 | R$ 11.447,06 | R$ 8.756,66 | 76,5% |

> **Nota:** W - Darlene e Adnan - DDMMAA e W - Daniella e Augusto - 08APR2024 possuem exatamente os mesmos valores de receita_bruta e resultado_caixa (R$ 23.397,80 / R$ 70.368,80). Pode ser uma duplicata ou operação sem data cadastrada corretamente (situacao = "sem_data").

**Ação:** Recadastrar planilha de Vendas por Produto para estas operações no ERP.

---

### Categoria 3: Parcialmente Incompletas (37 operações)

Operações onde `receita_bruta` está entre 50% e 100% do `resultado_caixa`. O gap pode ser causado por timing de importação (vendas lançadas após o caixa) ou por parcelas de vendas ainda não importadas.

**Soma do gap: R$ 297.447,13**

A maioria possui gaps pequenos (abaixo de R$ 5.000), sugerindo diferenças de timing. Exceções notáveis com gaps maiores:

| Operação | Rec. Bruta | Resultado Caixa | Gap R$ | Gap % | Situação |
|---|---|---|---|---|---|
| W - Giovanna e Matheus - 02NOV2024 | R$ 55.362,15 | R$ 101.000,58 | R$ 45.638,43 | 45,2% | passado |
| W - Marcella e Ingo - 01JUN2024 | R$ 70.103,31 | R$ 112.604,62 | R$ 42.501,31 | 37,7% | passado |
| W - Larissa e Isabella - 17APR2024 | R$ 43.481,34 | R$ 69.140,45 | R$ 25.659,11 | 37,1% | passado |
| W - Leticia e Mike - 21MAY26 | R$ 145.218,91 | R$ 170.110,65 | R$ 24.891,74 | 14,6% | passado |
| W - Caroline e Sandro - 05NOV25 | R$ 78.997,10 | R$ 99.245,32 | R$ 20.248,22 | 20,4% | passado |
| W - Sarah e Luis Henrique - 22APR26 | R$ 75.314,03 | R$ 94.636,43 | R$ 19.322,40 | 20,4% | passado |
| W - Fernanda e Tales - 05APR25 | R$ 35.319,74 | R$ 49.315,24 | R$ 13.995,50 | 28,4% | passado |
| W - Juliana e Cassiano - 22NOV2025 | R$ 15.844,31 | R$ 27.432,35 | R$ 11.588,04 | 42,2% | passado |
| W - Tatiane e Jorge - 20APR2025 | R$ 51.804,67 | R$ 62.533,85 | R$ 10.729,18 | 17,2% | passado |
| W - Leidi e Bira - 20APR26 | R$ 114.321,12 | R$ 123.136,89 | R$ 8.815,77 | 7,2% | passado |

**Ação:** Para operações com situacao = "passado" e gap > R$ 5.000, verificar timing de importação de vendas no ERP. Operações com situacao = "futuro" tendem a resolver no próximo upload de vendas.

---

## Hipótese: Reembolso Fornecedor

**Hipótese testada:** As 37 operações parcialmente incompletas poderiam ter lançamentos de entrada em contas cartão de crédito (reembolsos de fornecedor) que inflariam legitimamente o `resultado_caixa` sem correspondência em vendas.

**Resultado:** Query retornou **0 linhas**. Nenhuma das 37 operações parcialmente incompletas possui entradas em contas `eh_cartao_credito = TRUE`.

**Conclusão:** A hipótese Reembolso Fornecedor está **refutada**. As inconsistências são exclusivamente causadas por incompletude dos registros de vendas no ERP.

---

## Tabela Detalhada — 20 Operações Mais Graves

Ordenadas por gap absoluto (R$):

| Operação | Casal | Hotel | Data Evento | Rec. Bruta | Resultado Caixa | Gap R$ | Gap % | Categoria | Sugestão |
|---|---|---|---|---|---|---|---|---|---|
| W - Darlene e Adnan - DDMMAA | Darlene e Adnan | Hard Rock Punta Cana | — | R$ 23.397,80 | R$ 70.368,80 | R$ 46.971,00 | 66,7% | muito_incompleta | Verificar duplicata com Daniella e Augusto; recadastrar vendas |
| W - Daniella e Augusto - 08APR2024 | Daniella e Augusto | Hard Rock Punta Cana | 08/04/2024 | R$ 23.397,80 | R$ 70.368,80 | R$ 46.971,00 | 66,7% | muito_incompleta | Mesmos valores que Darlene e Adnan — investigar |
| W - Giovanna e Matheus - 02NOV2024 | Giovanna e Matheus | Club Med Trancoso | 02/11/2024 | R$ 55.362,15 | R$ 101.000,58 | R$ 45.638,43 | 45,2% | parcialmente_incompleta | Recadastrar parcelas faltantes de vendas |
| W - Marcella e Ingo - 01JUN2024 | Marcella e Ingo | Hard Rock Punta Cana | 01/06/2024 | R$ 70.103,31 | R$ 112.604,62 | R$ 42.501,31 | 37,7% | parcialmente_incompleta | Recadastrar parcelas faltantes de vendas |
| W - Rafaela e Gabriel - 14FEB24 | Rafaela e Gabriel | Dreams Dominicus | 14/02/2024 | R$ 8.850,91 | R$ 50.453,72 | R$ 41.602,81 | 82,5% | muito_incompleta | Recadastrar planilha de Vendas por Produto |
| W - Julia & Marcel - 24MAY24 | Julia & Marcel | Hard Rock Riviera Maya | 24/05/2024 | R$ 21.657,60 | R$ 61.582,85 | R$ 39.925,25 | 64,8% | muito_incompleta | Recadastrar planilha de Vendas por Produto |
| W - Gabriela e Lucas - 12APR2024 | Gabriela e Lucas | Dreams Dominicus | 12/04/2024 | R$ 6.661,16 | R$ 46.027,37 | R$ 39.366,21 | 85,5% | muito_incompleta | Recadastrar planilha de Vendas por Produto |
| W - Rafael e Maike - 25APR2024 | Rafael e Maike | Occidental Punta Cana | 25/04/2024 | R$ 8.969,20 | R$ 38.730,46 | R$ 29.761,26 | 76,8% | muito_incompleta | Recadastrar planilha de Vendas por Produto |
| W - Milene e Luis Gustavo - 09MAR2024 | Milene e Luis Gustavo | Grand Palladium Imbassaí | 09/03/2024 | R$ 6.364,72 | R$ 35.868,38 | R$ 29.503,66 | 82,3% | muito_incompleta | Recadastrar planilha de Vendas por Produto |
| W - Amanda e João Paulo - 10AUG2024 | Amanda e João Paulo | Wyndham Salvador | 10/08/2024 | R$ 16.182,78 | R$ 45.272,99 | R$ 29.090,21 | 64,3% | muito_incompleta | Recadastrar planilha de Vendas por Produto |
| W - Isabella e Bruno - 10NOV2024 | Isabella e Bruno | Club Med Lake Paradise | 10/11/2024 | R$ 21.215,17 | R$ 48.584,30 | R$ 27.369,13 | 56,3% | muito_incompleta | Recadastrar planilha de Vendas por Produto |
| W - Larissa e Isabella - 17APR2024 | Larissa e Isabella | Hard Rock Punta Cana | 17/04/2024 | R$ 43.481,34 | R$ 69.140,45 | R$ 25.659,11 | 37,1% | parcialmente_incompleta | Recadastrar parcelas faltantes de vendas |
| W - Jessica e Renan - 12FEB2024 | Jessica e Renan | Breezes Bahamas | 12/02/2024 | R$ 22.023,95 | R$ 47.423,40 | R$ 25.399,45 | 53,6% | muito_incompleta | Recadastrar planilha de Vendas por Produto |
| W - Leticia e Mike - 21MAY26 | Leticia e Mike | Dreams Onyx | 21/05/2026 | R$ 145.218,91 | R$ 170.110,65 | R$ 24.891,74 | 14,6% | parcialmente_incompleta | Verificar timing; evento recente |
| W - Lais e Jonas - 04OCT2024 | Lais e Jonas | Grand Palladium Imbassaí | 04/10/2024 | R$ 8.157,26 | R$ 31.918,60 | R$ 23.761,34 | 74,4% | muito_incompleta | Recadastrar planilha de Vendas por Produto |
| W - Josnaila e Diego - 29MAY2024 | Josnaila e Diego | — | 29/05/2024 | R$ 0,00 | R$ 20.483,95 | R$ 20.483,95 | 100% | sem_venda_linkada | Vincular venda_n nos lançamentos no ERP |
| W - Caroline e Sandro - 05NOV25 | Caroline e Sandro | Dreams Curaçao | 05/11/2025 | R$ 78.997,10 | R$ 99.245,32 | R$ 20.248,22 | 20,4% | parcialmente_incompleta | Recadastrar parcelas faltantes de vendas |
| W - Sarah e Luis Henrique - 22APR26 | Sarah e Luis Henrique | Hard Rock Punta Cana | 22/04/2026 | R$ 75.314,03 | R$ 94.636,43 | R$ 19.322,40 | 20,4% | parcialmente_incompleta | Recadastrar parcelas faltantes de vendas |
| W - Fernanda e Tales - 05APR25 | Fernanda e Tales | Dreams Dominicus | 05/04/2025 | R$ 35.319,74 | R$ 49.315,24 | R$ 13.995,50 | 28,4% | parcialmente_incompleta | Recadastrar parcelas faltantes de vendas |
| W - Julia e Ciro - 01JUN2024 | Julia e Ciro | — | 01/06/2024 | R$ 0,00 | R$ 14.884,46 | R$ 14.884,46 | 100% | sem_venda_linkada | Vincular venda_n nos lançamentos no ERP |

---

## Próximos Passos para Yan

1. **Investigar duplicata Darlene/Daniella:** W - Darlene e Adnan - DDMMAA e W - Daniella e Augusto - 08APR2024 possuem exatamente os mesmos valores de caixa e vendas — verificar se são a mesma operação cadastrada em duplicidade no ERP.

2. **Recadastrar vendas das 5 operações sem_venda_linkada:** Josnaila e Diego, Julia e Ciro, Carolina e Sergio, Tatiane e Colin, Daniele e Luis — verificar `venda_n` nos lançamentos do ERP e vincular/recadastrar.

3. **Priorizar as 14 operações muito_incompletas com gap > R$ 5.000:** Todas são de 2024 (já encerradas). Recadastrar planilha de Vendas por Produto no upload de cada operação.

4. **Verificar 10 operações parcialmente_incompletas com gap > R$ 5.000:** Todas já encerradas (situacao = "passado"). Verificar se há parcelas de venda pendentes de importação no ERP.

5. **Monitorar operações futuras com gap:** W - Rafaela e Bruno - 15SEP26, W - Kleiciane e Herbert 07JUL26, W - Amanda e Haysom - 29OCT26, W - Paula e Fernando - 11MAY27, W - Déborah e William - 30MAY27, W - Henrique e Gustavo - 06APR27, W - Naiara e Diogo - 18NOV26 — gap esperado de resolver conforme vendas forem importadas.

6. **Decisão de exibição (M0 v4.3):** Definir se a Lista de Operações deve exibir `max(0, custos)` para evitar vermelho em gaps de timing pequenos, ou manter comportamento atual para forçar visibilidade dos problemas de dados.

---

## Metadados da Auditoria

- **Query 1:** Categorização completa de 58 operações com resultado_caixa > receita_bruta
- **Query 2:** Teste hipótese Reembolso Fornecedor via entradas em cartão de crédito → 0 resultados
- **Total operações afetadas:** 58
- **Gap total:** R$ 765.321,28
  - sem_venda_linkada: 5 ops, R$ 61.733,85
  - muito_incompleta: 16 ops, R$ 406.140,30
  - parcialmente_incompleta: 37 ops, R$ 297.447,13
