# Investigação — Scope B: vendas item-level + Pessoas para a API do Monde

**VEREDITO: as 6 funções item-level SÃO repontáveis — a premissa do "subconjunto do Excel" está REFUTADA (o subset é o filtro `status='active'`, e o espelho já o aplica: bate em 28.450/28.450 vendas, ao centavo). Duas exceções reais: `get_prejuizos` NÃO tem paridade (a receita por item do espelho é uma ALOCAÇÃO, não receita nativa — perda dentro de venda lucrativa desaparece) e `get_pipeline_weddings` precisa de um de-para `operation_id → nome` que a API só cobre em 17%. Pessoas NÃO pode trocar de fonte: o recurso `people` expõe 5 dos 17 campos e nenhum campo de endereço/fiscal. E, fora do escopo, a investigação encontrou uma LACUNA VIVA no espelho — 42 vendas, R$ 392.070,01 de faturamento — causada pela janela do incremental.**

Data: 2026-08-04 · **somente leitura** (nenhum arquivo do app alterado, nenhuma migration, nenhuma escrita no banco) · antecede o briefing das ondas do Scope B

---

## 1. Resumo em 8 linhas

1. **A regra do subset existe e já está implementada:** o `raw` guarda os produtos em **11 buckets por tipo** e inclui os `deleted`/`canceled`; o Excel e o espelho carregam os **`active`**. A venda 63165 do briefing tem 7 produtos no raw = **4 `active` + 3 `deleted`**; os 4 estão nas duas bases. Em escala: espelho ≡ raw-`active` em **28.450/28.450 vendas (100%)**, R$ 191.915.217,15 nos dois lados. **O mix não muda por causa disso.**
2. **De-para de produto: resolvido por um `CASE` de 6 linhas.** 5 `product_kind` mapeiam 1:1 para a categoria do Excel; `others` e `operations` já trazem a categoria no campo `produto` (precisa `btrim` — a API manda `"Transporte Rodoviario "` com espaço). Zero produto órfão nos dois sentidos.
3. **Mix por produto: paridade forte.** Em 12 meses fechados o delta de **composição** é ≤ **0,05 p.p.** por produto. Já a **margem por produto** desvia até **3,5 p.p.** (e mais no mês isolado: Taxa de Serviço 48,1% → −2,0% em jun/26) — consequência da alocação de receita, não da base.
4. **CAGR:** faturamento 18,6% → **18,7%** (+0,1 p.p., irrelevante). Receita 24,6% → **20,0%** (**−4,6 p.p.**) — definicional, puxada por vendas cujo `total_revenue` da API é fortemente negativo.
5. **Os dois booleanos do ADR-0149 erram 100% dos positivos** (conjuntos disjuntos), **mas são reproduzíveis pelo PRODUTO** a 99,97%/99,99%: `contrato` = "a venda tem item `CONTRATO DE CASAMENTO%`", `taxa_servico` = "tem item `TAXA DE SERVIÇO`". A heurística é que estava errada, não o dado.
6. **`operacao_propria` é um HOMÔNIMO** — no upload é **TEXT** (o nome da operação, o vínculo do ERP); no espelho é **boolean** sintetizado de `raw.intermediary`. **Nenhuma das 6 funções usa o boolean.** O vínculo que Weddings precisa é **nativo** (`raw.operation_id`, 95,9% das vendas Weddings, 303 ids → 0 ambíguos) — mas o **nome** só vem da API em 17% dos ids.
7. **Pessoas: bloqueio duro.** O `people` expõe 10 campos (5 úteis) contra 17 da base; **faltam CEP, endereço, número, bairro, UF, razão social, inscrições e telefone** — exatamente o que boleto e NFS-e exigem. `city_name` vem **nulo em 100%** da amostra. E **não há filtro incremental** (`from`/`to`/`updated_since` são ignorados). Do lado bom: identidade casa (994/1000 por nome, 598/600 por documento) e a plataforma **não escreve** na base de Pessoas — não há merge a desenhar.
8. **Achado crítico, fora do escopo:** o incremental do espelho usa janela `hoje−2d..hoje` **filtrando por data da venda** — venda lançada com atraso nunca entra. **42 vendas ausentes do espelho (R$ 392.070,01 de faturamento, R$ 47.806,35 de receita)**, 37 de 38 comprovadamente registradas mais de 2 dias após a data da venda (mediana 4 dias, máximo 32). O espelho **já é a fonte de produção** de Metas e Performance.

---

## 2. Método e limites

- **Banco:** conexão direta via `SUPABASE_DB_URL` com `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` — trava mecânica, provada (`CREATE TABLE` aborta com "cannot execute CREATE TABLE in a read-only transaction"). Scripts efêmeros no tmp do job, fora do repositório.
- **API:** o cliente do projeto (`resource=…`, `x-api-key`, `page_size` 200). Só GET. Chave nunca impressa em log ou arquivo. Nomes/documentos mascarados nas amostras.
- **Universo medido:** 28.450 vendas-espelho e 28.463 vendas do upload (2023-01-02 → 2026-08-04), 47.043 × 47.103 itens, 48.711 produtos no `raw`; 64.104 pessoas na base × 64.706 na API (amostra de 1.000 em 5 páginas espalhadas).
- **Limites declarados:**
  - As RPCs com gate **não** puderam ser chamadas: `app.exigir_acesso` nega `postgres` (no Supabase `postgres` **não** é superusuário). Medi pelos `__nucleo` (mesmo corpo, sem gate) e por réplica em SQL — os números da §4.4/§4.5 vêm do corpo vivo.
  - Recursos `tasks`, `task-historics`, `cities`, `kpis`, `airline-*` não explorados (fora do escopo).
  - Meses "fechados" = jul/2025→jun/2026, salvo indicação. jul/2026 e ago/2026 aparecem só onde a comparação exige.
  - O `raw` guardado é a foto da última sincronização de cada venda, não a API de agora — a mesma ressalva das investigações anteriores.

---

## 3. Frente A — o que cada uma das 6 funções realmente precisa [LIDO]

Todas as 6 são wrappers do molde 0121 (`<fn>` público com `exigir_acesso` → `<fn>__nucleo` service-role-only). Nenhuma foi tocada pela virada 0181.

| # | Função | Corpo vivo | Lê hoje | Granularidade que exige | Gate de área |
|---|--------|-----------|---------|-------------------------|--------------|
| 1 | `get_mix_produto(from,to,setor,limite)` | 0014 | **numerador:** `fato_venda_item` + `dim_produto` + `dim_setor`→`dim_setor_macro`; **denominador:** `mv_vendas_diarias` | **item** (produto) | `app.areas_do_setor(p_setor)` |
| 2 | `get_cagr()` | 0014 | anos de `fato_venda`; valores de `mv_vendas_mensais` | **venda** (só o range de anos) | `['executiva','performance']` |
| 3 | `get_prejuizos(from,to,setor,summary)` | 0013 | `fato_venda_item` com `receitas < 0` + `dim_vendedor`/`dim_pagante`/`dim_produto` | **item** (sinal da receita por item) | `app.areas_do_setor(p_setor)` |
| 4 | `get_sumario_subsetor(from,to)` | 0099 | `fato_venda_item` + `dim_produto` + de-para `dim_produto_subsetor`; macro = Weddings | **item** (produto → subsetor) | `['performance/weddings']` |
| 5 | `get_weddings_historico_subsetor(from,to)` | 0097 | idem 4, agregado por mês | **item** | `['performance/weddings']` |
| 6 | `get_pipeline_weddings(horizonte)` | 0028 | `dim_operacao_weddings` (situação/data do evento/resultado de caixa) + `fato_lancamento_operacao.venda_n` → `fato_venda` → `fato_venda_item` | **venda** (soma todos os itens da venda) | `['performance/weddings']` |

