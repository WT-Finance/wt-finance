# Investigação — DRE por Competência via API do Monde

**VEREDITO: PARCIAL — as 12 linhas do bloco da venda têm campo correspondente na API (nenhuma "sem candidata"); 5 reproduzem AO CENTAVO no mês de prova assentado; as demais têm o VALOR exposto, faltando a regra fina de data/reconhecimento.**

Data: 2026-07-27 · somente leitura · antecede o briefing da DRE Gerencial (Onda 2, v5.3.0)

> **⚠️ ERRATA (delta de 2026-07-28, ver `2026-07-27-dre-competencia-api-monde-delta.md`):** a explicação
> original dos resíduos de abr–jul (§5.1, "DEFASAGEM export ~18/jul × API viva") foi **REFUTADA** — o export
> tem emissões até 27/07 e a DRE bate 0,00 contra os lançamentos nos 9 grupos de despesa de julho; o corte
> T≈18/07 achado pela grade coincide com o `synced_at` do espelho intermediário, não com a data do export.
> As passagens afetadas estão marcadas com **[ERRATA]** e a causa dos deltas de junho é objeto do delta (H3).

---

## 1. Resumo em 5 linhas

1. **Dá:** Comissão, Over, Desconto, Taxa DU e Taxa CC DU reproduzem **ao centavo** (delta 0,00) em março; Taxa RAV/CC RAV erram por um único par de ±513,71; Reembolso Cliente fecha **ao centavo em julho** e a 0,05–3,6% nos demais meses, com o mecanismo inteiro identificado (refunds por `issue_date`; o resíduo é vendas de origem ≤ 2024, fora do universo puxado).
2. **Dá com ressalva:** Taxa de Serviço é composta (`totals.agency_fee` + taxa avulsa de `others`) com resíduo de 1–3%/mês; Operação própria tem o valor exposto (`operations[].totals.amount`; fev e jul exatos) mas o reconhecimento segue o **pagamento**, regra não fechada; Reembolso Fornecedor tem os valores expostos (itens `Reembolso` do financeiro do fornecedor) mas o eixo real (data de criação do documento) **não é exposto** — o proxy mês-da-venda erra até ±170k/mês.
3. **[ERRATA — explicação refutada, ver delta]** ~~Os resíduos dos meses recentes seriam DEFASAGEM entre export de ~18/07 e API viva.~~ O export é de ≥27/07 (971 emissões entre 19–31/jul presentes; despesa de julho bate 0,00) — a janela de deriva é de horas, não de nove dias. A causa dos deltas de abr–jul é investigada no delta (hipótese H3, reconhecimento diferido).
4. **H2 confirmada:** a venda embute seu financeiro com o tipo de documento (`information`: "Fatura Fornecedor", "Pagamento Avulso", "Reembolso Fornecedor", "Sinal"…) e — chave de ouro — `financial.bills[]` traz o **nome da categoria** do lançamento avulso vinculado (`description: "Reembolso Fornecedor - C"`), com o `due_date` reproduzindo o mês da DRE ao centavo nos casos encontrados.
5. **O que fazer:** o caminho "duas fontes" (despesa pelos lançamentos + receita pela venda) é viável; a paridade com o Demonstrativo do Monde deve ser aferida contra export fresco — mesma técnica da virada v5.1.4. Duas exigências estruturais: re-sync do histórico do espelho (o ramo `financial`/`payments` só existe em vendas re-sincronizadas recentemente) e universo completo de vendas (refunds moram na venda de ORIGEM, anos atrás).

---

## 2. Método (escala e limites)

- Cliente reusado (`src/lib/monde/client.ts` — mesma base, `x-api-key`, paginação por `total`, `page_size` 200); scripts descartáveis no tmp do job (fora do repositório).
- **14.523 vendas detalhadas** puxadas (2026 jan–jul completos = 4.885; janela ago–dez/2026 = **0 vendas**; 2025 completo = 9.638), concorrência 8 (mesmo teto da ingestão), **0 falhas de detalhe**. Única instabilidade: TIMEOUT intermitente na LISTAGEM de meses de 2025 com timeout de 20s — resolvido com timeout de 120s e janelas mensais.
- Rate limit: não documentado; não observado até 8 chamadas concorrentes.
- Espelho local (`monde.venda.raw`, 28,2 mil vendas 2023→2026) usado para quantificar contribuições históricas — com a ressalva do §9.4.
- Nenhum POST/PUT/PATCH/DELETE; chave nunca logada; dados pessoais anonimizados no anexo.

---

## 3. Inventário do contrato

### 3.1 Recursos válidos (auto-documentados pelo erro 400)

```
sales, sale, people, tasks, task-historics, cities, kpis, airline-passengers, airline-kpis
```

### 3.2 Endpoints financeiros — sondados e INEXISTENTES (achado por ausência)

Todos retornaram `HTTP 400 — resource inválido`: `financial`, `transactions`, `entries`, `receivables`, `payables`, `accounts`, `categories`, `chart-of-accounts`, `ledger`, `bank-accounts`, `invoices` — e as variantes `category`, `financial-entries`, `financial_transactions`, `lancamentos`, `movements`, `movimentacoes`, `titulos`, `bills`, `payments`, `receipts`, `suppliers`, `persons`, `customers`, `sellers`, `users`, `discounts`.

**Consequência:** não há acesso a lançamentos avulsos SEM venda (a maior parte da despesa da DRE). O lado despesa continua vindo do upload de lançamentos (eixo emissão), como a Onda 2 já previa. **Nenhum achado extrapola o escopo do Fluxo de Caixa** — não existe endpoint que mate o upload da v5.2.0.

