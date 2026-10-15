# v6.4.0 · M-1 — A API v3 do Monde substitui algum upload manual?

Medido em **15/10/2026, 11h18–11h58 (SP)**, **só leitura**. Contra:

- **API oficial v3** (`https://web.monde.com.br/api/v3`), com a mesma chave do cron `monde-incremental`;
- **produção**, via `SUPABASE_DB_URL` com `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` como
  primeiro comando, só SELECT.

Termo de comparação: as cargas que a **RPA fez hoje** (`ingestao.carga`, origem `rpa-pad`). Demonstrativo extraído
às 10h31, Operação às 10h14, Vendas às 11h00, Movimentação e Aberto às 11h05. A exceção é Pessoas, carga
manual de **30/06/2026**.

Scripts de sondagem e payloads crus ficaram **fora do repositório** (§8). Nenhum
payload, nome de pessoa, documento, conta bancária ou portador de cartão aparece neste relatório: tudo é
contagem, soma ou nome de categoria/campo.

## 0. Resposta curta

| # | Base | Cobertura pela API | Recomendação |
|---|---|---|---|
| 7 | **Contas a receber** (nova, GATE 1) | **Total** na lista fechada, inclusive o `Conferido` (oráculo ao centavo). Falta a coluna `Operação Própria`, não localizada | **Vir da API, na própria v6.4.0**, se o Yan aceitar o escopo de leitura do `Conferido` (§4.7, §6) |
| 6 | Pessoas | **Total** nas 12 colunas comparadas (11 iguais em 42/42; a API tem Razão Social que o export não tem) | **Substituir em versão própria** (é a base mais velha: 30/06) |
| 2 | Vendas por Produto | **Parcial.** Cabeçalho exato (656/660 receitas iguais, 5 diferenças explicadas); receita **por item** não é nativa (fórmula reproduz 87% das vendas de 1 item) | **Manter o upload** até o fornecedor dar a regra da receita por item. O cabeçalho já vem do espelho |
| 4 | Lançamentos — Aberto | **Total no título** (13.830/13.843 ≥ 2026 e 325/325 vencidos, ao centavo); categoria/rateio só no detalhe (1 chamada por título) | **Manter o upload** (RPA diária). Candidato a versão própria se a RPA pesar |
| 3 | Lançamentos — Movimentação | **Parcial.** Título liquidado bate (16.915/16.915 na data, 16.805 no valor); o relatório é **por movimento** e omite 637 títulos liquidados em 2026 (faturas de cartão e, pela amostra, títulos pagos com cartão; §4.3) | **Manter o upload** (e ver o achado ⚠️ da §4.3 sobre a DRE de caixa) |
| 1 | Demonstrativo (competência) | **Nenhuma** como relatório (sem endpoint). Metade "categoria" reproduzível por título × rateio × emissão (79 de 81 pares explicados ao centavo); receitas da venda **não** ao centavo | **Manter o upload** |
| 5 | Lançamentos por Operação | **Nenhuma.** Sem endpoint de "Análise de Operações"; o título ligado à venda vem com `operation: null` | **Manter a RPA** |

### Matriz

Custos a 1,3 s por chamada; "lista" = 50 itens por chamada; "detalhe" = 1 chamada por item.

#### 7 · Contas a receber

- **Cobertura:** total.
- **Campos ausentes:** `Operação Própria`.
- **Carga completa:** lista em aberto ~281 ch (~6 min) + detalhe dos a receber: 183 vencidos (~4 min) ou 4.821 em aberto (~1h45).
- **Incremental:** lista inteira (~6 min) + detalhe do que mudou ou importa.
- **Detecção de mudança:** hash da lista pega valor, vencimento, liquidação e cancelamento. **`Conferido` só relendo o detalhe.**
- **Oráculo:** inadimplentes 2026 **20 · 195.708,79 = amostra**; 17.704 × 17.707 títulos; Δ R$ 68.988,28 não enumerado (arquivo fora da máquina).
- **Risco:** `Conferido` a vencer não lido; chave compartilhada com o cron.

#### 6 · Pessoas

- **Cobertura:** total.
- **Campos ausentes:** nenhum. Cidade/UF/País via `/cities` (só documentado).
- **Carga completa:** ~1.283 ch (~28 min) + cidades.
- **Incremental:** não existe; releitura completa.
- **Detecção de mudança:** nenhuma (ordem por nome, sem `updated_at`).
- **Oráculo:** 11 campos 42/42; Razão Social: a API tem 23 que o export não tem.
- **Risco:** volume de dado pessoal.

#### 2 · Vendas por Produto

- **Cobertura:** parcial.
- **Campos ausentes:** receita **por item** nativa.
- **Carga completa:** já paga pelo espelho.
- **Incremental:** espelho (15 min).
- **Detecção de mudança:** a da v6.2.0 (hash do cabeçalho).
- **Oráculo:** 656/660 receitas e 659/660 valores; 6 + 25 + 5 diferenças explicadas.
- **Risco:** mix por produto e Weddings dependem da receita por item.