### 3.1 Consumidores de tela

| Função | Onde aparece |
|--------|--------------|
| `get_mix_produto` | `performance-content.tsx` (card Mix de Produto), `performance/weddings/actions.ts` (mix com `p_setor:'Weddings'`), rota `api/dashboard/performance/mix-produto` |
| `get_cagr` | `performance-content.tsx` (KPI CAGR), rota `api/dashboard/performance/cagr` |
| `get_prejuizos` | `executiva/page.tsx` (KPI de prejuízo, atual **e** período anterior, `p_summary:true`), `performance-content.tsx` (lista detalhada), rota `api/dashboard/performance/prejuizos` |
| `get_sumario_subsetor` | `performance/weddings/actions.ts` (cards por subsetor, atual + YoY), `kpi-principal-drawer.tsx`, rota `api/dashboard/weddings/sumario-subsetor` e — **atenção** — `lib/metas/carregar-acompanhamento.ts` (card "Contratos" do Acompanhamento de Metas) |
| `get_weddings_historico_subsetor` | `kpi-principal-drawer.tsx` (dois gráficos stacked do drawer "Análise Histórica") |
| `get_pipeline_weddings` | rota `api/dashboard/weddings/pipeline` |

**O que quebra se o número mudar:** em Performance, o card de Mix mostra `pct_faturamento` **lado a lado** com o KPI de faturamento — que já vem do espelho. Em Metas, `n_contratos` do subsetor COMERCIAL aparece ao lado de KPIs do espelho (com *fail-safe* para `null` se a RPC negar). Em Weddings, os cards por subsetor e o total do card precisam somar entre si (o total é calculado na mesma RPC, então é internamente coerente).

### 3.2 Dependência de `contrato` / `taxa_servico` / `operacao_propria`

**Nenhuma das 6 usa nenhum dos três.** Verificado por leitura integral dos 6 corpos e por grep no corpus de migrations. Precisões que importam:

- `analytics.fato_venda` tem `contrato` e `taxa_servico` (boolean, 0003) — consumidos por `regenerar_dim_operacao_weddings` e pelos caminhos de hotel (0029/0042/0052), **não** pelas 6.
- **`analytics.fato_venda` NÃO tem `operacao_propria`.** A coluna existe em `raw.vendas_excel` (0107) e em `raw.contas_*` (0057) como **TEXT** — o nome da operação. Ver §5.1.
- `get_pipeline_weddings` depende de `operacao_propria` **indiretamente**: `dim_operacao_weddings` é regenerada usando `raw.vendas_excel.operacao_propria` como chave para achar a linha "Contrato de casamento" (de onde saem `data_evento`, `data_venda_contrato` e `hotel`).

### 3.3 Dependência de produto / fornecedor / passageiros

- **Produto:** 1, 3, 4, 5 (é o eixo). 4 e 5 dependem também do de-para `dim_produto_subsetor`.
- **Fornecedor:** nenhuma das 6 diretamente — mas `regenerar_dim_operacao_weddings` usa `raw.vendas_excel.fornecedor` como hotel da operação, e isso alimenta telas de Weddings.
- **Passageiros:** nenhuma das 6.
- `get_prejuizos` (modo detalhado) exige ainda **vendedor** e **pagante** — o espelho tem os dois (`monde.venda.vendedor`, `.pagante`).

---

## 4. Frente B — a paridade item-level e a pergunta central [LIDO]

### 4.1 A REGRA DO SUBSET — encontrada, provada, e já implementada

O `raw` de cada venda guarda os produtos em **11 arrays por tipo**, não num array `products`:

`airline_tickets`, `car_rentals`, `cruises`, `cvc_packages`, `ground_transportations`, `hotels`, `insurances`, `others`, `train_tickets`, `travel_packages`, **`operations`**.

(`operations` é o 11º e foi o que fechou a conta: seus 1.006 itens ativos explicam exatamente a diferença entre 47.043 itens no espelho e 46.037 contando só os 10 primeiros buckets.)

Cada produto tem `status`. Distribuição no universo inteiro:

| `status` no raw | itens | valor (`totals.amount`) |
|---|---|---|
| `active` | **47.043** | R$ 191.915.217,15 |
| `canceled` | 968 | — |
| `deleted` | 677 | — |
| `canceled` + `deleted` + (23 em `operations`) | **1.668** | **R$ 9.985.099,73** |
| total | 48.711 | R$ 201.900.316,88 |

**A venda 63165 do briefing:** 7 produtos no raw = 1 aéreo `active` + 6 hotéis, dos quais **3 `deleted`** e 3 `active`. Total 4 `active` — e o Excel tem 4, o espelho tem 4. Os "3 produtos que o Excel omite" são produtos **apagados no ERP**.

**Prova em escala** (28.450 vendas):

| Comparação | Resultado |
|---|---|
| espelho ≡ raw-`active` (contagem de itens por venda) | **28.450 / 28.450 (100%)** |
| espelho ≡ raw-`active` (valor) | R$ 191.915.217,15 = R$ 191.915.217,15 — **ao centavo** |
| Excel ≡ espelho (contagem de itens por venda) | 28.395 / 28.450 (**99,81%**) — 17 vendas com mais no Excel, 38 com menos |
| itens totais | Excel 47.033 · espelho 47.043 (**+10 líquido**) |
| valor total dos itens | Excel R$ 191.289.761,52 · espelho R$ 191.915.217,15 → **delta R$ 625.455,63 (0,33%)** |

**Conclusão: a regra é `status = 'active'`, é reproduzível, e o `transformSale` já a aplica** (`sale.products.filter(p => p.status === 'active')`) — assim como a `monde.mv_vendas_diarias` (`WHERE i.status='active'`, decisão registrada na 0179). Não há regra secreta de valor zero, `product_kind`, fornecedor ausente ou cortesia: testei e o discriminante é só o `status`.

**Peso do que fica de fora:** R$ 9.985.099,73 (5,2% do valor ativo) em 1.668 produtos apagados/cancelados, distribuídos em **1.097 vendas (3,9%)**. Esse valor **não entra em nenhuma das duas bases** — e é ele que produz o efeito colateral da §4.6.

### 4.2 O delta residual (0,33%) — de onde vem

Mês a mês, o **faturamento item-level é idêntico** (delta 0,00) em **28 dos 44 meses** (todos os 12 de 2023, 11 de 2024, 5 de 2025); nos outros fica abaixo de 1,5%. O delta concentra-se em:

- **42 vendas ausentes do espelho** (R$ 392.070,01) — ver §7, é defeito de ingestão, não de definição.
- **29 vendas ausentes do Excel** (R$ 677.234,76) — o Excel é exportação manual; a última carga de Vendas não as continha.
- As 55 vendas com contagem divergente de itens (±10 itens líquidos).

**Receita é outra história:** total Excel R$ 25.458.536,79 × espelho R$ 24.642.916,45 (**−R$ 815.620,34, −3,2%**), e o desvio é **concentrado**, não difuso:

| venda | data | receita Excel | receita espelho | delta |
|---|---|---|---|---|
| 61985 | 2025-05-02 | R$ 201,00 | **−R$ 624.711,04** | −R$ 624.912,04 |
| 73083 | 2026-07-20 | (ausente) | R$ 293.721,82 | +R$ 293.721,82 |
| 48522 | 2023-08-21 | R$ 0,00 | −R$ 157.235,84 | −R$ 157.235,84 |
| 52602 | 2024-03-22 | −R$ 193,19 | −R$ 119.770,71 | −R$ 119.577,52 |
| 52797 | 2024-04-02 | R$ 0,00 | −R$ 103.292,15 | −R$ 103.292,15 |

A 61985 sozinha explica o mês de mai/2025 inteiro (receita do espelho R$ 107.949,57 contra R$ 716.354,17 do Excel). Causa: ver §4.6.

### 4.3 De-para de produto — resolvido, com uma pegadinha

O Excel tem **115** produtos em `dim_produto` (categorias curadas + nomes de operações/grupos). O espelho tem **1.666** valores distintos em `produto` e **7** em `product_kind`. Parecia exigir tabela de tradução; **não exige**.

Cruzando item a item (28.421 vendas comuns, casando por venda + valor unitário único):

| `product_kind` | produto do Excel | itens casados |
|---|---|---|
| `airline_tickets` | Passagem Aérea | 13.739 |
| `hotels` | Diárias de Hospedagem | 12.215 |
| `car_rentals` | Aluguel de Carro | 1.502 |
| `insurances` | Seguro Viagem | 838 |
| `travel_packages` | Pacote Turístico | 482 |
| `others` | **18 categorias com ≥5 casos** (23 no espelho contando a cauda) | 9.419 (nesses 18 pares) |
| `operations` | **o nome da operação** (CLM/G/X…) | 1.006 itens no espelho |

**A pegadinha:** para `hotels` o campo `produto` do espelho é a **categoria do quarto** ("Single", "Duplo", "Duplo Casal") — inútil como produto. Mas para `others` e `operations` o `produto` **já é exatamente a categoria do Excel** (a Edge Function copia `product_name` para `description`): `"Transporte Rodoviario "`, `"Extras Casamento"`, `"Taxa de Serviço"`, `"Contrato de casamento"`, `"Cerimonial de Casamento"`, `"Atualização de Contrato de Casamento"`…

Logo o de-para é um `CASE` sem tabela nova:

```sql
case i.product_kind
  when 'airline_tickets' then 'Passagem Aérea'
  when 'car_rentals'     then 'Aluguel de Carro'
  when 'hotels'          then 'Diárias de Hospedagem'
  when 'insurances'      then 'Seguro Viagem'
  when 'travel_packages' then 'Pacote Turístico'
  else btrim(i.produto)   -- others / operations: a descrição JÁ é a categoria
end
```

⚠️ **`btrim` não é cosmético:** a API manda `"Transporte Rodoviario "` e `"Receptivo - Traslados e Passeios "` com espaço à direita; o Excel não. Sem `btrim`, dois produtos distintos no mix.

**Produto no espelho que a plataforma nunca viu:** nenhum relevante. O full join do mix (§4.4) não produziu uma única linha só de um lado. Os buckets `cruises`, `cvc_packages`, `ground_transportations` e `train_tickets` estão sempre vazios em produção (Cruzeiros e Passes de Trem vêm como `others`).

### 4.4 Mix por produto lado a lado

**jun/2026** (mês fechado, `p_setor='todos'`, `p_limite=10` desligado para ver tudo) — `get_mix_produto__nucleo` vivo contra o espelho com o `CASE`:

| produto | % Excel | % espelho | Δ p.p. | margem Excel | margem espelho |
|---|---|---|---|---|---|
| Diárias de Hospedagem | 38,83 | 38,55 | −0,28 | 16,67 | 16,33 |
| Passagem Aérea | 27,60 | 27,89 | +0,29 | 8,45 | 9,37 |
| Pacote de Casamento | 8,69 | 8,59 | −0,10 | 12,85 | 12,86 |
| Pacote Turístico | 8,22 | 8,43 | +0,20 | 19,32 | 18,47 |
| Receptivo - Traslados e Passeios | 4,62 | 4,57 | −0,05 | 20,07 | 17,78 |
| Evento Corporativo | 3,37 | 3,34 | −0,04 | 0,00 | 0,00 |
| Extras Casamento | 1,87 | 1,85 | −0,02 | 8,67 | 9,02 |
| Aluguel de Carro | 1,56 | 1,54 | −0,03 | 16,75 | 13,46 |
| … | | | | | |
| **Seguro Viagem** | 0,32 | 0,31 | 0,00 | **43,39** | **28,47** |
| **Taxa de Serviço** | 0,04 | 0,04 | 0,00 | **48,07** | **−2,03** |
| **Concierge** | 0,00 | 0,00 | 0,00 | **97,60** | **21,13** |

**12 meses fechados (jul/2025→jun/2026):** a composição praticamente colapsa — **delta máximo 0,05 p.p.** em qualquer produto. A margem por produto se comporta bem no topo (Diárias −0,5 p.p., Passagem +0,3 p.p., Extras Casamento −1,1 p.p., Pacote Turístico −1,3 p.p.) e mal na cauda (**Seguro Viagem −3,5 p.p.**, Contrato de casamento −2,5 p.p., uma operação de grupo corporativo **+7,1 p.p.**).

**Leitura:** o **mix** (o que o card mostra em destaque) é reproduzível. A **margem por produto** não é confiável no espelho — e a razão é a §4.6, não a base.

**Achado colateral, já vivo hoje:** o `get_mix_produto` calcula o numerador em `fato_venda_item` (upload) e o denominador em `mv_vendas_diarias` (upload) — internamente coerente (medi: `mv_vendas_mensais` bate ao centavo com a soma dos itens nos 3 anos). Mas o **KPI de faturamento na mesma tela já vem do espelho**. Em jun/2026: KPI R$ 6.838.656,04 × total do mix R$ 6.762.882,64 — **R$ 75.773,40 (1,12%) de diferença entre dois números vizinhos**. Isso não é risco futuro; é o estado atual.

### 4.5 CAGR

`get_cagr__nucleo()` vivo hoje: anos 2023→2025, faturamento R$ 42.642.971,36 → R$ 60.002.733,82 (**18,6%**), receita R$ 5.270.195,98 → R$ 8.178.368,96 (**24,6%**).

| ano | faturamento Excel | faturamento espelho | receita Excel | receita espelho |
|---|---|---|---|---|
| 2023 | 42.642.971,36 | 42.642.971,36 | 5.270.195,98 | 5.177.004,55 |
| 2024 | 48.628.185,57 | 48.628.799,78 | 6.509.682,44 | 6.244.604,33 |
| 2025 | 60.002.733,82 | 60.046.136,44 | 8.178.368,96 | 7.459.545,83 |

- **CAGR de faturamento: 18,6% → 18,7%** (+0,1 p.p.). Não é conversa.
- **CAGR de receita: 24,6% → 20,0%** (**−4,6 p.p.**). É conversa: 2025 perde 8,8% de receita no espelho (as vendas da §4.2 são de 2025) contra 1,8% em 2023, e o CAGR amplifica a assimetria.

O range de anos não muda (as duas bases cobrem 2023→2026), então `get_cagr` repontada continuaria comparando 2023→2025.