### 3.3 O payload da venda (o que importa para a DRE)

O detalhe (`resource=sale&id=`) devolve MUITO mais do que a ingestão v5.1.2 consome:

- **Arrays por tipo de produto** em `raw`: `hotels`, `others`, `airline_tickets`, `travel_packages`, `car_rentals`, `insurances`, `operations`, `cruises`, `train_tickets`, `cvc_packages`, `ground_transportations`. Cada item: `status` (active/canceled/deleted), `canceled_at`, **`issue_date`**, `commission_amount`, `over_amount`, `agency_service_fee`, `cc_rav_fee`, `deductions`, `discount_amount`, `intermediary_*`, e `totals.{amount, products, customer_amount, fees, agency_fee, rav_fee, discount, rav_fee_discount}`. Itens de aéreo têm ainda `du_fee`, `cc_du_fee`, `du_fee_discount`, `boarding_fee` (por passageiro e em `totals`).
- **Financeiro embutido**:
  - `raw.financial.vendor[]` — documentos do FORNECEDOR por venda: `value` (sinal), `payment_method` (`Faturar`, `Cartão de Crédito`, `Reembolso`, `Outros`, `Crédito no Fornecedor`), **`information`** (vocabulário de P5: `Fatura Fornecedor`, `Pagamento Avulso`, `Fatura Fornecedor Avulsa`, `Reembolso Fornecedor`, `Carta de Crédito`, `Sinal`, parcelamentos/cartões…), `due_date`, `settlement_date`, `document`, `product`.
  - `raw.financial.bills[]` — **lançamentos avulsos VINCULADOS à venda, com o NOME DA CATEGORIA em `description`** (ex.: `Reembolso Fornecedor - C`, `Prejuízos`, `Reembolso / Carta de Crédito`, `Pagamento ao Fornecedor - Operação propria`, `FamTour`…), `value`, `due_date`, `settlement_date`.
  - `raw.payments[].agency.<método>` — documentos do CLIENTE por método (`invoice`, `credit_card`, `bank_deposit`, `bank_slip`, `refund`, `cash`, `custom`), com `amount`, `due_date`, `settlement_date` e, no `refund`, **`issue_date`**.
- **`raw.commissions[]`** — comissões de VENDEDORES por venda (role, pessoa, valor, plano/meta na descrição) — despesa de comissionamento, não a receita "Comissão".
- **Datas disponíveis:** `sale_date`, `raw.registered_at`, `issue_date` por item, `arrival/departure_date`, `due_date`/`settlement_date` por documento, `canceled_at` por item.

Chaves monetárias completas: ver o anexo (§11) — JSON integral de uma venda.

### 3.4 Plano de categorias

**Não exposto** (nem `categories` nem endpoint equivalente). O atributo `Tipo` (Despesas/Receitas) e o cadastro completo (incl. as 15 categorias zeradas) não vêm da API — ver colaterais (§8).

---

## 4. De-para das 12 linhas (I1)

Nível: **item** = elemento dos arrays por tipo de produto; **doc** = documento financeiro embutido na venda. Recorte de status: itens `active`+`canceled` contam; `deleted` fica fora.

| Linha da DRE | Alvo ano (jan–jul) | Chave candidata na API | Nível | Confiança |
|---|---:|---|---|---|
| Comissão | 2.116.565,61 | `commission_amount` (todos os tipos) | item | **ALTA — exata em mês assentado** |
| Operação própria | 732.737,92 | `operations[].totals.amount` (reconhecimento segue o pagamento) | item | MÉDIA (valor exposto; regra fina aberta) |
| Over | 265.536,59 | `over_amount` | item | **ALTA — exata em mês assentado** |
| Reembolso Fornecedor | 3.957.333,91 | `financial.vendor[].items[]` c/ `payment_method='Reembolso'`, `value>0` | doc | MÉDIA (valor exposto; eixo real não exposto) |
| Taxa de Serviço | 2.252.450,52 | `totals.agency_fee` (hotels/others/aéreo) + `agency_service_fee` (others) | item | MÉDIA-ALTA (composta; resíduo 1–3%/mês) |
| Taxa DU | 144.041,12 | `airline_tickets[].totals.du_fee` | item | **ALTA — exata** |
| Taxa RAV | 711.528,73 | `totals.rav_fee` (todos os tipos) | item | **ALTA** (resíduo par ±513,71 em mar) |
| Desconto | −2.115.970,46 | `discount_amount` | item | **ALTA — exata em meses assentados** |
| Reembolso Cliente | −2.319.082,72 | `payments[].agency.refund` por **`issue_date`** | doc | **ALTA** (mecanismo completo; exige histórico) |
| Reembolso Fornecedor (desc) | −32.339,10 | `financial.vendor[].items[]` c/ `payment_method='Reembolso'`, `value<0` | doc | MÉDIA (ordem de grandeza; meses não fecham) |
| Taxa CC DU | −1.851,04 | `airline_tickets[].cc_du_fee` | item | **ALTA — exata** |
| Taxa CC RAV | −15.241,40 | `cc_rav_fee` | item | **ALTA** (resíduos ≤ R$ 520/mês) |

**Nenhuma linha ficou "sem candidata".** A investigação anterior (v5.1.2) constatou que os *booleanos* `contrato`/`taxa_servico`/`operacao_propria` não são expostos — os **valores monetários**, sim (o palpite `agency_service_fee` ≈ Taxa de Serviço se confirmou como COMPONENTE; a linha é composta).