#### 4 · Aberto

- **Cobertura:** total no título; rateio só no detalhe.
- **Campos ausentes:** nenhum.
- **Carga completa:** lista ~6 min + rateio 14.031 detalhes (~5h).
- **Incremental:** lista + detalhe de novos ou alterados (~60–110 por dia).
- **Detecção de mudança:** edição de rateio invisível na lista.
- **Oráculo:** 13.830/13.843 (≥ 2026) e 325/325 (vencidos) ao centavo; resto enumerado.
- **Risco:** faturas de cartão (169 + 28) estão na API e não no export. Decidir se entram.

#### 3 · Movimentação

- **Cobertura:** parcial.
- **Campos ausentes:** o movimento com categoria só via título (detalhe).
- **Carga completa:** ~51,6 mil detalhes (~18h).
- **Incremental:** liquidação nova em título antigo exige a lista inteira.
- **Detecção de mudança:** hash da lista de títulos.
- **Oráculo:** 16.915/16.915 na data, 16.805 no valor; 110 parcelados; 637 liquidados fora do relatório.
- **Risco:** ⚠️ DRE de caixa × cartão (§4.3).

#### 1 · Demonstrativo

- **Cobertura:** nenhuma (sem endpoint).
- **Campos ausentes:** o relatório inteiro.
- **Carga completa:** ~2 mil detalhes por mês emitido + regra das linhas da venda.
- **Incremental:** edição de rateio invisível.
- **Detecção de mudança:** —
- **Oráculo:** 67/81 pares iguais; 12 das 14 diferenças explicadas pela API; receitas da venda não fecham (só Desconto).
- **Risco:** regra das 13 linhas da venda desconhecida.

#### 5 · Operação

- **Cobertura:** nenhuma.
- **Campos ausentes:** endpoint inexistente.
- **Carga completa / incremental / detecção de mudança:** —
- **Oráculo:** 3 títulos lidos: `operation` null.
- **Risco:** —

**Orçamento:** declarado 1.500 chamadas; usadas **1.234**; **0 × 429** (sonda e cron). Ritmo de 1 chamada a
cada 1,5 s. Nenhuma chamada nas janelas dos ticks (`:14:30`–`:01:30` de cada quarto de hora) nem nas
horas de revisita pesada (04–09h e 15–20h, §1). Ticks do cron durante a sondagem: todos `ok`, 0 × 429.
Espelho antes: `ultima_sincronizacao` 11h00 (SP), 30.314 vendas, `max_data` 15/10. Depois: ticks de 11h15,
11h30 e 11h45 `ok` (7, 11 e 14 chamadas, 0 × 429), `ultima_sincronizacao` 11h45, 30.314 vendas, `max_data`
15/10. **O espelho não ficou para trás.**

## 1. Salvaguardas da sondagem

- **Mesma chave do cron.** Duração dos ticks de `monde-incremental` nos 4 dias anteriores, por hora (SP):
  6–27 s fora da revisita; até 232 s e 169 chamadas entre **04–09h e 15–20h**. A sonda só rodou fora
  dessas horas e pausava em volta de cada tick.

  ```sql
  select extract(hour from iniciado_em at time zone 'America/Sao_Paulo') h, count(*), max(duracao_ms)/1000 max_s,
         round(avg(duracao_ms)/1000) avg_s, sum((resultado->'api'->>'c429')::int) c429
  from ingestao.execucao where processo like 'monde%' and iniciado_em > now()-interval '4 days' group by 1 order by 1;
  ```
- Orçamento persistido em disco, parada no 1º 429 (não houve) e nenhuma chamada concorrente: um lote por vez.
- **Documentação oficial** (`web.monde.com.br/api-docs`): exige login do Monde e respondeu HTTP 400 sem
  sessão. **Não foi lida.** O "documentado" deste relatório é o manual de terceiros já usado na v6.2.0
  (`ttars.vercel.app/api-do-monde.html`, testes de 25/09/2026). Toda afirmação que sustenta uma
  recomendação foi conferida por chamada.

## 2. Inventário de endpoints

✅ = confirmado por chamada nesta M-1 · 📄 = só documentado (manual de terceiros) · ❌ = chamado, não existe.

