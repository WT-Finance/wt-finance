# Investigação-delta — DRE por Competência: Reconhecimento e Integração

Delta da investigação de 2026-07-27 (`2026-07-27-dre-competencia-api-monde.md`). Data: 2026-07-28 · somente leitura · fecha a investigação que antecede o briefing da DRE Gerencial (Onda 2).

**VEREDITO REVISADO: PARCIAL, agora com o mapa exato de causa** — H3 (reconhecimento diferido) explica a maior parte da Comissão e fecha Taxa DU/Taxa de Serviço em junho, mas é **refutada como regra única**; a montagem do bloco de receita de março **integra sem dupla contagem** (resíduo não-atribuído = 0,00).

---

## 1. ERRATA — a DEFASAGEM do §5.1 estava errada

A explicação original dos deltas de abr–jul ("export foto de ~18/07 × API viva") é **falsa**. Prova, dos próprios arquivos-fonte:

1. O relatório de lançamentos tem **971 emissões entre 19 e 31/jul** (187 no dia 20, 252 no 21, 111 no 22, 169 no 24) e **liquidações registradas até 27/jul** — o export é de 27/07 ou depois.
2. Os dois arquivos são da mesma safra: dos 971 lançamentos tardios, **507 pertencem a grupos de despesa e somam −388.993,84**, e a DRE bate **0,00 contra os lançamentos nos 9 grupos de despesa de julho**. Se a DRE fosse de 18/jul, esses 389k faltariam. Não faltam.
3. O corte T≈2026-07-18/19 encontrado pela busca em grade coincide com o **`synced_at` do espelho intermediário** — literal no JSON do anexo (`2026-07-18T01:10:36`) e coerente com o §9.4 (espelho defasado; sync incremental só re-busca vendas recentes). A grade encontrou a data de sincronização da fonte, não a do export.

**Consequência:** a janela de deriva é de **horas, não de nove dias**. O veredito PARCIAL vale sem o atenuante "mais forte do que a régua sugere". Os deltas de junho ficaram **sem causa** — objeto das missões J1/J2 abaixo.

**Correções menores registradas no relatório-mãe:**
- O "±848k, P3" citado como corroboração era indevido: aquele número é o delta entre bloco bruto e bloco decomposto **dentro do mesmo export**, sem relação com export × API.
- §7.3: "localizados + não-localizados = alvo" era tautologia (alvo − localizado ≡ não-localizado). A evidência real é que **todo documento encontrado caiu no mês certo com o valor certo** (18.237,55 em abr e 15.428,23 em mai, ao centavo).
- Aproveitando a re-execução: o delta de Taxa de Serviço de março no relatório-mãe era **+9.200,72**, não +10.736,05 (a soma manual original incluía `t_agency` de itens `deleted`).

---

## 2. J1 — Reconhecimento diferido (H3)

**H3:** a DRE reconheceria a receita quando uma condição posterior se cumpre (liquidação, saldo, viagem), não no ato da venda.

### Matriz — delta contra o gabarito, 12 linhas × 5 recortes × 2 meses

Recortes: **A** universo completo (baseline do relatório) · **B** só vendas com `total_balance == 0` · **C** só vendas com todos os `payments[]` liquidados · **D** só vendas com fim de viagem (`period_end`/`data_fim`/`arrival`) ≤ fim do mês · **E** itens com `issue_date` no mês ∧ B.

**Março** (916 vendas; B=912, C=532, D=357):

| Linha | ΔA | ΔB | ΔC | ΔD | ΔE |
|---|---:|---:|---:|---:|---:|
| Comissão | **0,00** | **0,00** | −518.950,41 | −550.120,37 | +5.046,17 |
| Over | **0,00** | **0,00** | −38.686,14 | −51.638,29 | +1.233,45 |
| Desconto | **0,00** | **0,00** | +63.828,56 | +118.169,85 | −1.779,99 |
| Taxa DU | **0,00** | **0,00** | −10.671,07 | −20.474,56 | +573,34 |
| Taxa CC DU | **0,00** | **0,00** | +132,80 | +179,90 | **0,00** |
| Taxa RAV | +513,71 | +513,71 | −86.533,88 | −113.257,84 | +3.643,76 |
| Taxa CC RAV | −513,71 | −513,71 | +2.289,83 | +2.789,49 | −533,74 |
| Taxa de Serviço | +9.200,72 | **−223,63** | −308.822,87 | −363.432,88 | +2.487,65 |
| Operação própria | +18.900,00 | +18.900,00 | −6.553,00 | −10.607,00 | +18.900,00 |
| Reemb. Fornecedor | −170.763,04 | −171.185,44 | −286.698,00 | −350.258,72 | −171.185,44 |
| Reemb. Cliente | +29.402,04 | +29.402,04 | +232.858,93 | +708.493,38 | +29.402,04 |
| Reemb. Forn. (desc) | −4.692,18 | −4.692,18 | +1.396,48 | +1.396,48 | −4.692,18 |