---

## 5. Prova numérica — março e junho/2026 (I2)

Recorte: itens `≠deleted`, mês da venda (`sale_date`), universo completo da API (sem as exclusões da ingestão). Delta = obtido − alvo.

### Março (mês assentado — a prova de campo)

| Linha | Alvo | Obtido | Delta | Delta % |
|---|---:|---:|---:|---:|
| Comissão | 581.105,98 | 581.105,98 | **0,00** | 0,000% |
| Operação própria | 16.795,41 | 35.695,41 | +18.900,00 | +112,5% ¹ |
| Over | 62.514,70 | 62.514,70 | **0,00** | 0,000% |
| Reembolso Fornecedor | 363.491,30 | 192.728,26 | −170.763,04 | −47,0% ² |
| Taxa de Serviço | 396.810,32 | 407.546,37 | +10.736,05 | +2,7% ³ |
| Taxa DU | 26.221,80 | 26.221,80 | **0,00** | 0,000% |
| Taxa RAV | 135.241,42 | 135.755,13 | +513,71 | +0,38% ⁴ |
| Desconto | −118.171,36 | −118.171,36 | **0,00** | 0,000% |
| Reembolso Cliente | −812.160,91 | −782.758,87 | +29.402,04 | −3,6% ⁵ |
| Reemb. Fornecedor (desc) | −1.396,48 | −7.232,57 | −5.836,09 | — |
| Taxa CC DU | −287,11 | −287,11 | **0,00** | 0,000% |
| Taxa CC RAV | −2.838,56 | −3.352,27 | −513,71 | +18,1% ⁴ |

¹ A diferença é UM item (18.900,00, "G - LMHI Mexico - OUT26", evento futuro/não liquidado) — ver §5.3.
² O eixo real do documento não é exposto; por mês-da-venda parte de março "vaza" — ver §6.
³ Melhor composição encontrada (`t_agency` hotels/others/aéreo + `service` de others); resíduo sistemático 1–3%.
⁴ Mesmo valor com sinais opostos nas duas linhas: um único item com RAV integralmente consumido pela taxa de cartão (neutro na receita) classificado diferente pela DRE.
⁵ Refunds por `issue_date` no universo completo puxado (2025-01→2026-07). Em **julho/2026 o delta é 0,00** — quando o universo cobre as vendas de origem, a linha fecha ao centavo. Ver §5.4.

### Junho (mês vivo — deltas SEM causa identificada nesta investigação; ver delta/H3)

| Linha | Alvo | Obtido | Delta | Delta % |
|---|---:|---:|---:|---:|
| Comissão | 327.340,46 | 385.836,76 | +58.496,30 | +17,9% |
| Operação própria | 60.154,73 | 120.543,89 | +60.389,16 | +100,4% |
| Over | 33.579,45 | 42.859,20 | +9.279,75 | +27,6% |
| Reembolso Fornecedor | 1.228.233,08 | 1.149.745,61 | −78.487,47 | −6,4% |
| Taxa de Serviço | 405.033,30 | 409.540,65 | +4.507,35 | +1,1% |
| Taxa DU | 16.339,79 | 16.499,79 | +160,00 | +1,0% |
| Taxa RAV | 94.956,43 | 108.734,05 | +13.777,62 | +14,5% |
| Desconto | −963.790,70 | −1.102.653,38 | −138.862,68 | +14,4% |
| Reembolso Cliente | −352.230,13 | −347.891,69 | +4.338,44 | −1,2% |
| Reemb. Fornecedor (desc) | 0,00 | −584,86 | −584,86 | — |
| Taxa CC DU | −103,44 | −103,44 | **0,00** | 0,000% |
| Taxa CC RAV | −2.320,12 | −2.737,16 | −417,04 | +18,0% |

### 5.1 Por que os meses recentes divergem — e por que isso NÃO é campo faltando

**[ERRATA — esta seção foi REFUTADA pelo delta de 2026-07-28; mantida para registro.]** A explicação original era: o gabarito seria uma **foto** de ~18/07 (a busca em grade por um corte T convergiu para 2026-07-18/19) e os excedentes dos meses vivos seriam re-edição posterior ao export. **Está errado em três pontos:** (1) o export tem 971 emissões entre 19–31/jul e liquidações até 27/07 — é de ≥27/07; (2) a DRE bate 0,00 contra os lançamentos nos 9 grupos de despesa de julho, incluindo os −388.993,84 dos lançamentos tardios — se fosse foto de 18/jul, faltariam; (3) o T≈18/07 coincide com o **`synced_at` do espelho intermediário** (visível no anexo: `2026-07-18T01:10:36`) — a grade encontrou a data de sincronização da fonte, não a do export. A citação "±848k, P3" também era indevida: aquele número é o delta entre bloco bruto e bloco decomposto **dentro do mesmo export**, não export × API. A causa real dos deltas de junho é objeto do delta (H3 — reconhecimento diferido).

Confirmação lateral: a janela ago–dez/2026 tem **0 vendas** na API, e o gabarito mostra ~zeros em ago–dez — consistente com emissão ≤ hoje.

### 5.2 Com × sem as exclusões da ingestão

Rodado nos DOIS universos: as somas acima usam o universo COMPLETO (sem excluir Welcome/sem-setor/sem-item-ativo). Os casamentos exatos de março só acontecem no universo completo com o recorte `active+canceled` (`deleted` fora) — ou seja, **a DRE do Monde inclui vendas/itens que a Performance do Janus exclui** (itens cancelados contam nas linhas de receita bruta; o universo não tira Welcome). Achado de primeira ordem para a implementação: **a fonte da DRE não pode reusar `monde.mv_vendas_diarias`** (que é active-only e sem Welcome); precisa de fato próprio sobre o `raw`.

