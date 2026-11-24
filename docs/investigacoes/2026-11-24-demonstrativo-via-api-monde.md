# Demonstrativo de Resultado (competência) remontado pela API Monde v3

**Data:** 23–24/11/2026 · **Natureza:** investigação read-only (só `GET` na API; sessão read-only no banco) ·
**Refaz:** `2026-07-27-dre-competencia-api-monde.md` + delta (veredito de julho: **PARCIAL**) ·
**Oráculo:** `raw.demonstrativo_competencia`, carregado em **19/11/2026 às 15:52** (Brasília) ·
**Chave:** a mesma do Janus, com as permissões liberadas em 23/11 (relatório Vendas por produto, webhooks).
~7 mil chamadas, das quais 6,1 mil a 1 chamada/0,7 s — **zero 429**.

> Amostras brutas ficaram fora do repositório, no diretório temporário do job. Nenhum número aqui identifica
> pessoa; só nomes de conta do plano de contas.

---

## 1. Resposta curta

**Sim, com ressalvas pequenas e nomeadas.** O Demonstrativo tem dois blocos, e os dois agora se remontam pela API
com regras que saem de **metadado** (situação da venda, tipo do produto, tipo da conta, natureza da categoria),
não de ajuste a valor:

| Bloco | Meses testados | Resultado |
|---|---|---|
| **Bloco da venda** (12 linhas: Comissão, Over, Taxas, Desconto, Operação própria, Reembolsos) | nov/2025, mar, jun, set/2026 | **46 de 48 linhas ao centavo**; nov/2025 e mar/2026 **12/12** |
| **Categorias** (128 contas em 14 grupos) | mar, set/2026 | mar **91/94 contas** (Δ R$ 104,97 no total do bloco); set **79/84** (Δ R$ 2.197,75, dos quais R$ 542,74 provados como edição posterior à carga) |

O que mudou desde julho, e por que agora fecha:

- O **relatório Vendas por produto** (`/reports/sales_by_products`) é calculado pelo próprio Monde e traz por produto
  comissão, over, taxas, desconto e reembolsos — em julho tudo era remontado a partir do payload bruto da venda.
- **`/refunds`** expõe a **data de emissão** do reembolso. Em julho o eixo do Reembolso Fornecedor "não era exposto"
  (erro de até ±170 mil/mês); agora os três reembolsos fecham **ao centavo** nos quatro meses.
- **`/bills/{id}`** traz as categorias de toda conta, e `/categories` traz a natureza (`kind`) e o flag de repasse
  (`pass_through`). Os 14 grupos do Demonstrativo são exatamente os grupos da API menos "Repasse"; as 128 contas
  existem como categoria de mesmo nome (sem homônimos).

**Não é "ligar e desligar o upload".** Faltam (§6): explicar dois resíduos pequenos e recorrentes, testar o bloco de
categorias em mais meses (inclusive 2024) e uma comparação contra uma exportação feita **na mesma hora** da leitura.

---

## 2. Bloco da venda — regra e prova

### 2.1 Regra (tudo pelo relatório `sales_by_products`, período pela **data da venda**)

| Linha do Demonstrativo | Fonte | Recorte |
|---|---|---|
| Comissão | `commission.commission_amount` | só vendas **fechadas** (`sale.status = closed`); produto cancelado **entra** |
| Over | `commission.over_amount` | idem |
| Taxa DU / Taxa CC DU | `amounts.du_fee` / −`amounts.cc_du_fee` | idem |
| Taxa RAV / Taxa CC RAV | `amounts.rav_fee` / −`amounts.cc_rav_fee` | idem |
| Desconto | −`amounts.discount` | idem |
| Taxa de Serviço | `amounts.agency_fee` + `amounts.agency_service_fee` | idem, **sem** produtos de operação própria |
| Operação própria | `amounts.total_amount` dos produtos de tipo `operation` (catálogo `/products`) | idem |
| Reembolso Cliente | `/refunds?refund_type=customer`, Σ `amount` | pela **`issue_date`** do reembolso |
| Reembolso Fornecedor (receita / desconto) | `/refunds?refund_type=vendor`, positivos / negativos | pela **`issue_date`** |