### 4.6 A pedra no sapato: a receita por item do espelho é uma ALOCAÇÃO

Isto não estava no briefing e é a descoberta que mais restringe o desenho.

O `transformSale` (ADR-0149) **não** lê receita por produto — ela não é reconstruível. Ele toma o `total_revenue` **da venda** e o **distribui** entre os itens ativos, proporcional ao valor, com o resto de arredondamento no último item. Isso faz a soma por venda bater ao centavo — e é ótimo para o agregado.

Mas produz três efeitos:

1. **A margem por produto dentro de uma venda é uniforme por construção.** Todo item da mesma venda recebe a mesma margem percentual. É isso que a cauda da §4.4 mostra: Taxa de Serviço tem 48% de margem real e aparece com −2% porque herdou a margem da venda em que estava.
2. **`total_revenue` é da venda INTEIRA — inclusive dos produtos apagados — mas é alocado só nos ativos.** É a causa das anomalias da §4.2. A venda 61985 tem `raw.totals.revenue = −624.711,04` sobre `products = 618.229,85`, mas só **1** item ativo de R$ 2.341,31 sobreviveu: os −624 mil inteiros caíram nesse único item. As 1.097 vendas com item não-ativo (R$ 1.179.266,58 de receita) estão todas expostas a esse deslocamento.
3. **O sinal da receita por item passa a ser o sinal da venda.** Prova: no período de 12 meses, o número de vendas com item de receita negativa no espelho é **89** — exatamente igual ao número de vendas com `total_revenue < 0`. Não é coincidência: alocação proporcional preserva sinal.

**Existe receita nativa por item na API?** Não. Testei 4 candidatos contra `total_revenue` por venda (8.493 vendas, 12 meses):

| candidato | vendas que batem ao centavo | soma |
|---|---|---|
| `commission + over + agency_service_fee + cc_rav_fee` | 2.275 / 8.493 (26,8%) | R$ 4.635.974,63 |
| idem − `intermediary_commission` | 2.275 / 8.493 (26,8%) | R$ 4.635.677,63 |
| `Σ passengers[].agency_fee` | 1.457 / 8.493 (17,2%) | R$ 3.228.247,24 |
| `totals.agency_fee` | 1.483 / 8.493 (17,5%) | R$ 3.365.262,87 |
| **`total_revenue` (referência)** | — | **R$ 8.409.136,32** |

O melhor candidato cobre **55% do valor**. Confirma o que o ADR-0149 já dizia; agora com o tamanho do buraco medido.

### 4.7 `get_prejuizos` — o único sem paridade

12 meses fechados:

| | Excel (hoje) | espelho | |
|---|---|---|---|
| itens com receita < 0 | 128 | 120 | |
| vendas atingidas | **103** | **89** | −13,6% |
| valor do prejuízo | **R$ 58.076,02** | **R$ 145.901,25** | **+151%** |

Erra nos dois sentidos e por motivos diferentes: **perde** o prejuízo de um produto dentro de venda lucrativa (invisível pela alocação) e **infla** o valor quando a venda tem `total_revenue` negativo por causa dos produtos apagados. Não é calibrável — é a definição que muda.

### 4.8 Uma boa notícia estrutural

O comentário da 0003 avisa que o setor mora no **item** porque "uma mesma venda pode ter itens de setores diferentes". O espelho guarda `setor_macro` na **venda**. Medi: **0 de 28.463 vendas** têm itens em mais de um setor macro. A simplificação do espelho é, na prática, sem perda — e o filtro `p_setor` das funções sobrevive.

---

## 5. Frente C — os três booleanos [LIDO]

### 5.1 Primeiro, desfazer um homônimo

O briefing pergunta se "a síntese de `operacao_propria` serve" para as funções de Weddings. A pergunta parte de uma colisão de nomes:

| | `raw.vendas_excel.operacao_propria` | `monde.venda.operacao_propria` |
|---|---|---|
| tipo | **TEXT** | **boolean** |
| significado | **o nome da operação** (`"CLM - <casal> - <data>"`) | "não há `intermediary` no raw" |
| origem | coluna "Operação Própria" do Excel (0107) | síntese do ADR-0149 |
| quem consome | `regenerar_dim_operacao_weddings`, `dim_faturamento_hotel` (0112), RPCs de subsetor por operação (0113) | **ninguém** |

São coisas diferentes. **Nenhuma das 6 funções — nem qualquer outro objeto do banco — lê o boolean do espelho.** Ele foi criado para completude/auditoria e assim ficou. Portanto **a decisão 2 do briefing, como formulada, não tem objeto**: Weddings não depende dessa inferência.

O que Weddings depende é do **vínculo venda → operação**, e esse vínculo é **nativo na API**:

| medida | valor |
|---|---|
| vendas Weddings no espelho | 5.772 |
| com `raw.operation_id` | **5.533 (95,9%)** |
| com nome de operação no Excel | 5.643 |
| pares `operation_id` × nome distintos | 303 |
| **ids com mais de um nome** | **0** |
| nomes com mais de um id | 1 (operação duplicada no ERP) |

`operation_id → nome` é uma **função limpa**. O problema é obter o **nome** pela API: só existe em `raw.operation.name` (125 vendas) e em `operations[].product_name` (o produto-operação). Juntando os dois, a API nomeia **51 dos 303 ids (16,8%)**.

### 5.2 `contrato` e `taxa_servico`: a síntese erra tudo, o produto acerta tudo

28.421 vendas comuns:

| | Excel `true` | espelho `true` | acertos | falso-neg | falso-pos |
|---|---|---|---|---|---|
| `contrato` | 232 | **0** | 28.189 (99,18%) | 232 | 0 |
| `taxa_servico` | 670 | 281 | 27.470 (96,65%) | **670** | **281** |

Os 99,18% e 96,65% são ilusão de base desbalanceada. O que importa:

- **`contrato` é constante `false`** no espelho (decisão explícita do ADR-0149: "não sabemos, registrado como tal"). Acerto nos positivos: **0/232**.
- **`taxa_servico` acerta 0 dos 670 positivos** — e marca 281 vendas que o Excel não marca. Os conjuntos são **disjuntos** (670 + 281 = 951 = total de divergências). A heurística `any(agency_service_fee > 0)` mede outra coisa.

**Mas os dois são deriváveis do produto**, e o espelho tem o produto:

| regra | acerto no Excel | acerto **pelo produto do ESPELHO** |
|---|---|---|
| `contrato` = tem item `CONTRATO DE CASAMENTO%` | 28.413 / 28.421 (**99,97%**) | **28.413 / 28.421 (99,97%)** |
| `taxa_servico` = tem item `TAXA DE SERVIÇO` | 28.418 / 28.421 (**99,99%**) | **28.418 / 28.421 (99,99%)** |

O Excel derivava essas flags do produto; a síntese tentou derivá-las de campos financeiros. **A correção é trocar a heurística do `transformSale`, não pedir campo ao provedor.**

### 5.3 Consequência para Weddings

Nenhuma das 4 funções de Weddings depende de inferência de "operação própria". O que elas dependem, e o estado de cada dependência:

