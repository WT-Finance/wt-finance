# API Monde v3 — o que evoluiu desde 05/10 e se ela já substitui as bases manuais

**Data:** 19/11/2026 · **Natureza:** investigação read-only (só `GET` na API, sessão read-only no banco) ·
**Oráculo:** as bases manuais recarregadas **hoje** (19/11, 10:25–10:49 de Brasília; Contas a receber em 16/11;
Pessoas em 10/11) · **Fontes:** OpenAPI oficial (`web.monde.com.br/api/v3/documentation/file?locale=pt-BR`,
baixado hoje, 2,25 MB), manual do TTARS (revisto em 24/10) e ~550 chamadas à API com a chave de produção
(`MONDE_V3_API_KEY`), a 1 chamada/1,3 s, zero 429.

> Amostras brutas (com nomes e documentos) ficaram fora do repositório, no diretório temporário do job.
> Nenhum número de venda/título aqui identifica pessoa.

---

## 1. Resposta curta

1. **A API evoluiu muito.** A última verificação (v6.2.0, 05/10) partia de um manual com 19 recursos testados e
   de uma API que "não filtra por data nem diz o que mudou". Hoje o OpenAPI oficial tem **46 recursos de topo
   (139 rotas, contando ações e escrita)** e um changelog com **~40 entregas desde 05/10** (quase diárias). As que
   importam para o Janus:
   - `/sales` agora tem **`updated_since`** (pega edição de produto, passageiro, pagamento e conta vinculada, e
     venda retrodatada) e **`date_field/date_from/date_to`**. **Provado ao vivo** (§3).
   - **`/reports/sales_by_products`** (04/11): é o relatório "Vendas por produto" — a própria base de Vendas —
     com **receita por produto** (`commission.revenue`). A nossa chave **ainda não tem a permissão** (403).
   - Módulo financeiro completo e filtrável por data: `/bills`, `/bill_items` (05/11), `/account_movements`
     (filtro por data em 05/11), `/accounts/{id}/statement` e `/balance`, `/categories` (com `kind`),
     `/category_groups`, `/cost_centers`, `/refunds`, `/nfs`, `/logs`.
   - **Webhooks** (27–28/10) — aviso ativo de mudança, alternativa ao polling. Sem permissão na nossa chave.
   - **Escrita** (POST/PATCH/DELETE em vendas, contas, pessoas, liquidação…). Ver risco no §6.
   - Limite oficial: **10 requisições a cada 3 s por IP** (vale desde 13/08 — não é novidade); não há cota
     diária. Tudo segue marcado **Beta**.

2. **Substituir as bases manuais: tecnicamente SIM para 5 das 7, com paridade medida ao centavo contra o
   arquivo de hoje; NÃO para o Demonstrativo; Vendas depende de uma permissão na chave.** Mas nenhuma troca é
   "ligar e desligar o upload": as bases financeiras pedem **um espelho novo de contas** (`/bills` + detalhe),
   que é o mesmo para Movimentação, Aberto, Contas a receber e Operação — é uma versão, não um patch.

| Base manual | Rota na API | Paridade medida hoje | Veredito |
|---|---|---|---|
| **Vendas por produto** | `/reports/sales_by_products` | **não verificada — 403** | Provável (a doc diz "mesma consulta do relatório"); **bloqueada por permissão** |
| **Lançamentos por Movimentação** | `/bills` + `/bills/{id}` + `/account_movements` | 950/950 títulos ao centavo; categorias 18/18 | **Sim** (regras no §4.2) |
| **Lançamentos em aberto** | `/bills?status=open,overdue` + detalhe | 12.438/12.456 ao centavo; dos 18 restantes, os 2 conferidos foram editados no Monde depois da exportação | **Sim** |
| **Contas a receber** | `/bills?transaction_kind=credit` + detalhe | 1.297/1.297 presentes, 1.296 no valor, 1.297 na liquidação (set/2026) | **Sim** |
| **Lançamentos por Operação** (RPA) | `/bills/{id}.operation` + operação da venda | 10/10 vínculos e valores (amostra) | **Sim, provável** — aposentaria a RPA |
| **Pessoas** | `/people` (+ `/cities/{id}`) | 17/17 colunas com campo correspondente | **Sim** — o "5 de 17" de agosto caducou |
| **Demonstrativo (competência)** | — (não existe `income_statement`) | — | **Não** — segue o veredito PARCIAL de julho |