### 5.3 Operação própria — reconhecimento segue o pagamento

- Fevereiro: **exato** (480.832,82 = soma bruta dos itens `operations`, incluindo cancelados).
- Julho: **exato** (18.180,00) somente ao excluir a venda com `total_balance > 0` (item de 900.000 não liquidado, evento AUG26).
- Janeiro: o excedente (+55.374,54) é EXATAMENTE a soma de dois itens identificáveis — mesmíssimo produto de itens vizinhos que contam.
- Conclusão: o valor vive em `operations[].totals.amount`; o Monde reconhece a linha **quando o pagamento acontece** (saldo/liquidação), regra que os campos expostos aproximam mas não fecham ao centavo (pagamentos são da venda, não do item; liquidações parciais ambíguas).

### 5.4 Reembolso Cliente — mecanismo completo, exigência de histórico

`payments[].agency.refund` por **`issue_date`** do refund. O refund mora na **venda de origem** — que pode ser de anos atrás: no universo 2025-01→2026-07 puxado (14.523 vendas), os deltas mensais ficam entre **0,00 (julho, exato)** e 3,6% (março); o residual é refunds de vendas ≤ 2024, fora do pull. Julho exato prova o mecanismo: com o universo de origem coberto, a linha fecha ao centavo. Implicação: a fonte da DRE precisa do histórico de vendas completo (ou de re-sync retroativo — §9.4).

---

## 6. Eixo de data (I2.4)

| Bloco | Eixo que reproduz o corte mensal | Evidência |
|---|---|---|
| Linhas de produto (Comissão, Over, Taxas, Desconto, Op. própria) | **Mês da venda** (`sale_date`), indistinguível de `issue_date` do item na prática (coincidem em ~ tudo); `registered_at` equivalente | Zeros ao centavo em meses assentados |
| Reembolso Cliente | **`issue_date` do refund** (não o da venda; não due/settlement) | §5.4 |
| Reembolso Fornecedor (rec) | **NENHUM campo exposto reproduz.** O reconhecimento acompanha ≈ o mês da venda (melhor proxy), mas com trocas de ±170k entre meses vizinhos; `due_date`/`settlement_date` provadamente NÃO são (documentos de junho com due 2027-03 são reconhecidos pela DRE em jun/2026). A data de CRIAÇÃO do documento não é exposta | Séries testadas nos 4 eixos |
| Bills (lançamentos vinculados) | **`due_date`** | §7 — casos batem mês e valor ao centavo |

---

## 7. H2 — o filtro (I4)

**Existe e está exposto, com uma lacuna.**

1. **Tipo de documento por lançamento:** SIM — `information`/`payment_method` (fornecedor), `method` (cliente), `description` = **nome da categoria** (bills). O vocabulário observado bate com P5.
2. **Vínculo venda ↔ lançamento:** SIM, no sentido venda → documentos (embutidos no payload). **NÃO existe** o caminho inverso nem lançamentos avulsos sem venda (sem endpoint financeiro).
3. **Teste discriminante das 6 linhas de `Reembolso Fornecedor - C`** (alvo: fev 35.375,78 · mar 466.424,84 · abr 18.237,55 · mai 15.428,23 = 535.466,40): no universo puxado (2025-01→2026-07), os bills dessa categoria com `due_date` em 2026 são
   - 132.365,53 + 167.741,31 + 24.812,13 (três bills, `due_date` 2026-03-13, mesma venda de fev/2025) → **março**, cobrindo 324.918,97 dos 466.424,84 ✓
   - 18.237,55 · `due_date` 2026-04 → **abril, ao centavo** ✓
   - 15.428,23 · `due_date` 2026-05 → **maio, ao centavo** ✓
   - (+3 bills de 2025, due 2025, fora do gabarito 2026)
   **A evidência que sustenta o critério** *(corrigido no delta — a formulação original "localizados + não-localizados = alvo" era tautológica)*: **todo documento encontrado caiu no mês certo com o valor certo** — 18.237,55 em abril e 15.428,23 em maio AO CENTAVO, e os três bills de março no mês certo. Os documentos não-localizados (fev e resíduo de mar, 176.881,65) têm vendas de origem ≤ 2024, fora do universo puxado — hipótese de cobertura, não prova.
4. O par observado em bills — `+18.237,55 "Reembolso Fornecedor - C"` / `−18.237,55 "Pagamento ao Fornecedor - Operação propria"` — mostra o financeiro avulso da operação própria transitando DENTRO da venda, coerente com a supressão dos grupos `Entrada de clientes`/`Pagamento ao Fornecedor` na DRE (a receita já reconhecida pela venda).

---

## 8. Colaterais (I5)

1. **Mapa `grupo → tipo` (16 linhas):** NÃO vem da API. Vira de-para curado no Janus (§6 do prompt já o dá pronto). Trivial, mas decidido: curadoria própria.
2. **15 categorias zeradas / layout estável:** a API não expõe o cadastro de categorias — só o que tem movimento (via bills). O layout estável mês a mês vem do struct próprio da Onda 2 (159 linhas vivas), não da API. Sem impacto.
3. **Nome de categoria NÃO é chave:** confirmado e AMPLIADO — as 12 linhas do bloco da venda **não são categorias**: são CAMPOS fixos do payload (`commission_amount`, `du_fee`…). "Comissão" e "Reembolso Fornecedor" existem como categoria de lançamento E como campo da venda — entidades distintas com o mesmo rótulo. **Impacto direto em `dre_categoria_map`:** a premissa "nome é único" do struct da Onda 2 não vale nesta DRE; linhas do bloco da venda precisam de identidade própria (campo-fonte), qualificada por grupo.

