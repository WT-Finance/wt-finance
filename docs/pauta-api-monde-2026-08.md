# API do Monde — pedidos e dúvidas do Welcome Group

**Data:** 06/08/2026 · **De:** Welcome Group (integração Janus) · **Contexto:** somos piloto da API

Rodamos há alguns meses uma integração que espelha as vendas da API para alimentar os painéis
financeiros internos. Ela funciona, e o que segue nasceu do uso real — cada item traz o número que
medimos, para vocês avaliarem o custo/benefício do nosso lado.

Ordenamos por **impacto para nós**, não por facilidade de implementação. Os dois primeiros
resolveriam sozinhos a maior parte do nosso trabalho de contorno.

---

## 1. Filtro por data de ALTERAÇÃO na listagem de vendas

**O que existe hoje:** `resource=sales` filtra por `from`/`to` sobre a **data da venda**.

**O problema.** Como o Monde permite lançar venda com data retroativa, não temos como perguntar
*"o que mudou desde X?"*. Nossa sincronização pedia uma janela curta (últimos dias) a cada ciclo —
e venda cadastrada dias depois, com data para trás, **nunca entrava**: quando ela apareceu na API,
a janela já tinha passado por aquele dia e nunca mais voltava.

**Medido em 04/08/2026**, comparando venda a venda com a API: **42 vendas nunca chegaram ao nosso
lado** — R$ 392.070,01 em valor. O atraso entre a data da venda e o cadastro tem mediana de **4
dias** e chegou a **32 dias** (venda 73422: data 03/07, registrada 03/08).

**Nosso contorno atual:** varremos os **3 últimos meses inteiros, todo dia**. São ~2.100
requisições de detalhe por dia só para descobrir o que mudou — e ainda deixa descoberto o que for
alterado num mês mais antigo.

**Pedido:** um filtro por data de alteração/criação (`updated_since`, ou `updated_at` como campo
filtrável), **ou** um endpoint enxuto do tipo "o que mudou desde X" devolvendo só os
`sale_number`. Isso substituiria a varredura inteira por uma chamada barata e **eliminaria a
categoria do erro**, em vez de nos fazer remediá-la.

---

## 2. Receita (comissão) por PRODUTO, não só por venda

**O que existe hoje:** `total_revenue` vem **por venda**. Por produto existem componentes
(`commission_amount`, `over_amount`, `agency_service_fee`, `cc_rav_fee`,
`intermediary_commission_amount`, `passengers[].agency_fee`, `totals.agency_fee`).

**O problema.** Testamos quatro combinações desses componentes para reconstruir o `total_revenue`
da venda. A melhor bate **ao centavo em 26,8% das vendas** e cobre **55% do valor** — as demais não
fecham. Sem a receita por produto, precisamos **ratear** o total da venda entre os produtos
proporcionalmente ao valor, o que produz uma alocação, não um fato.

**Consequência prática para o nosso negócio:**
- **margem por produto** vira estimativa (desvio medido de até 3,5 p.p. no acumulado do ano, e
  bem maior no mês isolado);
- **relatório de prejuízo por produto** fica irreproduzível — um produto no vermelho dentro de uma
  venda lucrativa desaparece no rateio;
- a **receita por subsetor** (usamos em Weddings) fica distorcida.

**Pedido:** expor a receita/comissão realizada **por produto**. É o pedido que conserta três coisas
de uma vez, e o que mais destrava análise do nosso lado.

---

## 3. `total_revenue` parece incluir produto cancelado — é intencional?

**Casos que encontramos:**

| venda | `final_value` | `total_revenue` | situação dos produtos |
|---|---|---|---|
| 61985 | 663.503,33 | **−624.711,04** | apenas 1 produto ativo, de R$ 2.341,31 |
| 48522 | 0,00 | **−157.235,84** | — |
| 73083 | 19.712,00 | −687,96 | único produto cancelado em 24/07 |

Nossa leitura é que o total agrega produtos já cancelados ou removidos, enquanto a lista de
produtos traz só os vivos.

**Pergunta:** o `total_revenue` deve mesmo incluir produto cancelado? Se sim, existe (ou poderia
existir) um valor equivalente considerando **apenas o que está ativo**? Hoje temos de tratar essas
vendas como exceção.

---

## 4. Nome da operação junto do `operation_id`

**O que existe hoje:** a venda traz `operation_id` — presente em **95,9%** das nossas vendas de
Weddings. Mas o **nome** da operação só aparece em dois lugares circunstanciais: no objeto
`operation` (poucas vendas) e como um produto dentro do bloco `operations`.

**Medido:** juntando as duas fontes, conseguimos nomear **51 de 303 operações — 16,8%**. Não
encontramos um recurso de operações na API (`resource=operations` não existe).

**Pedido:** um recurso que liste operações (`id`, `nome`, datas), **ou** o nome vindo junto do
`operation_id` na venda. Nossa área de Weddings organiza tudo por operação (o casamento), então
esse vínculo é estrutural para nós.

---

## 5. Recurso `people`: campos fiscais e filtro incremental

**O que existe hoje:** `resource=people` expõe 10 campos — `monde_person_id`, `code`, `name`,
`kind`, `cpf`, `cnpj`, `email`, `mobile_phone`, `city_name`, `registered_at`.

**O problema.** Para emitir boleto e NFS-e precisamos de **17** campos. Faltam: **CEP, endereço,
número, complemento, bairro, UF, país, razão social, inscrição estadual, inscrição municipal e
telefone fixo**.

Além disso, dois pontos que parecem defeito:
- **`city_name` vem nulo em 1.000 de 1.000** registros numa amostra distribuída — suspeitamos de
  problema no campo, não de ausência de dado;
- **`from`, `to` e `updated_since` são aceitos mas ignorados** em `people` (o `total` não muda), e
  `page_size` tem teto de 200 ⇒ **324 páginas** para varrer a base completa. Sem filtro
  incremental, sincronizar pessoas é sempre varrer tudo.

**Consequência:** nossa base de pessoas continua sendo mantida por **planilha manual**, com o risco
que isso traz. Hoje ela está com carga de 30/06 enquanto a API já tem **602 pessoas a mais**.

**Pedido:** (a) os campos de endereço e fiscais; (b) verificar o `city_name`; (c) filtro
incremental; (d) elevar o teto de `page_size`.

---

## 6. Venda listada sem `sale_id`

O contrato permite que uma venda apareça na listagem sem `sale_id`. Como o detalhe é buscado por
esse id, tal venda **não teria como ser lida** por nós.

**Medido: zero ocorrências** nos meses que auditamos — o pedido aqui é só de esclarecimento.

**Pergunta:** `sale_id` pode de fato vir ausente? Em que situação? Se nunca vier, podemos tratar a
ausência como erro em vez de caso normal.

---

## 7. Semântica: venda `opened` com todos os produtos cancelados

A venda **73083** está com status `opened` e tem um único produto, cancelado em 24/07.

**Pergunta:** do ponto de vista do negócio, o que essa venda é — uma venda que existe, uma venda
cancelada, ou um rascunho? A resposta define se ela deve entrar nos nossos totais como zero ou
simplesmente não entrar. Hoje assumimos que não conta, mas preferimos confirmar do que inferir.

---

## Sobre os números

Todos foram medidos em 04–05/08/2026 comparando nosso espelho com a API, venda a venda, em leitura
apenas. Podemos compartilhar as consultas e os `sale_number` de qualquer caso citado, se ajudar a
investigar.

Obrigado — e à disposição para detalhar qualquer um dos itens.