| dependência | estado no espelho |
|---|---|
| produto → subsetor (`dim_produto_subsetor`, 19 linhas) | **OK** — o `CASE` da §4.3 produz exatamente as chaves `produto_normalizado` |
| `n_contratos` (produto = CONTRATO DE CASAMENTO) | **OK** — 75 = 75 no período de 12 meses |
| faturamento/receita por subsetor | **OK no faturamento** (≤0,85%), receita com o desvio da §4.6 |
| `data_evento` do casamento | **OK, 239/239 idêntico** — `monde.venda_item.data_inicio` do item "Contrato de casamento" == `raw.vendas_excel.data_inicio_evento` |
| venda → operação (nome) | **PARCIAL** — `operation_id` cobre 95,9%, mas o **nome** só vem da API em 16,8% dos ids |
| `resultado_caixa`, entradas/saídas por operação | **fora do Scope B** — vem de `fato_lancamento_operacao` (upload de Lançamentos, que continua) |

Paridade medida de `get_sumario_subsetor` (12 meses fechados, réplica em SQL do corpo vivo):

| subsetor | vendas Excel | vendas espelho | contratos Excel | contratos espelho | Δ faturamento | Δ receita |
|---|---|---|---|---|---|---|
| CONVIDADOS - Hospedagens | 1.022 | 1.030 | 0 | 0 | +R$ 76.362,26 (0,85%) | −R$ 7.927,27 |
| PRODUÇÃO | 214 | 216 | 0 | 0 | +R$ 49.897,15 (1,12%) | −R$ 34.806,68 (−7,3%) |
| PLANEJAMENTO | 77 | 77 | 0 | 0 | **R$ 0,00** | −R$ 1.703,85 |
| CONVIDADOS - Extras | 297 | 296 | 0 | 0 | −R$ 6.847,04 | −R$ 742,33 |
| COMERCIAL | 84 | 84 | **75** | **75** | **R$ 0,00** | −R$ 10.090,39 (−2,5%) |
| NÃO_CLASSIFICADO | 44 | 45 | 0 | 0 | +R$ 4.900,00 | −R$ 0,04 |

Nenhum subsetor órfão, nenhum a mais. (Nota de higiene: 3 das 19 linhas de `dim_produto_subsetor` — "ATUALIZAÇÃO DE CONTRATO", "EVENTOS (FESTA DE BOAS VINDAS)", "PACOTE TURÍSTICO (PASSEIOS)" — nunca casam com produto nenhum, nas duas bases. São entradas mortas do de-para, não risco de repoint.)

---

## 6. Frente D — Pessoas [LIDO]

### 6.1 A base atual

`raw.pessoas` (migration 0160), 18 colunas todas TEXT + `carregado_em`. Carga **full-swap atômica** (`limpar_staging_pessoas` → `inserir_lote_staging_pessoas` → `validar_carga_pessoas` → `promover_carga_pessoas`, que aborta se a staging estiver vazia). Upload em `admin/uploads` → parser `parse-pessoas.ts` em Web Worker. Corresponde ao cadastro de pessoas do Monde (`pessoas.xlsx`), que antes da v4.29.0 era juntado por um **script R** com a planilha crua (ADR-0133).

| | |
|---|---|
| linhas | **64.104** |
| **última carga** | **2026-06-30 15:24** (≈5 semanas antes desta investigação) |
| nomes distintos | 62.529 → **1.575 linhas a mais que nomes distintos** (homônimos/duplicatas) |

Preenchimento: nome 100% · cpf 55,2% · email 44,1% · endereço 44,0% · celular 40,3% · CEP 38,3% · cidade 49,3% · UF 47,2% · número 33,9% · bairro 33,0% · telefone 14,8% · razão social 6,5% · CNPJ 4,4% · inscrição estadual 0,8% · **inscrição municipal 0,4%**.

### 6.2 Todos os consumidores

Um só ponto de leitura: **`buscar_pessoas(p_nomes text[])`** (0160, gate estendido na 0161 para `admin/uploads` **ou** `financeiro/faturamento-corp`), que **cruza por NOME trimado** e devolve a linha inteira.

| consumidor | uso |
|---|---|
| `financeiro/faturamento-corp/actions.ts` — cruzamento | nomes da coluna "Pessoa" da planilha de faturamento → cadastros |
| `financeiro/faturamento-corp/actions.ts` — **emissão de boleto** | re-busca server-side (o cliente não é fonte de verdade do CPF/CNPJ) |
| `financeiro/faturamento-corp/actions.ts` — **emissão de NF** | idem, com *fail-closed* explícito se a RPC falhar |
| `lib/asaas/customers.ts` | monta/completa o cliente no Asaas: `cpfCnpj`, `email`, `phone`, `address`, `addressNumber`, `province` (bairro), `postalCode` (CEP), `state` (UF) |
| `lib/faturamento/classificar.ts` | calcula `faltam[]` e `prontaNf` (NF exige CPF/CNPJ **+ endereço + CEP**) |
| `components/financeiro/faturamento-corp.tsx` | tela de revisão |
| `admin/uploads` | status e carga |

**O app consome os 17 campos** (`PessoaCadastro` em `lib/faturamento/tipos.ts`, `buscarPessoasSchema` em `schemas-rpc.ts`).

Homônimo é tratado com "usa o primeiro" (`if (k && !porNome.has(k)) porNome.set(k, c)`) e sinalizado na tela (`multiplos`). Com 1.575 nomes duplicados, isso é ambiguidade real hoje — e é o argumento mais forte a favor de trazer o `monde_person_id`.

### 6.3 ⚠️ Modelo de escrita — a pergunta decisiva do briefing

**A plataforma NÃO escreve em `raw.pessoas`, nem em nenhuma tabela satélite por pessoa.** Varri as migrations e o `src/`: a única escrita é o full-swap do upload; nenhuma coluna própria, nenhuma flag, nenhum override de e-mail por pessoa.

O que a plataforma **possui** é `app.cliente_corporativo` (0164) — uma tabela **paralela**, não satélite: `empresa`, `situacao`, `faturar_em`, `vencimento`, `obs`, `pct_juros`, `pct_multa`, `destinatarios`, `forma_pgto`, `contato_whats`, `origem` ('planilha'|'manual'), com `UNIQUE` em `app.norm_nome(empresa)`. Ela **não referencia** `raw.pessoas`; liga por **nome**. As outras tabelas do Faturamento (`fatura_emissao`, `fatura_nota`, `fatura_email`) são registros de evento por número de fatura, não por pessoa.

**Portanto: não há merge a desenhar para `raw.pessoas`.** Repontar a base para a API não atropelaria edição alguma. A dívida que existe é outra e é de **chave**: tudo liga por nome. Se a base ganhar `monde_person_id`, vale (num passo separado, e é decisão de produto) migrar `app.cliente_corporativo` para casar por id.

### 6.4 O shape do `people` — e o bloqueio

`GET ?resource=people&page=N&page_size=200` · **total 64.706** · `page_size` **teto rígido de 200** (pedi 500 e 1000, respondeu 200) → **324 páginas** por varredura completa. **Não existe detalhe de pessoa**: passar `id` é ignorado (devolve a página 1), e `resource=person` não existe. Os recursos disponíveis são `sales, sale, people, tasks, task-historics, cities, kpis, airline-passengers, airline-kpis`.

Campos expostos: `monde_person_id`, `code`, `name`, `kind` (`individual`|`company`), `cpf`, `cnpj`, `email`, `mobile_phone`, `city_name`, `registered_at`. **Sem `custom_fields`, sem `raw`.**

De-para com a base (17 campos):