**Junho** (670 vendas; B=644, C=269, D=205):

| Linha | ΔA | ΔB | ΔC | ΔD | ΔE |
|---|---:|---:|---:|---:|---:|
| Comissão | +58.496,30 | **+5.932,22** | −265.635,76 | −299.177,79 | +6.289,38 |
| Over | +9.279,75 | +9.168,66 | −18.890,22 | −21.521,19 | +4.531,19 |
| Desconto | −138.862,68 | −138.862,68 | +743.520,99 | +963.743,75 | −126.073,98 |
| Taxa DU | +160,00 | **0,00** | −7.353,94 | −5.590,72 | **0,00** |
| Taxa CC DU | **0,00** | **0,00** | +103,44 | +63,07 | **0,00** |
| Taxa RAV | +13.777,62 | +11.218,52 | −70.221,63 | −68.997,64 | +11.662,77 |
| Taxa CC RAV | −417,04 | −417,04 | +2.318,45 | +1.732,01 | −417,04 |
| Taxa de Serviço | +24.795,14 | **−9.360,61** | −304.904,56 | −390.592,57 | −9.326,88 |
| Operação própria | +60.389,16 | +60.389,16 | −49.790,20 | −60.154,73 | +60.389,16 |
| Reemb. Fornecedor | −78.487,47 | −78.487,47 | −1.040.418,57 | −1.224.725,89 | −78.487,47 |
| Reemb. Cliente | +4.338,44 | +4.338,44 | +212.601,62 | +216.061,07 | +4.338,44 |
| Reemb. Forn. (desc) | **0,00** | **0,00** | **0,00** | **0,00** | **0,00** |

*(Nota de composição: Taxa de Serviço nesta matriz = `t_agency` de hotels/others/aéreo + `agency_service_fee` de others, o combo do relatório-mãe — por isso o ΔA de junho difere do +4.507,35 lá citado, que era `t_agency` puro.)*

### Veredito J1

- **C e D estão MORTOS pelo critério de falsificação:** destroem as 5 linhas exatas de março (Comissão −519k/−550k). Não há regra única de liquidação-completa ou viagem-realizada.
- **E quebra os zeros de março** (Comissão +5.046, Desconto −1.780) — o eixo por `issue_date` do item não substitui o mês da venda.
- **B (saldo == 0) é o único recorte que preserva março intacto** (todos os 0,00 mantidos; TdS até melhora: −223,63) **e melhora junho**: Comissão **+58.496 → +5.932 (1,8%)** — 90% do delta de junho era venda com saldo em aberto —, Taxa DU **+160 → 0,00 exato**, TdS +24.795 → −9.360 (2,3%).
- Pelo critério do prompt (junho ≤1% em ≥4 das 5 linhas exatas de março), **H3 é REFUTADA como regra única**: sob B, junho fecha ≤1% só em Taxa DU e Taxa CC DU; Comissão fica a 1,8%; Over (+9.168) e Desconto (−138.862) não se movem.
- **H3 vale como COMPONENTE nomeado:** a condição exata é `total_balance == 0` da venda — explica Comissão (90% do delta), Taxa DU (exato) e Taxa de Serviço em junho, e já explicava Operação própria em julho (relatório-mãe §5.3).

### Alternativa (cancelamento tardio / recortes de status) — também refutada

Junho com (i) só `active`, (ii) `active+canceled`, (iii) tudo, (iv) `active` + cancelado até o fim do mês, (v) idem +30 dias:

| Recorte | Δ Desconto jun | Δ Comissão jun | Δ Over jun |
|---|---:|---:|---:|
| active | +929.039,96 | +55.422,18 | +3.298,85 |
| active+canceled (baseline) | −138.862,68 | +58.496,30 | +9.279,75 |
| tudo | −138.862,68 | +58.496,30 | +9.279,75 |
| active + canc ≤ fim do mês | −138.862,64 | +58.004,90 | +5.072,07 |
| active + canc ≤ fim+30d | −138.862,68 | +58.496,30 | +9.279,75 |