---

## 9. Achados fora de escopo (em destaque)

1. **NÃO existe endpoint financeiro** (sondagem §3.2) — nada aqui mata o upload do Fluxo de Caixa (v5.2.0) nem reabre decisão tomada. O lado despesa da DRE segue vindo dos lançamentos.
2. **`people` existe na API** (64.522 registros; cadastral: nome, kind, cpf/cnpj, e-mail, telefone, cidade) — candidato natural a substituir o upload manual da Base de Pessoas (v4.29.0). Fora do escopo desta investigação; registrar na fila.
3. **`raw.commissions[]` traz o comissionamento por VENDEDOR por venda** (pessoa, papel, valor, plano e meta na descrição) — insumo direto para a capacidade planejada "Metas por Vendedor".
4. **O espelho `monde.venda.raw` está DEFASADO em estrutura:** só 527/28.250 vendas têm o ramo `financial` (e 1 tem `bills`) — o intermediário enriqueceu o payload depois da ingestão v5.1.2, e o sync incremental só re-busca vendas recentes. `payments` existe em ~99%. **Qualquer implementação da DRE viva exige backfill/re-sync do histórico** (e favorece ancorar a leitura no `raw` re-buscado, não no espelho atual).
5. Recursos `airline-passengers`/`airline-kpis`/`tasks`/`task-historics`/`cities` existem — sem uso para a DRE.

---

## 10. Contexto de decisão (os três caminhos, §9 do prompt)

O veredito PARCIAL cai no caminho do meio: **duas fontes com gap declarado** — despesa e resultado financeiro pelos lançamentos (eixo emissão, 100% reproduzível — P2), receita bruta pela venda com:

- 8 linhas sólidas (5 exatas + RAV/CC RAV/Reembolso Cliente com resíduos pequenos e explicados);
- 4 linhas com valor exposto e regra fina aberta (Taxa de Serviço ~1–3%; Operação própria/Reembolso Fornecedor/Reemb. Fornecedor-desc — reconhecimento/eixo);
- ganho que a DRE do Monde não dá: **drill-down até a venda** em toda linha do bloco;
- ressalva honesta: "bater ao centavo com o Monde" nas 4 linhas finas não é prometível hoje, e os deltas dos meses vivos ainda precisam de causa (ver delta/H3). A alternativa de exibi-las com a régua do Janus (definição própria e documentada sobre os mesmos campos) é decisão de produto do Yan.

Custos estruturais do caminho: fato próprio sobre o `raw` (a mv atual é active-only/sem-Welcome — §5.2), backfill do histórico (§9.4) e universo completo de vendas para refunds (§5.4).

---

## 11. Anexo — JSON integral de uma venda (anonimizado)

Venda de março/2026, 2 produtos (`others`), fornecedor faturado, pagamento por fatura da agência. Nomes de pessoas/pagador, documentos, contatos e endereços anonimizados; estrutura e valores intactos.