| Recurso | Estado | O que a chamada mostrou |
|---|---|---|
| `GET /bills` | ✅ | Lista com 25 campos: `id, number, transaction_kind, kind, description, document, invoice_number, amount, final_amount, issue_date, due_date, settlement_date, created_at, canceled, checked, invoice_closed, system_generated, generates_credit, periodicity, recurrence_kind, recurrence_group_id, observations, billet, check, card`. **Sem `custom_fields`, sem categorias, sem pessoa.** Filtros aceitos: `status` (400 lista `open, overdue, settled, canceled`; padrão = só abertos), `kind` (400 lista 8 valores), `transaction_kind`, `number` (devolve exatamente 1). **Ignorados sem erro:** `due_date_start/end`, `updated_since`, `synced_since`, `order` (mesmo cursor da lista sem filtro). Ordem: **vencimento decrescente** (0 inversões em 36.453 títulos) |
| `GET /bills/{id}` | ✅ | Acrescenta `categories[{category{id}, amount}]` (rateio), `custom_fields[{id, value}]`, `items[{sale, sale_product, amount, checked, …}]`, `person`, `company`, `account`, `payment_method`, `operation`, `apportionments.per_cost_center`, `movements[{id}]`, `credit_card_items`, `attachments`, `commissions`. **404 para 2 de 183** títulos presentes na lista (`{"errors":["O recurso solicitado não foi encontrado."]}`) |
| `GET /custom_fields?resource=bills` | ✅ | 6 definições. **`id 25 · Conferido · choices · Sim / Pendente / Enviado para o banco / Inadimplente`**. Também `id 28 · Pendente com:` (escolhas = nomes de colaboradores, não reproduzidos), `id 17 · Projeto`, e 3 inativos. `resource` aceita `bills, people, sales, tasks, travels` (400) |
| `GET /categories`, `/categories/{id}` | ✅ | 135 categorias (105 `expense`, 30 `revenue`, 5 `pass_through`). A lista traz `id, description, kind, pass_through`; o **grupo só vem no detalhe** (`group{id, name}`, 15 grupos) |
| `GET /account_movements`, `/{id}` | ✅ | Lista: `id, date, amount, transaction_kind, description, check, card` (sem conta, sem título). Detalhe: `account, payment_method, bill, credit_card_invoice, counterpart_account`. Ordem por data decrescente, inclusive datas futuras |
| `GET /accounts` | ✅ | 89 contas (62 `card_account`, 18 `checking_account`, 9 `cashier_account`), 2 páginas |
| `GET /refunds`, `/{id}` | ✅ | Lista `id, refund_type, amount, description, issue_date, due_date`; detalhe + `sale, sale_product, person, company, bill` |
| `GET /cost_centers`, `/payment_methods` | ✅ | 12 e 11 itens, 1 página |
| `GET /people` | ✅ | Lista com 30 campos (inclui `cpf_cnpj`, `legal_name`, `rg_ie`, `city_inscription`, `address{…, city{id}}`). **Ordem alfabética por nome** (o cursor começa pelo nome), não por criação. Filtro `name` funciona (nome inexistente → lista vazia) |
| `GET /sellers` | ✅ | Existe, paginado |
| `GET /sales`, `/sales/{id}` | ✅ | O que o espelho já usa (v6.2.0) |
| `GET /travels` | ✅ | **Não documentado**; existe (3 itens). Sem campos personalizados |
| `GET /custom_fields?resource=sales / people` | ✅ | 11 e 6 definições |
| `GET /cities/{id}` | 📄 | Não chamado. Necessário para Cidade/UF/País de Pessoas |
| `GET /receivables`, `/payables`, `/financial_categories`, `/income_statements` | ❌ | 404 |

### Comportamentos transversais medidos

1. **Nenhuma lista filtra por data e não há "alterado desde".** Os filtros de data são aceitos e
   ignorados, sem erro. Isso confirma a v6.2.0 e vale também para `bills`.
2. **A natureza do título é `transaction_kind`** (`credit` = a receber, `debit` = a pagar). O `kind` não
   serve para isso: na amostra há `customer_invoice` em débito, `vendor_invoice` em crédito (comissão a
   receber de fornecedor) e `credit_card_invoice` nos dois.
3. **Valores vêm como float.** `amount ≠ final_amount` em 9.842 títulos de 2026, exatamente o número de
   linhas `Valor ≠ Valor Final` da amostra de 15/10.
4. **`number` = o `Número` dos relatórios** (provado: 325/325 e 13.830/13.843 casam por ele). Pode ter
   sufixo de parcela (`206742-10`).
5. **Liquidação futura existe**: há títulos com `settlement_date` posterior a hoje, até 20/01/2027
   (pagamento programado).
6. **Liquidação com data retroativa**: 6 títulos que o export de 15/10 11h05 mostrava em aberto constam na
   API liquidados em 13/10. Sem `updated_at` não se sabe quando a baixa foi lançada. Uma foto diária pela
   API registra a liquidação na data informada, não no dia em que ela apareceu.
7. **Detalhe e lista podem divergir**: 2 de 183 títulos listados deram 404 no detalhe (já registrado na v6.2.0
   para vendas).

## 3. Detecção de mudança sem `updated_at`