Como a regra foi achada (para não ser ajuste): "venda excluída fora" e "produto cancelado dentro" vieram da partição
de março por situação; "só fechada" veio de junho, onde a diferença de Comissão (5.744,35) e de Taxa de Serviço
(35.839,63) era **exatamente** a soma dos produtos de vendas **abertas**; "Taxa de Serviço sem operação" veio de
setembro, onde a sobra era a taxa dos produtos de operação, que já entram inteiros em "Operação própria". Cada
regra foi então reaplicada aos outros meses sem mudança.

### 2.2 Prova

| Mês | Linhas ao centavo | Diferenças |
|---|---|---|
| nov/2025 | **12/12** | — (mês não usado para derivar regra nenhuma) |
| mar/2026 | **12/12** | — |
| jun/2026 | 11/12 | Desconto −1,58 |
| set/2026 | 11/12 | Comissão −6.999,00 |

Vendas editadas no Monde **depois da carga** (19/11 15:52), por `updated_since`: nov/2025 **2**, mar **12**,
jun **7**, set **49**. As duas diferenças estão nos meses com edição posterior e são compatíveis com ela (em
setembro, uma venda hoje aberta foi editada depois da carga e outras 61 linhas de vendas fechadas também), mas
**não está provado** que sejam edição — o relatório só mostra o valor de hoje.

---

## 3. Bloco de categorias — regra e prova

### 3.1 Regra (contas de `/bills` + categorias de `/bills/{id}`)

1. **Eixo: data de emissão** da conta (`issue_date`). Em setembro, emissão fechou 81 contas ao centavo e
   vencimento só 32 — é a mesma regra "fato gerador = emissão" que o Janus já usa na DRE (ADR-0170).
2. **Conta cancelada fica fora.** Confirmado pelo `/logs`: as canceladas **antes** da carga não estão no
   Demonstrativo (R$ 6.314,95 em setembro; R$ 7.276,24 em março, só em Taxa do Cartão).
3. **Categoria de repasse fica fora** (`pass_through`: Entrada de clientes, Pagamento ao Fornecedor,
   Movimentação de Caixa C/D, Depósito não Identificado). Nenhuma delas aparece no Demonstrativo.
4. **Sinal pela natureza da categoria:** receita positiva, despesa negativa.
5. **As três categorias que espelham o bloco da venda** — "Comissão", "Reembolso Fornecedor - C" e
   "Reembolso / Carta de Crédito" — só contam em conta **avulsa da venda** (`sale_standalone`) e em lançamento
   comum; vindas de **fatura de cliente, fatura de fornecedor ou avulso de fornecedor** (`customer_invoice`,
   `vendor_invoice`, `vendor_standalone`), saem. Nessas faturas elas carregam os mesmos valores que o bloco da venda
   já conta (comissão, reembolsos) — somá-las seria contar duas vezes. As demais categorias contam em qualquer tipo
   de conta, faturas inclusive.
   - A regra foi lida em setembro e **corrigida por março**: em setembro nenhuma das três tinha conta avulsa de venda;
     em março "Reembolso Fornecedor - C" tem R$ 334.059,31 no Demonstrativo, **exatamente** o avulso da venda. São
     as mesmas três categorias que julho isolou por outro caminho ("filtro H2").

### 3.2 Prova

**Março/2026** — 91 de 94 contas ao centavo; 10 de 13 grupos ao centavo; total do bloco Δ R$ 104,97:

| Resíduo | Demonstrativo | API | Δ |
|---|---:|---:|---:|
| Tarifa de Remessa | −674,74 | −610,62 | 64,12 |
| Taxa do Cartão de Crédito/Débito | −33.087,74 | −33.046,90 | 40,84 |
| Diferença Apuração de Baixas C | 1,26 | 1,27 | 0,01 (arredondamento) |