```json
{
  "resource": "sale",
  "data": {
    "id": "05e5c45c-28fc-46d5-a6ca-2b7c5ce656d2",
    "org_id": "a0000000-0000-0000-0000-000000000001",
    "sale_id": "14e9bbb2-5117-4789-9e25-b46902f8a568",
    "sale_number": "70494",
    "sale_date": "2026-03-31",
    "status": "closed",
    "period_start": "2026-03-20",
    "period_end": "2026-03-21",
    "company_identifier": "07454238000136",
    "travel_agent_name": "PESSOA_1",
    "travel_agent_cpf": "***",
    "payer_name": "PESSOA_2",
    "payer_cpf_cnpj": "***",
    "payer_email": "***",
    "payer_mobile": null,
    "observations": null,
    "operation_id": null,
    "custom_fields": [
      {
        "name": "PESSOA_3",
        "value": "Corporativo"
      }
    ],
    "total_products": 266.78,
    "total_taxes": 40,
    "total_discount": 0,
    "total_revenue": 40,
    "total_payments": 346.78,
    "total_balance": 0,
    "total_final_value": 346.78,
    "product_count": 2,
    "passenger_count": 2,
    "raw": {
      "payer": {
        "name": "PESSOA_2",
        "email": "***",
        "rg_ie": "***",
        "gender": null,
        "address": {
          "street": "***",
          "city_ibge": "4106902",
          "city_name": "Curitiba",
          "state_code": "PR",
          "postal_code": "***",
          "country_code": "BR",
          "neighborhood": "***",
          "street_number": "***",
          "additional_info": null
        },
        "cpf_cnpj": "***",
        "birthdate": null,
        "foreigner": false,
        "legal_name": "PESSOA_2",
        "external_id": null,
        "person_kind": "company",
        "phone_number": "***",
        "mobile_number": null,
        "passport_number": null,
        "passport_expiration_date": null,
        "foreign_identity_document": null
      },
      "hotels": [],
      "others": [
        {
          "over": 100,
          "status": "active",
          "totals": {
            "fees": 20,
            "amount": 257.01,
            "rav_fee": 0,
            "discount": 0,
            "products": 217.01,
            "agency_fee": 20,
            "customer_amount": 237.01,
            "rav_fee_discount": 0
          },
          "currency": "BRL",
          "document": "010046312291",
          "quantity": null,
          "supplier": {
            "ie": null,
            "cnpj": null,
            "name": "PRINCESA DOS CAMPOS",
            "email": null,
            "address": {
              "street": "***",
              "city_ibge": "4106902",
              "city_name": "Curitiba",
              "state_code": "PR",
              "postal_code": "***",
              "country_code": "BR",
              "neighborhood": "***",
              "street_number": null,
              "additional_info": null
            },
            "foreigner": false,
            "legal_name": "PRINCESA DOS CAMPOS",
            "external_id": null,
            "phone_number": null,
            "mobile_number": null,
            "foreign_identity_document": null
          },
          "unit_fee": null,
          "cc_rav_fee": 0,
          "deductions": 0,
          "issue_date": "2026-03-31",
          "passengers": [
            {
              "fees": 20,
              "amount": 217.01,
              "person": {
                "rg": "***",
                "cpf": "***",
                "name": "PESSOA_4",
                "email": null,
                "gender": "male",
                "address": {
                  "street": null,
                  "city_ibge": null,
                  "city_name": null,
                  "state_code": null,
                  "postal_code": null,
                  "country_code": null,
                  "neighborhood": null,
                  "street_number": null,
                  "additional_info": null
                },
                "birthdate": "19XX-XX-XX",
                "foreigner": false,
                "external_id": null,
                "phone_number": null,
                "mobile_number": null,
                "passport_number": null,
                "passport_expiration_date": null,
                "foreign_identity_document": null
              },
              "rav_fee": 0,
              "agency_fee": 20,
              "other_fees": 0,
              "canceled_at": null,
              "cost_center": null,
              "total_amount": 257.01,
              "customer_amount": 237.01,
              "rav_fee_discount": 0
            }
          ],
          "unit_price": null,
          "canceled_at": null,
          "destination": null,
          "external_id": null,
          "over_amount": 0,
          "arrival_date": "2026-03-21T05:40:00",
          "observations": null,
          "product_name": "Transporte Rodoviario ",
          "exchange_rate": 1,
          "departure_date": "2026-03-20T21:50:00",
          "representative": {
            "ie": null,
            "cnpj": "***",
            "name": "Quero passagem",
            "email": null,
            "address": {
              "street": null,
              "city_ibge": null,
              "city_name": null,
              "state_code": null,
              "postal_code": null,
              "country_code": null,
              "neighborhood": null,
              "street_number": null,
              "additional_info": null
            },
            "foreigner": false,
            "legal_name": "QUERO PASSAGEM VIAGENS E TURISMO LTDA",
            "external_id": null,
            "phone_number": null,
            "mobile_number": null,
            "foreign_identity_document": null
          },
          "discount_amount": 0,
          "over_percentage": 0,
          "agency_card_rate": 0,
          "commission_amount": 0,
          "included_services": "Trecho: \r\nSão Jorge D'Oeste, PR→Curitiba, PR - Rodoviária \r\nPartida:\r\n20/03/2026 21:50:00\r\nChegada:\r\n21/03/2026 05:40:00\r\nSeguro:\r\nNão contratado\r\nClasse:\r\nCONVENCIONAL \r\nPoltrona: ** \r\nLocalizador:\r\n010046312291 \r\n",
          "intermediary_over": 100,
          "agency_service_fee": 0,
          "commission_percentage": 0,
          "vendor_reservation_url": null,
          "product_with_passengers": true,
          "intermediary_over_amount": 0,
          "intermediary_over_percentage": 0,
          "intermediary_commission_amount": 0,
          "intermediary_commission_percentage": 0
        },
        {
          "over": 100,
          "status": "active",
          "totals": {
            "fees": 20,
            "amount": 89.77,
            "rav_fee": 0,
            "discount": 0,
            "products": 49.77,
            "agency_fee": 20,
            "customer_amount": 69.77,
            "rav_fee_discount": 0
          },
          "currency": "BRL",
          "document": "010012844560",
          "quantity": null,
          "supplier": {
            "ie": null,
            "cnpj": null,
            "name": "Graciosa",
            "email": null,
            "address": {
              "street": null,
              "city_ibge": null,
              "city_name": null,
              "state_code": null,
              "postal_code": null,
              "country_code": null,
              "neighborhood": null,
              "street_number": null,
              "additional_info": null
            },
            "foreigner": false,
            "legal_name": "Graciosa",
            "external_id": null,
            "phone_number": null,
            "mobile_number": null,
            "foreign_identity_document": null
          },
          "unit_fee": null,
          "cc_rav_fee": 0,
          "deductions": 0,
          "issue_date": "2026-03-31",
          "passengers": [
            {
              "fees": 20,
              "amount": 49.77,
              "person": {
                "rg": "***",
                "cpf": "***",
                "name": "PESSOA_4",
                "email": null,
                "gender": "male",
                "address": {
                  "street": null,
                  "city_ibge": null,
                  "city_name": null,
                  "state_code": null,
                  "postal_code": null,
                  "country_code": null,
                  "neighborhood": null,
                  "street_number": null,
                  "additional_info": null
                },
                "birthdate": "19XX-XX-XX",
                "foreigner": false,
                "external_id": null,
                "phone_number": null,
                "mobile_number": null,
                "passport_number": null,
                "passport_expiration_date": null,
                "foreign_identity_document": null
              },
              "rav_fee": 0,
              "agency_fee": 20,
              "other_fees": 0,
              "canceled_at": null,
              "cost_center": null,
              "total_amount": 89.77,
              "customer_amount": 69.77,
              "rav_fee_discount": 0
            }
          ],
          "unit_price": null,
          "canceled_at": null,
          "destination": null,
          "external_id": null,
          "over_amount": 0,
          "arrival_date": "2026-03-21T10:50:00",
          "observations": null,
          "product_name": "Transporte Rodoviario ",
          "exchange_rate": 1,
          "departure_date": "2026-03-21T09:20:00",
          "representative": {
            "ie": null,
            "cnpj": "***",
            "name": "Quero passagem",
            "email": null,
            "address": {
              "street": null,
              "city_ibge": null,
              "city_name": null,
              "state_code": null,
              "postal_code": null,
              "country_code": null,
              "neighborhood": null,
              "street_number": null,
              "additional_info": null
            },
            "foreigner": false,
            "legal_name": "QUERO PASSAGEM VIAGENS E TURISMO LTDA",
            "external_id": null,
            "phone_number": null,
            "mobile_number": null,
            "foreign_identity_document": null
          },
          "discount_amount": 0,
          "over_percentage": 0,
          "agency_card_rate": 0,
          "commission_amount": 0,
          "included_services": "Trecho: \r\nCuritiba, PR - Rodoviária→Paranaguá, PR - Rodoviária \r\nPartida:\r\n21/03/2026 09:20:00\r\nChegada:\r\n21/03/2026 10:50:00\r\nSeguro:\r\nNão contratado\r\nClasse:\r\nCONVENCIONAL \r\nPoltrona: ** \r\nLocalizador:\r\n010012844560 \r\n",
          "intermediary_over": 100,
          "agency_service_fee": 0,
          "commission_percentage": 0,
          "vendor_reservation_url": null,
          "product_with_passengers": true,
          "intermediary_over_amount": 0,
          "intermediary_over_percentage": 0,
          "intermediary_commission_amount": 0,
          "intermediary_commission_percentage": 0
        }
      ],
      "status": "closed",
      "totals": {
        "fees": 40,
        "balance": 0,
        "revenue": 40,
        "discount": 0,
        "payments": 346.78,
        "products": 266.78,
        "final_value": 346.78
      },
      "cruises": [],
      "sale_id": "14e9bbb2-5117-4789-9e25-b46902f8a568",
      "approver": null,
      "payments": [
        {
          "agency": {
            "invoice": {
              "amount": 346.78,
              "due_date": "2026-05-30",
              "cost_center": null,
              "settlement_date": "2026-04-17"
            }
          }
        }
      ],
      "promoter": null,
      "financial": {
        "bills": [],
        "vendor": [
          {
            "items": [
              {
                "value": -237.01,
                "product": "Transporte Rodoviario ",
                "document": "010046312291",
                "due_date": "2026-04-15",
                "description": null,
                "information": "Fatura Fornecedor",
                "payment_method": "Faturar",
                "settlement_date": "2026-04-15"
              },
              {
                "value": -69.77,
                "product": "Transporte Rodoviario ",
                "document": "010012844560",
                "due_date": "2026-04-15",
                "description": null,
                "information": "Fatura Fornecedor",
                "payment_method": "Faturar",
                "settlement_date": "2026-04-15"
              }
            ],
            "total": -306.78,
            "person": {
              "id": "6d858f33-7a1c-4b41-a865-80d368453a2e",
              "name": "PESSOA_5"
            }
          }
        ],
        "observations": null
      },
      "operation": null,
      "requester": null,
      "sale_date": "2026-03-31",
      "insurances": [],
      "operations": [],
      "period_end": "2026-03-21",
      "attachments": [],
      "car_rentals": [],
      "commissions": [
        {
          "role": "Vendedor",
          "value": 2,
          "person": {
            "id": "7fed4709-84bf-4125-9c2c-a2ead9b099d4",
            "name": "PESSOA_1"
          },
          "leftover": 2,
          "description": "Plano: Corporativo 10%, meta do mês: R$ 0,00, meta atingida: 0% (R$ 78378,75), cálculo: 10% sobre Receitas (R$ 20,00).",
          "retained_value": 0
        },
        {
          "role": "Vendedor",
          "value": 2,
          "person": {
            "id": "7fed4709-84bf-4125-9c2c-a2ead9b099d4",
            "name": "PESSOA_1"
          },
          "leftover": 2,
          "description": "Plano: Corporativo 10%, meta do mês: R$ 0,00, meta atingida: 0% (R$ 78378,75), cálculo: 10% sobre Receitas (R$ 20,00).",
          "retained_value": 0
        },
        {
          "role": "Coordenadora Corporativo",
          "value": 2,
          "person": {
            "id": "f1b5da8c-e110-42da-b9fb-b5ca522552f3",
            "name": "PESSOA_6"
          },
          "leftover": 2,
          "description": "Plano: Corporativo Coord  Renata, meta do mês: R$ 0,00, meta atingida: 0% (R$ 186794,88), cálculo: 10% sobre Receitas (R$ 20,00).",
          "retained_value": 0
        },
        {
          "role": "Coordenadora Corporativo",
          "value": 2,
          "person": {
            "id": "f1b5da8c-e110-42da-b9fb-b5ca522552f3",
            "name": "PESSOA_6"
          },
          "leftover": 2,
          "description": "Plano: Corporativo Coord  Renata, meta do mês: R$ 0,00, meta atingida: 0% (R$ 186794,88), cálculo: 10% sobre Receitas (R$ 20,00).",
          "retained_value": 0
        }
      ],
      "sale_number": 70494,
      "cvc_packages": [],
      "intermediary": null,
      "observations": null,
      "period_start": "2026-03-20",
      "travel_agent": {
        "cpf": "***",
        "name": "PESSOA_1",
        "external_id": null
      },
      "custom_fields": [
        {
          "name": "PESSOA_3",
          "value": "Corporativo"
        }
      ],
      "registered_at": "2026-03-31T21:21:53",
      "registered_by": {
        "id": "7fed4709-84bf-4125-9c2c-a2ead9b099d4",
        "name": "PESSOA_1"
      },
      "train_tickets": [],
      "airline_tickets": [],
      "printed_receipt": false,
      "travel_packages": [],
      "company_identifier": "07454238000136",
      "ground_transportations": []
    },
    "raw_hash": "6d64c543",
    "synced_at": "2026-07-18T01:10:36.668581+00:00",
    "created_at": "2026-07-01T19:39:53.580123+00:00",
    "products": [
      {
        "id": "617bf195-87a1-4061-8b83-b02ee232f76d",
        "org_id": "a0000000-0000-0000-0000-000000000001",
        "monde_sale_ref": "05e5c45c-28fc-46d5-a6ca-2b7c5ce656d2",
        "sale_id": "14e9bbb2-5117-4789-9e25-b46902f8a568",
        "sale_number": "70494",
        "product_kind": "others",
        "external_id": null,
        "description": "Transporte Rodoviario ",
        "supplier_name": "PRINCESA DOS CAMPOS",
        "supplier_cnpj": null,
        "representative_name": "Quero passagem",
        "booking_number": null,
        "destination": null,
        "data_inicio": "2026-03-20",
        "data_fim": "2026-03-21",
        "status": "active",
        "canceled_at": null,
        "currency": "BRL",
        "total_amount": 257.01,
        "commission_amount": 0,
        "commission_percentage": 0,
        "over_amount": 0,
        "over_percentage": 0,
        "agency_service_fee": 0,
        "cc_rav_fee": 0,
        "deductions": 0,
        "discount_amount": 0,
        "intermediary_commission_amount": 0,
        "synced_at": "2026-07-18T01:10:36.668581+00:00",
        "passengers": [
          {
            "id": "4a8d8131-1821-4d6e-8b8e-740f0fb8f54b",
            "org_id": "a0000000-0000-0000-0000-000000000001",
            "product_ref": "617bf195-87a1-4061-8b83-b02ee232f76d",
            "sale_id": "14e9bbb2-5117-4789-9e25-b46902f8a568",
            "sale_number": "70494",
            "person_name": "PESSOA_4",
            "person_cpf": "***",
            "amount": 217.01,
            "agency_fee": 20,
            "fees": 20,
            "synced_at": "2026-07-18T01:10:36.668581+00:00"
          }
        ]
      },
      {
        "id": "3905e913-39bd-4f64-b6e1-c08f4e7cde51",
        "org_id": "a0000000-0000-0000-0000-000000000001",
        "monde_sale_ref": "05e5c45c-28fc-46d5-a6ca-2b7c5ce656d2",
        "sale_id": "14e9bbb2-5117-4789-9e25-b46902f8a568",
        "sale_number": "70494",
        "product_kind": "others",
        "external_id": null,
        "description": "Transporte Rodoviario ",
        "supplier_name": "Graciosa",
        "supplier_cnpj": null,
        "representative_name": "Quero passagem",
        "booking_number": null,
        "destination": null,
        "data_inicio": "2026-03-21",
        "data_fim": "2026-03-21",
        "status": "active",
        "canceled_at": null,
        "currency": "BRL",
        "total_amount": 89.77,
        "commission_amount": 0,
        "commission_percentage": 0,
        "over_amount": 0,
        "over_percentage": 0,
        "agency_service_fee": 0,
        "cc_rav_fee": 0,
        "deductions": 0,
        "discount_amount": 0,
        "intermediary_commission_amount": 0,
        "synced_at": "2026-07-18T01:10:36.668581+00:00",
        "passengers": [
          {
            "id": "44661e2f-7608-46cd-bc8a-705417339775",
            "org_id": "a0000000-0000-0000-0000-000000000001",
            "product_ref": "3905e913-39bd-4f64-b6e1-c08f4e7cde51",
            "sale_id": "14e9bbb2-5117-4789-9e25-b46902f8a568",
            "sale_number": "70494",
            "person_name": "PESSOA_4",
            "person_cpf": "***",
            "amount": 49.77,
            "agency_fee": 20,
            "fees": 20,
            "synced_at": "2026-07-18T01:10:36.668581+00:00"
          }
        ]
      }
    ],
    "payments": [
      {
        "id": "9b1fb8f8-839f-48e7-8007-24522c842e2d",
        "org_id": "a0000000-0000-0000-0000-000000000001",
        "monde_sale_ref": "05e5c45c-28fc-46d5-a6ca-2b7c5ce656d2",
        "sale_id": "14e9bbb2-5117-4789-9e25-b46902f8a568",
        "sale_number": "70494",
        "method": "invoice",
        "value": 346.78,
        "external_id": null,
        "ordinal": 0,
        "synced_at": "2026-07-18T01:10:36.668581+00:00",
        "due_date": "2026-05-30",
        "settlement_date": "2026-04-17",
        "payment_method_name": null,
        "card_brand": null,
        "card_last_digits": null
      }
    ]
  }
}
```