---

## 2. O que mudou desde a última verificação (05/10, v6.2.0)

### 2.1 A pauta de agosto ao fornecedor, item a item

A pauta (`origin/docs/pauta-provedor-monde`, 06/08) foi escrita para a API antiga (`monde-data`). Contra a v3 de hoje:

| # | Pedido | Hoje | Evidência |
|---|---|---|---|
| 1 | Filtro por data de **alteração** | ✅ **Resolvido** — `updated_since` em `/sales`, incluindo partes da venda e retrodatada | Changelog 27/10 + prova ao vivo §3.2 |
| 2 | Receita **por produto** | ✅ **Resolvido no relatório** — `commission.revenue` por linha em `/reports/sales_by_products`; o `/sales/{id}` continua sem receita por produto | Schema do OpenAPI; 403 na nossa chave |
| 3 | `total_revenue` inclui produto cancelado? | ➖ Contornável — o relatório filtra `product_status` (padrão: só ativo, como no Monde) | Schema |
| 4 | Nome da operação | ✅ **Resolvido** — operação é produto do catálogo (`/products/{id}`); o espelho já nomeia **193 de 197** operações (98%) citadas em vendas desde 2025 (eram 16,8%) | Banco, hoje |
| 5 | `people`: campos fiscais + incremental | ✅ campos (endereço completo, IE, IM, documentos) · ❌ **sem filtro incremental** | Lista de `/people` |
| 6 | Venda sem `sale_id` | ➖ Perde o sentido: na v3 o `id` é UUID sempre presente | — |
| 7 | Venda `opened` com todos os produtos cancelados | ❓ Sem resposta documentada | — |

### 2.2 Entregas do changelog que tocam o Janus (05/10 → 18/11)

- **27/10 — `updated_since` considera as partes da venda** (produto, passageiro, pagamento, contas vinculadas).
- **27–28/10 — Webhooks** (`sales.changed`, `sales.closed`, `sales.product_canceled`, `bills.*`…). Só na
  credencial criada pela própria agência (não na "conexão automática"); exige endpoint HTTPS público.
- **21–22/10 — permissões "de outros", espelhadas do Monde.** Cada permissão vale para o que a credencial criou;
  as "de outros" estendem. Relevante: relatórios exigem "Consultar vendas de outros vendedores".
- **04/11 — `/reports/sales_by_products`**; **05/11 — `/reports/sales_by_sellers`**, `/bill_items`, filtro por
  data em `/account_movements`, composição dos itens da fatura (`side`, `kind`, `document`, `person`).
- **04/11 — limite** passa a ser contado por rede /64 em IPv6 (IPv4 inalterado).
- **05/11 — produto Visto** (`visas[]`, `kind=visa`): **tipo novo de produto que o transform do espelho
  não conhece** (ver §5).
- **06/11 — `payments.agency.to_invoice` muda de forma** no `GET /sales/{id}` (mudança de contrato anunciada).
  O espelho não lê esse campo hoje.
- Anterior à nossa sonda (13/08), registrado só para não ser confundido com novidade: o limite caiu de **60 para
  10 requisições a cada 3 s** por IP e `registered_at` virou `created_at`.

---

## 3. Provas ao vivo dos filtros novos

O manual adverte que **parâmetro desconhecido é ignorado calado** (a lista volta inteira, como se tivesse
filtrado). Por isso cada filtro foi provado com chamada discriminante.

### 3.1 Os filtros filtram