| campo da base | na API | observação |
|---|---|---|
| `nome` | ✅ `name` | **13,3% vêm com espaço à esquerda** — `TRIM` obrigatório (a 0160 já sabia) |
| `cpf` | ✅ | 56,0% na amostra (base: 55,2%) |
| `cnpj` | ✅ | 4,0% (base: 4,4%) |
| `email` | ✅ | 45,1% (base: 44,1%) |
| `celular` | ✅ `mobile_phone` | 41,7% (base: 40,3%) |
| `cidade` | ⚠️ `city_name` | **nulo em 1.000/1.000 da amostra** — na prática ausente |
| `razao_social` | ❌ | |
| `cep` | ❌ | **NF-e/boleto exigem** |
| `endereco` | ❌ | **NF-e/boleto exigem** |
| `numero` | ❌ | boleto usa |
| `complemento` | ❌ | |
| `bairro` | ❌ | boleto usa (`province`) |
| `uf` | ❌ | boleto usa (`state`) |
| `pais` | ❌ | |
| `inscricao_estadual` | ❌ | |
| `inscricao_municipal` | ❌ | NFS-e |
| `telefone` | ❌ | |

**A API traz `monde_person_id` e `code`, que a base não tem** — e são o que resolveria a ambiguidade de nome.

Saldo: **5 campos aproveitáveis de 17**. O `people` cobre a **identidade** e não cobre **nada** do endereço/fiscal.

### 6.5 Paridade

Amostra de 1.000 pessoas (5 páginas espalhadas: 1, 50, 120, 200, 300):

| | |
|---|---|
| casam na base por **nome** (trim exato) | **994 / 1.000 (99,4%)** |
| casam na base por **documento** (só dígitos, dos 600 com documento) | **598 / 600 (99,7%)** |
| composição | 751 pessoa física · 249 empresa |

A API é **superconjunto em volume** (64.706 × 64.104 = **+602**), coerente com uma base carregada em 30/06 e uma API viva. Não encontrei indício de pessoa que exista só na plataforma.

### 6.6 Cadência — sem filtro incremental

Testei `from`/`to` e `updated_since` em `people`: **ignorados** (o `total` continua 64.706 nos três casos). Não há como pedir "o que mudou". Consequências:

- Sincronizar Pessoas = **varredura completa de 324 páginas** toda vez.
- O UPSERT por hash (padrão da 0178) resolve o custo de **escrita**, não o de **leitura**.
- A cadência de ~2h citada no briefing é a do lado do Monde; **do nosso lado a decisão é de custo de varredura**, e não há ganho em rodar mais rápido do que o cadastro muda. Uma varredura por dia já deixa a base ordens de magnitude mais fresca do que hoje (carga de 30/06).

---

## 7. ⚠️ Achado crítico fora do escopo — o espelho está perdendo vendas

Encontrado ao explicar o delta da §4.2. **Não é sobre o Scope B: é sobre a fonte que já está em produção.**

**Sintoma:** 42 vendas existem no upload e **não** no espelho — R$ 392.070,01 de faturamento e R$ 47.806,35 de receita, entre 2025-07-30 e 2026-07-31, **38 delas em jul/2026**.

**Descartadas as exclusões legítimas:** consultei as 38 na API. Todas as 38 aparecem na listagem, com `custom_field Setor` válido (22 Corporativo, 13 Lazer, 3 Weddings — nenhuma Welcome), `product_count > 0`, e o detalhe das 3 que abri mostra item `active`. **Não foram excluídas pelo `transformSale`; simplesmente não foram ingeridas.**

**Causa provada:** o modo `incremental` (o que o `pg_cron` chama a cada 15 min, migration 0182) usa janela **`hoje−2d .. hoje`** e a API filtra por **data da venda**. Venda registrada depois desse prazo com data retroativa nunca cai na janela. Das 38, **37 foram registradas mais de 2 dias após a data da venda** — atraso mediano **4 dias**, **máximo 32** (venda 73422: data 2026-07-03, registrada 2026-08-03).

**Por que importa agora:** o espelho é a fonte de `get_executiva_kpis`, `metas_ritmo_diario`, `get_tendencia_margem`, `get_decomposicao_variacao`, `get_historico_12m_setores`, `get_mix_setor` e `get_historico_mensal` desde a v5.1.4. Metas e Performance estão **subestimando** faturamento em jul/2026, e a lacuna só cresce. O upload, hoje, é a única coisa que evidencia o furo — e ele vai ficar dormente.

**No sentido inverso:** 29 vendas existem só no espelho (R$ 677.234,76) — esperado, o Excel é exportação manual e defasada. Sem gravidade.

**Correção sugerida (fora deste relatório, patch próprio):** alargar a janela do incremental (ex.: `hoje−35d`, cobrindo o atraso máximo observado com folga) ou, melhor, um passo de reconciliação periódico que reprocesse os últimos N meses — o UPSERT por `raw_hash` torna isso barato (venda inalterada é ignorada). **Isto deveria vir ANTES das ondas**: repontar mais telas para um espelho com furo multiplica o furo.

---

## 8. Frente E — desenho e ondas [PROPOSTA]

### 8.1 `monde.fato_venda_item` — a estrutura que serve as 6

Não precisa de tabela de dados nova: o espelho já tem tudo. Precisa de **uma view/mv que expõe a categoria de produto** e do `setor_macro_id` já resolvido, na mesma forma que as funções esperam — exatamente a técnica das *views-compat* da 0181.

```sql
-- monde.fato_venda_item_compat: 1 linha por item ativo, na FORMA de analytics.fato_venda_item
CREATE OR REPLACE VIEW monde.fato_venda_item_compat AS
SELECT
  v.venda_numero,
  v.data_venda,
  dsm.id                      AS setor_macro_id,
  v.vendedor,
  v.pagante,
  CASE i.product_kind
    WHEN 'airline_tickets' THEN 'Passagem Aérea'
    WHEN 'car_rentals'     THEN 'Aluguel de Carro'
    WHEN 'hotels'          THEN 'Diárias de Hospedagem'
    WHEN 'insurances'      THEN 'Seguro Viagem'
    WHEN 'travel_packages' THEN 'Pacote Turístico'
    ELSE btrim(i.produto)
  END                         AS produto,
  i.product_kind,
  i.fornecedor,
  i.data_inicio,
  i.passageiros,
  i.valor_total,
  i.receitas                  -- ⚠️ ALOCADA (§4.6) — não usar para margem por produto
FROM monde.venda_item i
JOIN monde.venda v ON v.id = i.venda_id
JOIN analytics.dim_setor_macro dsm ON dsm.nome = v.setor_macro
WHERE i.status = 'active';
```

Disciplina, igual à v5.1.2/v5.1.4: view nova em `monde`, **nada em `analytics` é tocado**, repoint é `CREATE OR REPLACE FUNCTION` (aditivo) com bloco `DOWN` na própria migration, upload intocado. Materializar só se a medição de tempo pedir (o `authenticated` tem 8s — vale medir `get_weddings_historico_subsetor` sobre a view antes de decidir).

**Nome da coluna `receitas`:** sugiro chamá-la **`receitas_alocadas`** na view e documentar o comentário — nomear o que ela é evita que a próxima sessão a use para margem por produto sem saber.