O padrão da v6.2.0 (hash do payload da lista, depois detalhe só do que mudou) **funciona para o que está
na lista**: valor, vencimento, liquidação, cancelamento e `checked`. **Não funciona para o que só existe
no detalhe**: `Conferido`, categorias/rateio, pessoa, conta. Quando o Financeiro troca a marcação de
`Pendente` para `Inadimplente`, a lista do título não muda. Só reler o detalhe mostra a mudança.

Consequências:

- para títulos, a carga incremental relê a **lista** inteira do recorte (é barata: 50 por chamada) e o
  **detalhe** de tudo cujo campo-só-de-detalhe importa;
- para pessoas, a lista vem em ordem de nome, então pessoa nova não aparece "no topo". A incremental é reler
  tudo.

## 4. Base a base

Custos a **1,3 s/chamada** (o limite medido). Um tick do cron tem `maxDuration` 300 s ≈ 180 chamadas.

### 4.7 Contas a receber (base nova, GATE 1)

**Mapa da lista fechada do briefing (§3):**

| Coluna do export | Campo da API | Onde |
|---|---|---|
| `Número` | `number` | lista |
| `Emissão` | `issue_date` (0 nulos nos 17.704; o export tinha 5 inválidos) | lista |
| `Pessoa` | `person.id` → `/people/{id}` (ou cache `monde.pessoa`) | detalhe |
| `Descrição` (categoria) | `categories[].category.id` → `/categories`; **é rateio**: um título pode ter várias categorias com valor próprio | detalhe |
| `Vencimento` | `due_date` | lista |
| `Liquidação` | `settlement_date` | lista |
| `Valor Final` | `final_amount` (`amount` = `Valor`) | lista |
| `Conferido` | `custom_fields[id=25].value` (ausente = vazio) | detalhe |
| `Operação Própria` | **não localizada** em lista nem detalhe de título | — |
| natureza a pagar/receber | `transaction_kind` | lista |

`Observações`, `Pendente com:`, `Documento` e `Conta (Previsão)` também existem na API (`observations`,
`custom_fields[28]`, `document`, `account`) e ficam fora pela mesma regra do invariante 5.

**Oráculo contra a amostra de 15/10** (vencimento 01/01–15/10/2026, dados do briefing §3):

| Medida | Export 15/10 | API 15/10 ~11h30 | Diferença |
|---|---|---|---|
| títulos (sem cancelados) | 17.707 | **17.704** | 3 |
| Σ `Valor Final` com sinal | −10.118.191,87 | −10.049.203,59 | 68.988,28 |
| `Valor ≠ Valor Final` | 9.842 | **9.842** | 0 |
| Inadimplente, em aberto, venc. 2026 | 20 · 195.708,79 | **20 · 195.708,79** | **0** |
| Inadimplente, em aberto, todos os anos | — (export só 2026) | 21 · 199.767,74 | +1 título de 2025 (4.058,95) |

A diferença de 3 títulos e R$ 68.988,28 **não foi enumerada título a título**: o arquivo de 15/10 ficou no
Chat e não está nesta máquina. Candidatos medíveis: títulos cancelados ou liquidados entre o export e a
sondagem, e títulos criados hoje (17 com `created_at` 15/10). Com o arquivo, a conciliação é por `number`.

**A receber vencido e em aberto**, pela natureza da API, com vencimento de 01/01 a 14/10/2026: **166 títulos,
R$ 864.923,44**, contra 117 títulos e ~R$ 688 mil na análise do Chat. A diferença é de classificação: a API
conta como a receber **67 títulos `vendor_invoice` de crédito** (categoria "Comissão": comissão a receber de
fornecedor), que a classificação por descrição deixava de fora. Distribuição do `Conferido` nos 181
detalhes lidos (183 − 2 com 404):

| Conferido | todos os vencidos | venc. 2026 |
|---|---|---|
| Inadimplente | 21 · 199.767,74 | 20 · 195.708,79 |
| Pendente | 127 · 552.448,90 | 114 · 476.328,83 |
| (vazio) | 28 · 141.459,55 | 27 · 137.192,34 |
| Sim | 5 · 55.693,48 | 5 · 55.693,48 |

Isso decide **o que a página chama de "a receber"**, uma pergunta de produto (ver §6).

**Custo:**

- Lista de tudo em aberto (14.031 títulos): ~281 chamadas ≈ **6 min**.
- Detalhe dos 183 a receber vencidos (`Conferido`): ≈ **4 min**.
- Detalhe de todos os 4.821 a receber em aberto, inclusive a vencer: ≈ **1h45**.
- Títulos novos: ~60–110 por dia útil (`created_at` de outubro).
- Uma foto diária "lista + vencidos" ≈ 470 chamadas ≈ 10 min ≈ 3 invocações de 300 s, intercaladas com o
  cron na mesma chave.