| Chamada | Resultado |
|---|---|
| `/sales?updated_since=2030-01-01` | **0** linhas |
| `/sales?date_field=sale_date&date_from=2030-01-01…` | **0** |
| `/sales?date_field=sale_date&date_from=date_to=2026-10-15` | 39 linhas, **todas** com `sale_date` 15/10 |
| `/bills?date_field=settlement_date` (futuro / 15/10) | 0 / todas liquidadas em 15/10 |
| `/bill_items`, `/account_movements` (futuro / 15/10) | 0 / todas em 15/10 |
| `/bills?updated_since=2030-01-01` | **lista inteira** → o filtro **não existe** em contas (só em vendas, como diz o FAQ) |
| `/sales?xyz_filtro=1` | lista inteira (confirma o "passa calado") |

### 3.2 `updated_since` pega edição de produto e financeiro, não só cabeçalho

- **Negativa:** 40 vendas recentes **fora** de `updated_since=12/11` × `raw` guardado no espelho antes de 12/11:
  **40/40 idênticas** campo a campo.
- **Positiva:** 40 vendas **dentro** de `updated_since=12/11` cujo `raw` no espelho é anterior a 12/11:
  30 diferem — **15 só em `financial`**, **14 em produto + `totals.revenue`**, 1 só em `operations[]`.
  Ou seja, o filtro acusa mudança abaixo do cabeçalho.
- Achado lateral: as vendas com diferença **ainda não estavam relidas** no espelho. Não é perda: nas **40/40**, o
  cabeçalho guardado (`venda_cabecalho.totais`) tem a mesma receita do `raw`, e a última passada da lista por elas
  foi hoje às **03:35 de Brasília** (`visto_em`, 06:35 UTC) — a edição no Monde veio depois. É o atraso de até
  ~1 dia **por desenho** (a revisita diária de vendas antigas). Com `updated_since`, entraria no tick seguinte
  (15 min) e com menos chamadas.

### 3.3 O que não mudou no detalhe da venda

O `GET /sales/{id}` fresco tem **as mesmas chaves** que o `raw` guardado (nenhuma chave nova de topo, de produto
ou de `totals` nos tipos amostrados). Receita por produto **não** está no detalhe — só no relatório.

---

## 4. Paridade por base (contra o arquivo carregado hoje)

### 4.1 Vendas por produto — bloqueada por permissão

`/reports/sales_by_products` responde **403** ("Você não tem permissão") para a nossa chave. O schema traz, por
produto, tudo que o parser exige: Venda Nº (`sale.number`), Data Venda (`sale.date`), Data Início
(`departure_date`), Pagante, Vendedor, Intermediário (com nome), Setor (`custom_fields.sale`), Passageiros,
Produto (`product.name`), Valor Total (`amounts.total_amount`), **Receitas (`commission.revenue`)**, Total
Produtos Moeda Origem (`origin_amounts.total_products`), Fornecedor, Contr./Voucher (`document`), Situação
(`status`), Reembolso ao Cliente (`amounts.customer_refund`), Operação Própria (`own_operation.name`).
A descrição oficial: *"É a mesma consulta do relatório, então a API e a tela trazem os mesmos produtos."*

**Não verificado.** Paridade só depois da permissão. Ressalvas já documentadas: com mais de uma moeda não vêm
abatimentos/over sobre; cada página consultada é registrada no Histórico do Monde como **exportação**.

### 4.2 Lançamentos por Movimentação — paridade ao centavo, com três regras

Dia de teste: **15/10/2026** (banco: 2.158 linhas, 1.190 títulos, 32 contas).

- `/account_movements` do dia: 992 movimentos, líquido **R$ 212.547,48**; `/bills` liquidadas no dia: 982
  contas, líquido **R$ 212.547,48** — as duas rotas fecham entre si **ao centavo**.
- Título a título contra o banco: **950 títulos nos dois lados, 950/950 com o mesmo valor ao centavo**.
- **Regra 1 — categoria só no detalhe.** A lista não traz categoria; `/bills/{id}.categories` traz
  `[{category{id}, amount}]`. Em 18 títulos amostrados (pagamentos de venda e despesas), **18/18** com as
  mesmas categorias e valores do arquivo.