**Correções que devem entrar no `transformSale` junto (ADR novo ou emenda ao 0149):**
- `contrato` := existe item ativo com `product_name` casando `CONTRATO DE CASAMENTO%` (99,97%);
- `taxa_servico` := existe item ativo com `product_name` = `TAXA DE SERVIÇO` (99,99%);
- gravar `operation_id` (hoje só vive dentro do `raw`) numa coluna de `monde.venda` — é o vínculo de Weddings e está a 95,9%;
- `operacao_propria` (boolean): **renomear ou remover**. Não tem consumidor e o nome colide com um conceito diferente e vivo. Como remover coluna é destrutivo, o caminho barato é renomear na próxima versão que toque o espelho e deixar registrado.

### 8.2 Ingestão de Pessoas

Só faz sentido depois da decisão 3. Se for adiante, no padrão da 0178:

- `monde.pessoa` (viva) + `monde.pessoa_staging` (UNLOGGED) + `monde_pessoa_ingest_*` service-role-only;
- chave de dedup **`monde_person_id`** (a API dá; a base não tem) + `raw_hash` para idempotência;
- `nome` gravado com `TRIM` (13,3% vêm com espaço à esquerda);
- **`ON CONFLICT DO UPDATE` — nunca full-swap.** A API não tem filtro incremental, e um swap com varredura interrompida esvazia a base;
- **desenho de MERGE, obrigatório** se a decisão for híbrida: `monde.pessoa` dona da identidade (id, nome, kind, cpf, cnpj, email, celular) e `raw.pessoas` dona do endereço/fiscal, com uma view que junta e um `buscar_pessoas` repontado para ela. O upload de Pessoas **continua vivo** nesse cenário — não é aposentadoria, é divisão de responsabilidade;
- cadência: **1×/dia** (§6.6), fora do horário de pico. Não usar o `pg_cron` de 15 min de vendas.

### 8.3 Ordem das ondas — revisada pelo que as frentes acharam

**Onda 0 — corrigir a janela do incremental (§7).** Não é Scope B; é pré-condição. Repontar tela nova para um espelho que perde vendas é construir sobre furo. Patch pequeno, verificável (as 42 vendas devem aparecer).

**Onda 1 — `get_sumario_subsetor` + `get_weddings_historico_subsetor`.** Contrariando a sugestão do briefing, **Weddings-subsetor vem antes de Performance**, por três razões: (a) é a paridade mais forte medida (n_contratos 75=75, dois subsetores com delta zero); (b) não depende do de-para de operação; (c) **`get_sumario_subsetor` já é lido pela tela de Metas, que está no espelho** — é a mistura de fontes mais antiga em pé.

**Onda 2 — `get_mix_produto` + `get_cagr`.** Fecha o desencontro de R$ 75.773,40 na tela de Performance (§4.4). Traz duas conversas de produto: a margem por produto passa a ser alocada (§4.6) e o CAGR de receita cai 4,6 p.p. (§4.5). Precisa de comunicação, não de código extra.

**Onda 3 — Pessoas.** **Paralelizável** com 1 e 2 (domínio e consumidores disjuntos: `buscar_pessoas` não toca vendas). Mas o **escopo** depende da decisão 3 — se for merge, é mais trabalho do que as duas primeiras juntas.

**Onda 4 — `get_pipeline_weddings`.** Última: precisa da coluna `operation_id` (onda 1 ou 2) e de um de-para `operation_id → nome` que a API só cobre em 16,8%. O caminho realista é uma tabela curada (`monde.operacao_map`), bootstrapped com os **303 pares** que a base atual já prova sem ambiguidade, alimentada depois por `raw.operation.name` e `operations[].product_name`. É um `dre_categoria_map` novo — decisão de produto, com dono e manutenção.

**`get_prejuizos` fica FORA das ondas.** Não tem paridade (§4.7) e não é questão de esforço. Três saídas, todas decisão do Yan: (a) manter no upload — mas aí o upload de Vendas **não pode ficar dormente**, o que anula a meta; (b) redefinir o KPI para "vendas com receita total negativa" (o espelho responde isso exatamente: 89 vendas), assumindo que o número muda e comunicando; (c) pedir receita por produto ao provedor — somos piloto, o pedido é viável, e é o **único** pedido ao provedor que esta investigação sustenta.

### 8.4 Plano de aposentadoria dormente

A tela `admin/uploads` tem **5 bases**: `vendas`, `lancamentos`, `lancamentos_movimentacao`, `titulos_em_aberto`, `pessoas`. O Scope B mira **2** (`vendas` e `pessoas`); as outras três continuam.

**Fica de pé (dormente):** aba na tela, parser (`vendas-parser.ts`, `parse-pessoas.ts`), RPCs de carga, `raw.vendas_excel`, `raw.pessoas`, `analytics.fato_venda`/`fato_venda_item`, `mv_vendas_diarias`/`mv_vendas_mensais`.

**Para de ser lido:** as 6 funções desta investigação (o repoint) — e nada mais, porque as 7 da v5.1.4 já não leem.

**⚠️ Não pode ficar dormente enquanto:**
- `get_prejuizos` não for resolvido (decisão 5);
- `regenerar_dim_operacao_weddings` continuar lendo `raw.vendas_excel` para `data_evento`/`hotel`/`data_venda_contrato` (0110/0042/0052) — o pipeline de Weddings é regenerado a partir dali;
- as RPCs de faturamento por subsetor via operação (0113) continuarem lendo `raw.vendas_excel`.

Ou seja: **o upload de Vendas tem consumidores além das 6.** A aposentadoria de Vendas é maior que o Scope B — este relatório mapeia a parte item-level, e registra que sobra trabalho no eixo operação/Weddings.

**O fallback esfria — e mais rápido do que parece.** Prova viva neste relatório: a base de Pessoas está com carga de **30/06** e a API já tem **602 pessoas a mais**. Rollback real não é "voltar a ler o que está lá"; é "reativar a leitura **e** subir planilha nova". Isso precisa estar escrito no runbook e no out-briefing da onda, não como nota de rodapé.

**A remoção futura precisará remover:** parser + aba + RPCs de carga + tabelas raw + fato/mv do upload + os testes que as cobrem (`vendas-parser.test.ts`, `parse-pessoas.test.ts`, casos de `rpc-contrato.test.ts`) — e só depois que os consumidores do parágrafo acima tiverem outro caminho.

### 8.5 Riscos de ordem

1. **Já existe mistura em pé.** Performance mostra KPI do espelho ao lado do mix do upload (R$ 75.773,40 de diferença em jun/26) e Metas mostra KPIs do espelho ao lado de `n_contratos` do upload. Repontar **reduz** o número de fontes na tela; deixar como está não é neutro.
2. **Não repontar `get_sumario_subsetor` pela metade.** Ela alimenta a tela de Weddings **e** o card "Contratos" de Metas. É uma função, dois lugares: repontar resolve os dois de uma vez — mas qualquer mudança no número aparece nos dois, e Metas é tela de diretoria.
3. **`get_prejuizos` aparece em duas telas com semânticas diferentes** (`p_summary:true` na Executiva com período anterior; `p_summary:false` em Performance). Se for redefinido, os dois lugares mudam juntos — e o comparativo com o período anterior muda de base retroativamente.
4. **`get_mix_produto` e `get_cagr` estão na mesma tela e no mesmo `Promise.all`.** Repontar uma e não a outra é possível tecnicamente, mas o CAGR de receita cai 4,6 p.p. enquanto o mix não muda — dois avisos separados para o usuário. Melhor uma onda só.
5. **O de-para `operation_id → nome` é dado curado.** Sem dono, apodrece — é o mesmo padrão do `dre_categoria_map`. Não abrir a onda 4 sem definir quem mantém.
6. **Caso de contrato obrigatório:** quando `get_mix_produto` for repontada, o total do mix passa a ter de bater com o KPI de faturamento da mesma tela. Isso é `rpc-contrato.test.ts`, não nota de rodapé — foi exatamente a lição da v5.3.1.