Nenhum dos dois primeiros se explica por cancelamento posterior (as 205 contas canceladas dessas categorias
mudaram antes da carga).

**Setembro/2026** — 79 de 84 contas ao centavo; 9 de 14 grupos; total do bloco Δ R$ 2.197,75:

| Resíduo | Δ | Explicação |
|---|---:|---|
| Aluguel | 169,00 | conta **cancelada depois da carga** (`/logs`) |
| Licença de Software (Comercial) | 97,00 | idem |
| Licença de Software (MKT) | 276,74 | idem (duas contas: 27,74 + 249,00) |
| Taxa do Cartão de Crédito/Débito | 542,78 | **não explicado** |
| Acréscimos Cobrados | 1.112,23 | **não explicado** — duas faturas de cliente de débito, sem edição após a carga; em março a mesma combinação entra |

**Resíduo recorrente:** Taxa do Cartão sobra nos dois meses e sempre do mesmo lado (a API tem menos taxa que o
Demonstrativo). Candidatos não testados: taxa lançada em fatura de cartão (`credit_card_invoice`, que não foi aberta
nesta sonda) ou taxa do lado do fornecedor.

---

## 4. O resultado do mês inteiro

| Mês | Bloco da venda | Categorias | Δ no resultado |
|---|---|---|---|
| mar/2026 | 12/12 ao centavo | 91/94 | **R$ 104,97** (0,02% do resultado líquido do bloco de categorias) |
| set/2026 | 11/12 | 79/84 | Comissão −6.999,00 (edição não provada) + categorias 2.197,75 (542,74 edição provada) |

Junho e novembro/2025 tiveram só o bloco da venda testado (abrir as contas de um mês custa ~35 min).

---

## 5. Custo de operar

Por mês remontado: relatório Vendas por produto (~25 páginas) + lista de contas emitidas (~50 páginas) + detalhe de
cada conta (2–3 mil chamadas, **~35 min a 0,7 s**, ritmo sem nenhum 429 em 6,1 mil chamadas) + lista completa de
reembolsos (~200 páginas, sem filtro por data — 10 mil reembolsos desde 2015). O detalhe das contas é **o mesmo
espelho de contas** que as bases Movimentação, Aberto, Contas a receber e Operação pedem (estudo de 19/11, §5): o
Demonstrativo não exige pipeline próprio de dados, só a regra de montagem por cima. Histórico 2024–2026: ~90 mil
detalhes, ~18 h de carga inicial, diluída; depois, o webhook `bills.changed` mantém em dia.

---

## 6. O que falta antes de decidir

1. **Exportação do Demonstrativo na mesma hora da leitura pela API** (ação do Yan) — separa de vez "edição
   posterior" de "regra errada" nas diferenças de setembro.
2. **Bloco de categorias em mais meses**, incluindo **2024** (o Monde vinha alterando 2024/2025 do Demonstrativo,
   registro da v6.1.0) e um mês de dezembro.
3. **Taxa do Cartão:** abrir as faturas de cartão de um mês e testar os dois candidatos do §3.2.
4. **Acréscimos Cobrados em fatura de débito:** entra em março e sai em setembro — achar o metadado que separa.
5. **Decisão de produto (Yan):** aceitar uma tolerância (ex.: resíduo por conta ≤ R$ X) ou exigir centavo. Hoje o
   upload é a "verdade" porque é a tela do Monde; a remontagem pela API é a mesma conta, feita por nós.

---

## 7. Não verificado

- Bloco de categorias em nov/2025 e jun/2026; qualquer mês de 2024.
- As duas diferenças do bloco da venda (jun Desconto −1,58; set Comissão −6.999,00).
- Taxa do Cartão (resíduo recorrente), Acréscimos Cobrados (set) e Tarifa de Remessa (mar).
- O conteúdo de um aviso de webhook real (nenhum cadastrado).