**Risco:** o `Conferido` de título **a vencer** não foi lido (4.638 títulos). Na amostra de 15/10 todos os
marcados estavam vencidos, mas nada impede marcar antes do vencimento. A cobertura total custa ~1h45 por
leitura.

### 4.6 Pessoas

**Mapa:**

| Coluna | Campo |
|---|---|
| Nome | `name` |
| E-mail | `email` |
| Telefone | `phone_number` |
| Celular | `mobile_number` |
| Razão Social | `legal_name` |
| Endereço | `address.street` |
| Número | `address.street_number` |
| Complemento | `address.additional_info` |
| Bairro | `address.neighborhood` |
| CEP | `address.postal_code` |
| CPF / CNPJ | `cpf_cnpj` (+ `person_kind`) |
| Inscrição Estadual | `rg_ie` (para PF é o RG) |
| Inscrição Municipal | `city_inscription` |
| Cidade / UF / País | `address.city.id` → `/cities/{id}` (só documentado; não chamado) |

**Oráculo** (1ª página da lista, 50 pessoas; 42 casadas por nome, 8 nomes ambíguos):

- **11 campos iguais em 42/42.**
- Razão Social difere em 23, todos PJ em que **a API tem `legal_name` e o `raw.pessoas` está vazio** (nunca o contrário).
- 23 das 50 têm cidade.

**Custo:**

- 64.104 pessoas ≈ 1.283 chamadas ≈ **28 min**, mais `/cities/{id}` por cidade distinta (com cache).
- Incremental: não existe (ordem por nome, sem `updated_at`), então é uma releitura completa por noite ou por semana.

**Risco:** volume de dado pessoal. Mas a base já guarda esse dado hoje.

### 4.2 Vendas por Produto

O espelho (`monde.venda`, cron de 15 min) **já é** a API v3 por venda. Oráculo de set/2026, Excel (RPA
11h00) × espelho:

```sql
-- por venda: Σ receitas do Excel × totals.revenue do payload; Σ valor_total × itens ativos
with xl as (select venda_numero::text vn, sum(valor_total) vt, sum(receitas) rec
            from raw.vendas_excel where data_venda >= '2026-09-01' and data_venda < '2026-10-01' group by 1), …
```

- Nos dois lados: 660 vendas.
  - **Receita igual em 656**.
  - **Valor total igual em 659**.
- **6 só no Excel**: todas do setor Welcome, que o espelho exclui por desenho.
- **25 só no espelho**: 12 canceladas e 13 sem item ativo. O relatório não traz nenhuma das duas.
- **5 diferenças**:
  - 2 de arredondamento de 1–2 centavos (o Excel soma o valor arredondado por item);
  - 2 em que o `totals.revenue` do cabeçalho inclui a receita de um item cancelado;
  - 1 em que o Excel lista um item que a API marca cancelado (valor 35.300,00 × 33.319,53, receita igual).
- **Receita por item** (a lacuna da v6.0.0):
  - Continua **sem campo nativo**. O espelho rateia o cabeçalho.
  - A fórmula `commission_amount + over_amount + totals.agency_fee + totals.rav_fee + totals.du_fee − totals.discount − cc_rav_fee − agency_card_rate` reproduz **417 de 479** vendas de item único (87%).
  - Os resíduos se concentram em produto customizado/operação própria (`unit_fee`), com resíduos redondos (−300, −500).

**Custo:** zero adicional (o espelho já paga). **Recomendação:** manter o upload enquanto
`fato_venda_item.receitas` tiver consumidor (mix por produto, Weddings). Trocar exige ou a regra do
fornecedor, ou a decisão de produto de aceitar o rateio.

### 4.4 Lançamentos por Categoria — Aberto

Oráculo de população inteira contra a carga de 11h05:

```sql
select numero::text, min(vencimento), sum(valor) from raw.titulos_em_aberto group by 1;  -- × /bills status=open,overdue
```

- **Vencidos** (`status=overdue`, 353 títulos, mais antigo 01/11/2024 = mínimo do export):
  - **325/325 iguais ao centavo** (`final_amount` com sinal = Σ linhas);
  - **28 só na API**, todos **faturas de cartão** (`credit_card_invoice`, venc. 15/09, R$ 617.556,28);
  - **7 só no export**, débitos com vencimento 10–14/10:
    - 6 constam na API como **liquidados em 13/10**, data anterior ao export (15/10 11h05). O mais provável
      é baixa lançada depois do export com data retroativa, o que não dá para provar sem `updated_at`;
    - 1 teve o vencimento **alterado para 23/10** (em aberto, não vencido).