Nenhum fecha junho; março só fecha com `active+canceled`. Não há regra única de status.

### O resíduo de junho, nomeado até onde a evidência vai

O desconto de junho é dominado por **6 cancelamentos de "Bloqueio Hospedagem"** (Weddings; 1.067.902,60 dos 1.102.653,38 totais), e há **dupla representação do estorno** no payload: a venda 72298 carrega o MESMO valor (184.500,00) como `discount_amount` do item cancelado E como documento vendor `Reembolso`. O excesso de −138.862,68 admite subconjunto exato (95.412,00 + 30.660,00 + 12.788,70 + 1,98 em ajustes de centavos), mas **sem atributo comum observável** — combinação, não regra. Conclusão honesta: o tratamento que a DRE dá aos estornos de bloqueio (netting entre Desconto, Reembolso Fornecedor e Operação própria) **não é reproduzível pelos campos expostos**. Junho carrega isso em Desconto (−138,9k), Over (+9,2k), Taxa RAV (+11,2k) e Operação própria (+60,4k).

---

## 3. J2 — Montagem do bloco de receita

Composição: 12 linhas do bloco da venda via API (recorte A) + 3 linhas via filtro H2 (`bills.description`, eixo `due_date`) + 6 linhas diretas dos lançamentos (tomadas pelo alvo — a reconciliação lançamentos→DRE é a premissa P2, já provada).

### Março — alvo × obtido × delta

| Componente | Alvo | Obtido | Δ |
|---|---:|---:|---:|
| Receitas da venda (7 linhas, API) | 1.582.180,93 | 1.440.032,32 | −142.148,61 |
| Descontos da venda (5 linhas, API) | −934.854,42 | −910.658,27 | +24.196,15 |
| Receita de Vendas (H2 + diretos) | 498.708,83 | 352.202,96 | −146.505,87 |
| Impostos e Deduções (H2 + diretos) | −16.137,89 | −14.234,57 | +1.903,32 |
| Receitas e Rend. Financeiros (direto) | 10.607,44 | 10.607,44 | 0,00 |
| **BLOCO RECEITA — MARÇO** | **1.140.504,89** | **877.949,88** | **−262.555,01 (−23,0%)** |

### Atribuição do delta — fecha AO CENTAVO

| Linha aberta (já declarada) | Contribuição |
|---|---:|
| Reembolso Fornecedor (eixo não exposto) | −170.763,04 |
| Reembolso Fornecedor - C via H2 (cobertura: vendas ≤ 2024 fora do universo) | −141.505,87 |
| Reembolso Cliente (cobertura ≤ 2024) | +29.402,04 |
| Operação própria (reconhecimento por pagamento) | +18.900,00 |
| Taxa de Serviço (composição, resíduo) | +9.200,72 |
| Comissão via H2 (bills não localizados no universo) | −5.000,00 |
| Reemb. Fornecedor (desc) | −4.692,18 |
| Reembolso / Carta de Crédito via H2 (idem) | +1.903,32 |
| Taxa RAV / Taxa CC RAV (par ±513,71) | 0,00 |
| **Soma das atribuições** | **−262.555,01** |
| **Resíduo NÃO-atribuído** | **0,00** |

**Resultado: PASSA COM GAP DECLARADO.** O delta é 100% atribuído às linhas já conhecidas como abertas — **não há dupla contagem nem supressão incompleta na montagem**. (Os quatro itens do critério do prompt somam −113.260,28; o restante são os gaps de COBERTURA do universo puxado — RF-C/Comissão/Carta de Crédito H2 e refunds de vendas ≤ 2024 —, que desaparecem com histórico completo, não com regra nova.)

### Junho (controle) — só a deriva do bloco da venda

Bloco obtido 859.194,24 × alvo 905.725,02 → **Δ −46.530,78 (−5,1%)**, integralmente explicado pelos deltas J1 de junho (Receitas +88.410,50, Descontos −134.941,28). Consistente; nada novo aparece na integração.

### Checagem de dupla contagem (obrigatória) — 0,00 nos dois