---

## 9. DECISÕES PARA O YAN

**1. A regra do subset do Excel existe? — SIM, e não há nada a decidir: é `status='active'`, e o espelho já a aplica.**
O "subconjunto" era comparação contra o `raw`, que inclui produtos apagados. Espelho ≡ raw-`active` em 100% das vendas, ao centavo. O **mix por produto não muda** (delta de composição ≤0,05 p.p. em 12 meses).
**Decisão que sobra, e é de produto:** a **margem por produto** muda (até 3,5 p.p. no ano, mais no mês) porque a receita por item do espelho é uma **alocação**. Aceitar a margem alocada (e dizer isso na tela / no tooltip), ou **retirar `margem_pct` do card de Mix** e deixar só composição e faturamento?

**2. A síntese de `operacao_propria` serve para Weddings? — A pergunta não tem objeto.**
`operacao_propria` é homônimo: no upload é TEXT (nome da operação), no espelho é boolean sintetizado — **e o boolean não tem um único consumidor**. Weddings depende do vínculo venda→operação, que é **nativo** (`raw.operation_id`, 95,9%, 303 ids sem ambiguidade). Não há o que adiar nem o que pedir ao provedor neste ponto.
**Decisão:** aprovar (a) gravar `operation_id` numa coluna de `monde.venda`; (b) criar a tabela curada `operation_id → nome` (bootstrap com os 303 pares provados) **com dono definido**; (c) corrigir `contrato` e `taxa_servico` no `transformSale` pela regra do produto (99,97% / 99,99%) — a heurística atual erra **100% dos positivos**; (d) renomear/remover o boolean `operacao_propria`.

**3. Pessoas: troca de fonte ou merge? — Nem uma nem outra, como está.**
A plataforma **não escreve** na base de Pessoas (verificado) — então não há merge por causa de edição. O bloqueio é de **cobertura**: o `people` expõe 5 dos 17 campos e **nenhum** de endereço/fiscal (`city_name` vem nulo em 100% da amostra), exatamente o que boleto e NFS-e exigem. Três caminhos:
- **(a) Pedir ao provedor** que o `people` exponha CEP, endereço, número, bairro, cidade, UF, razão social e inscrições. Somos piloto; é o pedido de maior retorno desta investigação. Enquanto não vier, Pessoas fica no upload.
- **(b) Merge explícito agora:** API dona da identidade (`monde_person_id`, nome, kind, cpf, cnpj, email, celular) + upload dono do endereço/fiscal. Ganho imediato: frescor da identidade e **fim da ambiguidade de 1.575 nomes duplicados**. Custo: duas fontes na mesma tabela, para sempre — e o upload de Pessoas **não** aposenta.
- **(c) Não fazer nada agora** e priorizar o resto do Scope B.
**Minha recomendação: (a) + (c) — abrir o pedido ao provedor e não construir ingestão de Pessoas até saber a resposta.** (b) paga pouco e cria dívida permanente. Registre-se, porém, que a base está com carga de **30/06** e a API já tem **602 pessoas a mais** — o custo de não decidir também corre.

**4. Ordem das ondas.** Proposta: **Onda 0 corrigir a janela do incremental** → **1 Weddings-subsetor** (paridade mais forte, e desfaz a mistura viva com Metas) → **2 Mix + CAGR** (fecha o desencontro de R$ 75.773,40 na Performance) → **3 Pessoas, paralelizável, escopo dependendo da decisão 3** → **4 Pipeline Weddings** (depende do de-para de operação). Difere do briefing por trocar Performance e Weddings de lugar e por inserir a Onda 0. Aprova?

**5. `get_prejuizos` — a única sem paridade.** Espelho: 89 vendas / R$ 145.901,25 contra 103 vendas / R$ 58.076,02 do upload. Erra nos dois sentidos por construção (a alocação preserva o sinal da venda). Escolher: **(a)** manter no upload — e então o upload de Vendas **não** fica dormente; **(b)** redefinir o KPI como "vendas com receita total negativa" (o espelho responde exatamente, e o número muda — precisa comunicação); **(c)** pedir receita por produto ao provedor (55% do valor é o melhor que os campos atuais reconstroem).

**6. Cadência de Pessoas: 1×/dia.** Não há filtro incremental (`from`/`to`/`updated_since` ignorados) e o `page_size` tem teto de 200 → **324 páginas por varredura**. A cadência de 2h do Monde não se traduz em 2h do nosso lado. Confirma 1×/dia, fora de pico?

**7. (novo) O furo do espelho é patch próprio e urgente?** 42 vendas, R$ 392.070,01 de faturamento fora de Metas e Performance **hoje**, por causa da janela de 2 dias do incremental. Recomendo patch antes de qualquer onda. Aprova abrir?

**8. (novo) `margem_pct` por produto e "receita alocada" no vocabulário.** Se a decisão 1 mantiver a margem por produto, vale nomear a coluna `receitas_alocadas` na estrutura nova e registrar a semântica na skill `banco-e-rpc` — para que a próxima sessão não a use como receita nativa.

---

## 10. Apêndice — cobertura e o que ficou sem verificar

**Medido em dado real:** 28.450 vendas-espelho × 28.463 do upload; 48.711 produtos no `raw` por `status`; comparação item a item e valor a valor por venda; delta mensal em 44 meses; mix e margem por produto em 1 mês e em 12; CAGR nos 3 anos completos; 3 booleanos em 28.421 vendas comuns; `operation_id` em 5.772 vendas Weddings; `data_inicio` do Contrato em 239 casos; 4 candidatos de receita nativa em 8.493 vendas; `get_sumario_subsetor` por subsetor em 12 meses; `raw.pessoas` (64.104) e amostra de 1.000 da API; 38 vendas faltantes conferidas na API uma a uma (listagem + `registered_at`).

**Não verificado, e por quê:**
- **Tempo de resposta das funções repontadas sobre a view** — não medi latência; o orçamento de `authenticated` é 8s e `get_weddings_historico_subsetor` sobre view (não mv) é o candidato a estourar. Medir antes de decidir view × mv.
- **RPCs com gate chamadas como usuário real** — `exigir_acesso` nega `postgres` (não é superusuário no Supabase). Usei os `__nucleo` e réplica em SQL.
- **`raw.operation.name` para os 252 ids sem nome** — não varri a API venda a venda para tentar completar o de-para; a cobertura de 16,8% vem do `raw` já guardado. Uma varredura dirigida pode subir esse número e vale fazer antes da Onda 4.
- **Se o Excel de Vendas ainda é exportado com as mesmas colunas** — a base dormente depende disso para o rollback; é verificação operacional do Yan.
- **`tasks`, `cities`, `kpis`, `airline-*`** — fora do escopo.

**Scripts descartáveis** (tmp do job, fora do repositório, não commitados): runner SQL read-only, sonda da API com máscara de PII, paridade de Pessoas, diagnóstico das vendas faltantes e prova da janela do incremental.