- **Vencimento ≥ 2026** (14.013 em aberto na API):
  - **13.830 iguais ao centavo**;
  - **176 só na API**: 169 faturas de cartão, 4 `customer_invoice`, 3 `vendor_invoice`;
  - **12 só no export**:
    - 7 liquidados na API (6 com data 13/10, como acima; 1 em 15/10);
    - 5 que a varredura ≥ 2026 não trouxe. Não foram lidos: hoje vencem antes de 2026 ou foram excluídos.
  - **1 com valor diferente**: título 210499 (débito `vendor_invoice`, venc. 13/12/2026), lido no detalhe. Os
    dois lados têm o mesmo par de categorias com valores diferentes:
    - API: −98.906,31 = Pagamento ao Fornecedor −100.063,62 + Reembolso Fornecedor − C 1.157,31;
    - export: −91.608,42 = −92.302,02 + 693,60.

    É uma edição do título. Se ocorreu entre 11h05 e a sondagem, não dá para provar (não há `updated_at`).
  - **6 em aberto na API fora do recorte "≥ 2026" do export**:
    - 4 com vencimento **2049** na API (data-placeholder) e **vencimento vazio** no export;
    - 2 com vencimento 31/12/2025, que entraram porque a varredura para só depois de passar de 01/01/2026.

    Fecham a conta: 14.013 = 13.830 + 1 + 176 + 6.
- **Granularidade:** o export é **(título × categoria do rateio)**, 2,5 linhas por título. 4.628 títulos
  têm linhas de sinais opostos. A API dá o título na lista e o rateio só no detalhe.

**Custo:**

- Lista ≈ 6 min.
- Rateio de todos os 14.031 ≈ **5h** por carga completa.
- Incremental pelo hash da lista: ~60–110 detalhes por dia. Mas mudança de rateio não aparece na lista.

**Recomendação:** manter o upload, que a RPA já faz todo dia. Em versão própria, só se a RPA virar problema.

### 4.3 Lançamentos por Categoria — Movimentação

- Os **16.915 títulos com vencimento ≥ 2026** do export estão **todos liquidados na API**.
  - **Data de liquidação igual em 16.915/16.915.**
  - **Valor igual em 16.805.**
- **110 com valor menor no export** (Σ −548.648,28): títulos pagos em parcelas iguais. O relatório traz uma
  fração dos movimentos e a fração bate com o nº de linhas (2/5, 8/10, 8/12, 7/10, 7/10 movimentos nos 5
  inspecionados).
- **637 liquidados na API ausentes do export**:
  - 261 faturas de cartão;
  - 3 com liquidação fora da janela do export (02/01/2024–23/11/2026);
  - **373 que a janela não explica**: 310 liquidados antes de outubro, 240 `vendor_standalone`, 90 `normal`.
  - **Mecanismo (amostra, não população):** pagamento com **cartão**. A `account` do título é a conta
    **prevista** (a coluna `Conta (Previsão)` do export) e engana. Em 9 de 12 títulos sorteados ela é conta
    corrente, e as contas dos 12 estão no export. Mas o **movimento** real (`/account_movements/{id}`) está
    em `card_account` e aponta um `credit_card_invoice` em **6 de 6 movimentos lidos**. Os 367 restantes não
    tiveram o movimento lido. A generalização é hipótese (pergunta 9 ao fornecedor).
  - A fatura de cartão (`credit_card_invoice`, 261 liquidadas) também não aparece no relatório (população).
- ⚠️ **Fora do escopo, para o Yan:** se nem a despesa paga com cartão nem a fatura entram no relatório, a DRE
  de caixa (que lê `fato_fluxo` ← Movimentação) pode estar **sem a despesa paga com cartão**. A amostra de
  setembro tem R$ 560 mil de Repasse e ~R$ 61 mil de despesas de categoria nessa situação. Não foi medido
  contra a DRE nesta M-1; vale uma investigação própria.

**Custo:**

- Movimentação desde 2024: 51.625 títulos com rateio ≈ **18h** de detalhe.
- O extrato (`/account_movements`) dá data e valor, mas a categoria só via título → detalhe.
- Incremental: liquidação nova em título antigo exige reler a lista inteira de títulos.

**Recomendação:** manter o upload.

### 4.1 Demonstrativo de Resultado (competência)

Não há endpoint (`income_statements` 404). Teste de reprodução em set/2026 com os dados já carregados
(lançamentos movimentação ∪ aberto, por **emissão** em set/2026, × Demonstrativo):

```sql
-- pares (grupo, descrição) do Demonstrativo × Σ valor dos lançamentos com emissão em set/2026, por (grupo_categoria, categoria)
```