- **Regra 2 — sinal pela natureza da categoria.** A API dá o valor da categoria sempre positivo; o arquivo nega
  a categoria de despesa (`/categories.kind = expense`). Ex.: pagamento de venda com "Entrada de clientes"
  +940,99 e "Taxa do Cartão" +32,84 na API → no arquivo, +940,99 e −32,84 (líquido 908,15 nos dois).
  ⚠️ A amostra é estreita: 12 dos 18 são o mesmo padrão (pagamento de venda com duas categorias) e 5 são despesas
  simples. **Conta de débito com categoria de receita** (estorno, devolução) **não foi testada** — a regra pode
  precisar do sentido da conta além do tipo da categoria.
- **Colunas comparadas:** valor e categoria. `Conta`, `Data de movimentação`, `Pessoa` e `Grupo de Categoria`
  **não** foram comparados nesta sonda (estão no detalhe: `account`, `movements`, `person`, grupo via
  `/categories/{id}`).
- **Movimentos futuros:** o arquivo de hoje tem só 3 linhas datadas depois de hoje (2 títulos, 1 conta,
  R$ 11.149,43). Não foi verificado como a API as representa (`/account_movements` filtra por data e aceitaria
  período futuro).
- **Regra 3 — fatura de cartão expande nas compras.** 240 títulos só no banco são compras de cartão
  corporativo (contas de cartão por portador) liquidadas em setembro e "movimentadas" em 15/10, dia em que a
  fatura foi paga; do lado da API são 28 faturas `credit_card_invoice`. No detalhe da fatura,
  `credit_card_items[{bill{id}, amount}]` — **Σ itens = valor da fatura ao centavo** nas 3 conferidas — aponta
  cada compra. Diferença residual do grupo: R$ 7.748,71 (−539.147,55 API × −531.398,84 banco), **não
  explicada** nesta sonda (candidatos: compra sem categoria ou de outro dia).

### 4.3 Lançamentos em aberto — 100% explicado

API: 12.642 contas em aberto/vencidas (253 páginas, 5,6 min). Banco: 12.483 títulos.

- **12.456 nos dois lados; 12.438 com valor idêntico ao centavo.**
- Os **18** com valor diferente são contas com vencimento em 30/11; nas **2 conferidas**, o `/logs` mostra
  **edição no Monde hoje às 10:58 e 11:02**, depois da exportação (10:32). As outras 16 não foram conferidas uma a
  uma (mesmo padrão de número e vencimento).
- **186** só na API: **166 faturas de cartão** e **20** contas **criadas hoje entre 10:47 e 11:01**, depois da
  exportação. A regra do cartão está provada dos dois lados: o arquivo traz **1.677 compras de cartão**
  individuais (todas também na API) e **nenhuma fatura** — fatura excluída, compras presentes.
- **27** só no banco (Σ R$ 15.129,26): liquidadas/excluídas entre a exportação e a leitura (não conferido
  uma a uma).

### 4.4 Contas a receber — paridade completa no mês testado

Vencimento em set/2026 (arquivo de 16/11). API `transaction_kind=credit`, os 4 status: 1.510 contas.

- **1.297/1.297** títulos do banco presentes; **1.296** com o mesmo valor; **1.297** com a mesma liquidação.
- As **213** só na API são **todas canceladas** — o relatório não traz cancelada (regra: `canceled = false`).
- **"Conferido" é, pela definição, o campo personalizado de conta nº 25** (`/custom_fields?resource=bills`: nome
  "Conferido", escolhas Sim, Pendente, Enviado para o banco, Inadimplente — o domínio fechado da base). O **valor
  por título não foi comparado** com o arquivo. Vem **só no detalhe** e muda com o tempo (é a marcação de
  inadimplência), então exige reler o detalhe ou um sinal de mudança (§5).
- Pessoa e Operação Própria também só no detalhe (`person{id}`, `operation{id}`).

### 4.5 Lançamentos por Operação (hoje via RPA) — vínculo reconstruído 10/10

10 lançamentos sorteados da base (5 sem venda, 5 com venda), buscados por `/bills?number=`:

- **10/10 encontrados**, 9 com o mesmo valor; o décimo é **um item** de uma fatura de fornecedor (o valor está
  em `items[]` — granularidade de item, coberta por `/bill_items`).
- Sem venda: **`bill.operation.id` = `Operacao_Id` da RPA em 5/5.**
- Com venda: a conta não traz a operação; a **operação da venda** (no espelho, `raw.operation.id`) é igual ao
  `Operacao_Id` da RPA em **5/5**.
- Ou seja, a tela "Análise de Operações" que a RPA raspa é reconstruível do espelho de contas + espelho de vendas.
  **Amostra pequena**: a paridade de soma por operação (237 operações, 26.996 lançamentos) não foi medida.

### 4.6 Pessoas — os campos agora existem

Colunas do upload (17) × lista de `/people`: nome (`name`), razão social (`legal_name`), CPF/CNPJ (`cpf_cnpj`
+ `person_kind`), CEP/endereço/número/complemento/bairro (`address.*`), IE (`rg_ie`), IM (`city_inscription`),
e-mail, telefone, celular; cidade em `address.city{id}` → UF e país em `/cities/{id}` (cacheável).
**17/17 com campo.** Paridade de conteúdo **não medida**. Custo: a base tem 66.052 pessoas → ~1.320 páginas,
~29 min a 1,3 s, **sem filtro incremental** (pedido 5c da pauta segue aberto).

### 4.7 Demonstrativo de Resultado (competência) — não substituível hoje

Não há rota de demonstrativo/DRE. O caminho seria **reconstruir** a partir de vendas (receita) + contas por
competência com categorias e grupos — exatamente o que a investigação de 27/07 testou e classificou como
**PARCIAL** (`docs/investigacoes/2026-07-27-dre-competencia-api-monde.md` e o delta). O que mudou desde então:
`/category_groups` e `categories.kind` agora existem (facilitam montar Tipo/Grupo/Descrição), mas a regra de
reconhecimento por competência continua sendo nossa. **Não reavaliado aqui.**

---

## 5. Custo e arquitetura — onde está a restrição real

**A restrição não é campo faltando: é chamada por título.** Categoria, pessoa, operação e "Conferido" só vêm
em `/bills/{id}`, e contas **não têm `updated_since`**.

| Item | Volume | Tempo a 1 chamada/1,3 s | No limite oficial (~3/s) |
|---|---|---|---|
| Backfill do detalhe de contas 2024–2026 (Movimentação) | ~55 mil títulos | ~20 h (uma vez, diluído nos ticks) | ~5 h |
| Detalhe diário de contas liquidadas | ~1.000 num dia cheio | ~22 min/dia | ~6 min/dia |
| Lista de contas em aberto (posição diária) | 253 páginas | 5,6 min | ~1,5 min |
| Contas a receber, backfill do detalhe | ~37 mil | ~13 h (uma vez) | ~3,5 h |
| Pessoas, leitura completa | ~1.320 páginas | ~29 min | ~8 min |

Desenho que os números sugerem (decisão técnica de uma versão futura, não deste estudo):

1. **Um espelho de contas** (`monde.conta` + categorias + itens), alimentado por lista por data e detalhe só de
   conta nova ou alterada — o mesmo padrão "cabeçalho como índice de mudança" que a v6.2.0 usa em vendas. Ele
   serve **quatro** bases de uma vez (Movimentação, Aberto, Contas a receber, Operação).
2. **Sinal de mudança em contas** (porque não há `updated_since`), em ordem de preferência:
   **webhooks** `bills.*` (exige permissão e rota HTTPS no Janus), **`/logs`** (`kind=edition`, `resource_id`
   — provado que registra as edições de hoje; falta provar a ordem e o custo do feed global) ou hash da linha da
   lista (não pega edição só de categoria/"Conferido").
3. **Vendas:** trocar a varredura por `created_at` + revisita diária por **`updated_since`** (mais barato e sem o
   atraso de ~1 dia), e — com a permissão — `/reports/sales_by_products` para a base de Vendas.