| Categoria suprimida | Consumo na montagem | Magnitude presente no payload (não consumida) |
|---|---:|---:|
| Entrada de clientes (pagamentos do cliente ≠ refund) | **0,00** (por construção) | 3.374.611,73 (mar) · 3.507.352,40 (jun) |
| Pagamento ao Fornecedor (vendor ≠ Reembolso, valores <0) | **0,00** (por construção) | −8.077.011,15 (mar) · −7.372.641,37 (jun) |

Corroboração independente: os pagamentos de cliente da API em março (3.374.611,73) ficam a −2,3% do `Entrada de clientes` dos lançamentos (3.453.065) — universos ligeiramente distintos, mesma grandeza.

**Risco novo, nomeado:** o reembolso de fornecedor pode aparecer **duas vezes** no payload da mesma venda — como documento vendor `Reembolso` E como bills `Reembolso Fornecedor - C`. Exemplo real: venda 59351 (fev/2025) tem bills RF-C de 132.365,53 + 167.741,31 + 24.812,13 e vendor `Reembolso` de +308.772,20. Na montagem atual não houve dupla contagem (eixos distintos jogaram cada lado em meses/anos diferentes), mas **a implementação precisa decidir qual lado consome quando o par cair no mesmo exercício**.

---

## 4. Veredito revisado da investigação-mãe

**PARCIAL** — mantido, agora com causa conhecida (total em março, parcial em junho):

- **Março integra ponta a ponta**: 5 linhas ao centavo + delta do bloco 100% atribuído + supressão verificada em 0,00.
- **Junho decompõe-se em dois componentes**: (a) **reconhecimento diferido por saldo em aberto** (`total_balance > 0`) — explica 90% do delta de Comissão, fecha Taxa DU e Taxa de Serviço; (b) **netting dos estornos de Bloqueio Hospedagem** — não reproduzível pelos campos expostos; fica declarado como gap (Desconto/Over/RAV/Op. própria dos meses vivos).
- A DEFASAGEM como explicação está **enterrada** (errata §1); o que era atribuído a ela é (a) + (b).

---

## 5. Especificação para a Onda 2 (fonte de receita)

O que J1+J2 sustentam como especificação do fato:

1. **Universo:** TODAS as vendas (sem as exclusões da ingestão — Welcome entra; venda sem item ativo entra); itens `active`+`canceled`, `deleted` fora. **Não reusar `monde.mv_vendas_diarias`** — fato próprio sobre o `raw` re-buscado (backfill do espelho é pré-requisito, §9.4 do relatório-mãe).
2. **Eixo por bloco:** linhas de item → **mês da venda** (`sale_date`); Reembolso Cliente → **`issue_date` do refund** (exige histórico completo de vendas — refunds moram na venda de origem); categorias via bills → **`due_date`**; Reembolso Fornecedor (bloco da venda) → mês da venda **como proxy declarado** (o eixo real não é exposto).
3. **As 3 categorias que exigem o filtro H2** (bills com `description` = nome da categoria): `Reembolso Fornecedor - C`, `Comissão`, `Reembolso / Carta de Crédito`. As demais linhas de lançamento reconciliam direto com o upload (P2).
4. **Gaps declarados (lista fechada):**
   - Reembolso Fornecedor (bloco da venda): eixo aproximado, ±170k/mês observado;
   - Operação própria: reconhecimento por pagamento — ou adota-se a régua do Janus (bruto por mês da venda, documentado), ou aplica-se `total_balance == 0` sabendo que não fecha todos os meses;
   - Taxa de Serviço: composição com resíduo 1–3%/mês;
   - Estornos de Bloqueio Hospedagem: netting do Monde não reproduzível (afeta Desconto/Over/RAV/Op. própria de meses com cancelamento grande);
   - Cobertura histórica: bills/refunds de vendas ≤ 2024 exigem o histórico completo na fonte.
5. **Regra anti-dupla-contagem:** nunca consumir `payments[].agency.*` (≠ refund) nem vendor ≠ `Reembolso` (o lado suprimido); decidir o lado consumidor do par vendor-`Reembolso` × bills `RF-C` quando coincidirem no exercício (exemplo: venda 59351).
6. **Paridade:** aferir contra export FRESCO do Monde (a deriva real é de horas), com a régua "meses assentados ao centavo; meses vivos com os gaps da lista acima".

---

*Delta fechado em 2026-07-28 · Welcome Group · Janus · investigação-mãe: `2026-07-27-dre-competencia-api-monde.md` (errata aplicada lá)*