- **Pares de categoria: 67 de 81 iguais ao centavo** (−823.802,75); 14 diferentes (13 nos dois lados + "Material
  de Informática" só no Demonstrativo).
  - 11 pares com o Demonstrativo **mais negativo** (Σ −61.099,87), entre eles Pagamento ao Fornecedor –
    Operação própria −44.461,61 e Licença de Software (Comercial) −8.462,55.
  - "Receita de Vendas / Comissão": Demonstrativo 21.792,70 × lançamentos 257.969,37.
  - "Acréscimos Cobrados": 133,19 × 1.245,42.
  - **12 das 14 diferenças se explicam ao centavo pela API.** As 11 despesas acima e "Material de
    Informática" (−50,89, só no Demonstrativo) são, exatamente, a soma do rateio dos **títulos emitidos
    em set/2026 que a API tem e os dois exports de Lançamentos não têm** (população: os 110 não-fatura
    lidos no detalhe; 80 com conta prevista corrente, 30 conta-cartão). Ou seja, o Demonstrativo enxerga
    títulos que os exports de Lançamentos omitem. Que o motivo seja o pagamento com cartão é a amostra da
    §4.3 (6 de 6), não a população.
  - **2 não explicadas:** "Receita de Vendas / Comissão" (lançamentos 236.176,67 acima, provavelmente porque o
    Demonstrativo leva parte da comissão para "Receitas da venda / Comissão", 192.228,80, sem fechar a soma)
    e "Acréscimos Cobrados" (lançamentos 1.112,23 acima).
  - Pela API, a metade "categoria" do Demonstrativo é **título × rateio × `issue_date`**. Custa o detalhe de
    cada título emitido no mês (~2 mil/mês ≈ 45 min/mês; a incremental não vê edição de rateio).
- **Receitas da venda** (8 pares) e **Descontos da venda** (5 pares): vêm da venda, não de categoria.
  - **Desconto bate ao centavo** com `totals.discount` (−237.883,97).
  - Os demais não fecharam por `sale_date` nem por `issue_date` do produto, com ou sem cancelados. Ex.: Over
    35.849,00 fica entre 33.817,70 (ativos) e 36.389,27 (ativos + cancelados); Taxa RAV 74.034,16 × 67.002,42;
    Comissão 192.228,80 × 196.579,99.
- Pass-through (Entrada de clientes, Pagamento ao Fornecedor/Repasse, Reembolso / Carta de Crédito, Movimentação
  de Caixa) **não entra** no Demonstrativo.

**Recomendação:** manter o upload. Reproduzir exige a regra das 13 linhas da venda (pergunta ao fornecedor) e o
detalhe de ~2 mil títulos por mês emitido.

### 4.5 Lançamentos por Operação

- Não há endpoint de "Análise de Operações".
- Nos 3 títulos de lançamentos de operação de 14/10 lidos pela API (`number` = `Lançamento N°`), `operation`
  vem **null**. O vínculo com a operação é da venda (`sale.operation`) e o recorte da tela não é reproduzível
  sem a regra.
- 1 título avulso (despesa) tinha `operation.id`.

**Recomendação:** manter a RPA.

## 5. Nomes de categoria × mapas do Janus

- **`dim_categoria` (chave do `dre_categoria_map`, caixa):** 134/134 com nome **e** grupo idênticos à API.
  A API tem 1 categoria a mais, **"Lei Kandir"**, que entraria na bandeja.
- **`dre_comp_par` (competência, 141 pares; o `dre_comp_map` está órfão de leitura desde a 0260):**
  - **128 pares = (grupo, categoria) da API.**
  - Os outros 13 são as linhas vindas da venda: 5 "Descontos da venda" e 8 "Receitas da venda", entre elas
    "Receitas da venda / Comissão", que coincide no nome com a categoria Comissão do grupo "Receita de Vendas".

## 6. Impacto na v6.4.0 — o Contas a receber deve vir da API?

**Recomendação: sim**, condicionada a uma decisão de produto sobre o alcance do `Conferido`. A API dá, sem
heurística, o que o export não dá:

- a natureza a pagar/receber;
- os títulos **a vencer**;
- os inadimplentes **de anos anteriores** (o 21º);
- emissão sem sujeira.

E não depende de alguém exportar o arquivo. O oráculo do que importa para a página (inadimplentes) fechou ao
centavo.

**Decisões que voltam ao Yan:**

1. **O que é "a receber"**:
   - todo `transaction_kind = credit` (inclui comissão a receber de fornecedor: 166 vencidos, R$ 864,9 mil);
   - ou só títulos de cliente (`sale_payment`, `customer_invoice`, …).
2. **Alcance do `Conferido`**:
   - (a) só vencidos, a cada foto (183 detalhes, ~4 min);
   - (b) vencidos + a vencer semanal (4.821, ~1h45);
   - (c) tudo a cada foto (inviável na chave compartilhada).
3. **"Recuperado no ano"**: com fotos, sai da diferença entre fotos (marcado ontem, liquidado hoje). Sem
   reler o detalhe dos títulos de crédito já liquidados (são ~11,5 mil títulos de crédito só com vencimento
   de 01/01 a 15/10/2026), o histórico anterior à v6.4 (o
   1 título de R$ 1.228,64 da amostra) não é reconstruído. O briefing já aceita "histórico a partir da v6.4".
4. **`Operação Própria`**: a coluna não foi localizada na API. Sai da lista fechada ou vira derivação (da
   venda ligada pelo `items[].sale`), a confirmar.

**O que muda no briefing se a resposta for API:**

| Item | Hoje | Com API |
|---|---|---|
| **Inv. 3** | cru no Storage, parser, linha de total como checksum, `promover` atômica, card de upload, grant do `ingestor` | **contrato do espelho Monde**: cru `jsonb` + hash por título, lista inteira por foto, detalhe dos que importam, `ingestao.execucao` + expectativa do vigia, `promover` atômica. **Não há linha de total**: o checksum vira conciliação lista × promovido (contagem e Σ `final_amount` por natureza e status). Sem card de upload (no máximo um card de status) |
| **Inv. 4** | foto por carga | **mantém**; a "carga" vira a execução agendada (1 por dia, fora da revisita) |
| **Inv. 5** | lista fechada de colunas do arquivo | **lista fechada de campos da API**, com a mesma sonda; `observations`, `document`, `custom_fields[28]` e `account` nunca gravados (nem no cru: o cru guarda só os campos permitidos) |
| **M1 (GATE 1)** | conferir o export definitivo | **conferir a sonda**: decisões 1–4 acima; o export deixa de existir |
| **M3** | migration + parser + card | migration (raw, fotos, `promover`) + job agendado (rota cron, chave v3, orçamento e intercalação com o `monde-incremental`) + oráculo de paridade com uma foto real |
| **§11** | "RPA do Contas a receber" fora | deixa de existir |

**Risco estrutural (qualquer base):** a chave e o limite são compartilhados com o `monde-incremental`. O
manual diz "60 chamadas a cada 3 s **por IP**", mas o medido é 1 a cada 1,3 s; se o limite for por chave,
cada base nova disputa o mesmo orçamento.

## 7. Perguntas ao fornecedor do Monde (prontas para enviar)

1. O limite de requisições da API v3 é **por chave ou por IP**? Qual é o valor oficial? É possível emitir
   uma segunda chave para a mesma agência, com limite próprio?
2. Há previsão de filtro por data (`issue_date`, `due_date`, `settlement_date`) e de **"alterado desde"
   (`updated_at`)** em `/bills`, `/people` e `/sales`? Hoje os parâmetros de data são aceitos e ignorados.
3. É possível incluir `custom_fields` e `categories` na **listagem** de `/bills`, mesmo que por parâmetro
   opcional, para não exigir uma chamada de detalhe por título?
4. Uma mudança só em campo personalizado de um título (ex.: `Conferido`) altera algum campo visível na
   listagem?
5. Qual a regra do relatório **Demonstrativo de Resultado** para as linhas "Receitas da venda" (Comissão,
   Over, Taxa RAV, Taxa DU, Taxa de Serviço, Operação própria, Reembolso Fornecedor/Cliente) e "Descontos
   da venda": que data define a competência e quais status de produto entram? Há endpoint para esse relatório?
6. Qual a regra da coluna **Receitas** do relatório Vendas por Produto **por item**, em especial para produto
   customizado e operação própria?
7. Há endpoint para a tela **Análise de Operações** (lançamentos por operação)?
8. Por que um título presente em `GET /bills` pode responder 404 em `GET /bills/{id}`?
9. No relatório Lançamentos por Categoria (por movimentação), títulos pagos com cartão de crédito (movimento
   em conta-cartão ligado a uma fatura) e as próprias faturas de cartão **não aparecem**. É intencional? Em
   que relatório ou endpoint o pagamento da fatura do cartão aparece rateado pelas categorias das despesas?
10. Onde está, na API, a informação da coluna **Operação Própria** do relatório Contas a pagar e a receber?

## 8. Reprodução

Consultas SQL citadas por seção, rodadas com sessão `READ ONLY`. Chamadas de API: listas por cursor
(`size=50`, `next_cursor` → `cursor=`) com `status=open,overdue,settled,canceled` até vencimento
< 01/01/2026 (722 páginas) e `status=overdue` inteiro (8 páginas). Detalhe `/bills/{id}` dos 183 a
receber vencidos, mais 140 de amostra (110 emitidos em set/2026 fora dos exports, 30 dirigidos), 7
`/account_movements/{id}`, 1 `/refunds/{id}` e 135 `/categories/{id}`.

Os scripts da sonda (sem dados, sem payloads, a chave lida do `.env.local`) estão em
`~/projects/arquivo-worktrees-janus/m-1-v6-4-0-sonda-api/`, fora do repositório. As consultas SQL citadas
aqui bastam para refazer o lado banco. Os payloads crus não foram guardados em lugar durável.