4. **Produto Visto (`visas[]`, 05/11):** `TIPOS_PRODUTO` (`src/lib/monde/transform.ts:107`) lista 12 arrays e
   **não tem `visas`** — o item de uma venda com visto ficaria fora do espelho em silêncio (o total da venda
   não). Hoje **nenhuma** venda espelhada traz `visas` no `raw` (conferido no banco): risco latente, não ativo.

---

## 6. Achados de segurança e governança

- **A chave lê muito mais do que o Janus usa:** contas a pagar/receber com observações, movimentações bancárias,
  notas fiscais, `/logs` (histórico de quem alterou o quê), pessoas com documentos. O manual adverte que a chave
  pode ver "o financeiro inteiro, inclusive salários e cartões salvos de clientes".
- **Desde out/2026 a API grava** (vendas, contas, liquidação, pessoas). **Não testamos escrita** (só `GET`).
  Vale conferir, na tela da credencial no Monde, que a chave do Janus tem **só permissões de visualizar** — o
  FAQ oficial confirma que, assim, toda gravação responde 403.
- **Não há sandbox:** a API atende a base de produção da agência.
- O relatório de vendas por produto **registra cada página como exportação** no Histórico do Monde (traz contato
  e documento do pagante).

---

## 7. Recomendações (decisões são do Yan)

1. **Permissões a pedir na credencial** (todas de leitura): "Vendas por Produto" + "Consultar vendas de outros
   vendedores/intermediários" + "Visualizar comissão, over e receitas" (recurso Vendas por Produto) — destrava
   a prova da base de Vendas e o Scope B; **Webhooks** — sinal de mudança para contas; opcional "Vendas por
   Vendedor". E **conferir que nenhuma permissão de gravação está marcada**.
2. **Não desligar nenhum upload agora.** A paridade é forte, mas é de amostra (um dia, um mês, dez lançamentos);
   a troca de fonte segue o protocolo de sempre: estrutura paralela + oráculo contra o arquivo do mesmo dia por
   algumas semanas antes de aposentar.
3. **Ordem sugerida, por retorno/risco:**
   (a) `updated_since` no espelho de vendas (patch técnico, ganho imediato);
   (b) base de **Vendas** via relatório, após a permissão (fecha Scope B: receita por produto, prejuízo por
   produto, Weddings);
   (c) **espelho de contas** → Aberto e Contas a receber primeiro (posição, verificáveis por lista), depois
   Movimentação e **Operação** (aposenta a RPA);
   (d) **Pessoas** (simples, mas é leitura completa por falta de incremental);
   (e) Demonstrativo fica no upload até uma reavaliação dedicada.
4. **Atualizar a pauta ao fornecedor:** itens 1, 2, 4, 5a e 6 resolvidos; restam **5c** (incremental em pessoas),
   **`updated_since` em contas** (novo, é o que mais pesa) e o item 7.
5. Texto desatualizado no repositório: o parágrafo do Scope B no `docs/WORKING-CONTEXT.md` ("operação… só 17%",
   "`people` expõe 5 dos 17 campos") descreve a API antiga.

---

## 8. O que ficou não-verificado

- Paridade da base de **Vendas** (403 no relatório).
- Catálogo exato de eventos de **webhook** (403 em `/webhook_events`; o OpenAPI só dá exemplos).
- Resíduo de R$ 7.748,71 nas faturas de cartão de 15/10 (§4.2) e os 27 títulos de Aberto só no banco.
- Movimentação: colunas `Conta`, `Data de movimentação`, `Pessoa` e `Grupo de Categoria`; regra de sinal em conta
  de débito com categoria de receita; as 3 linhas de movimento futuro.
- Aberto: 16 das 18 diferenças de valor (só 2 conferidas no `/logs`).
- Contas a receber: o valor de "Conferido" título a título (a ligação ao campo nº 25 é pela definição).
- Paridade de **soma por operação** e de conteúdo de **Pessoas**; ordem e custo do feed global de `/logs`.
- Se o ritmo pode subir de 1/1,3 s para perto do limite oficial sem 429 (em set/2026, 2–4/s levaram 429).
- Escrita: deliberadamente não testada.
