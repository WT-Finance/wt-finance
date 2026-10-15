# v6.4.0 · M0 — Medição para a página Financeiro · Geral (GATE 0)

Medido em **15/10/2026, ~12h15–12h45 (SP)** contra produção, **só leitura**:

- SQL por `SUPABASE_DB_URL` com `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` como primeiro comando;
- o lado DRE via REST, `get_dre_mensal`, com a credencial `verificador`.

`fato_fluxo` foi regenerado em 15/10 às 12h11 (SP), a partir da carga de Movimentação do dia. Nenhum nome de
pessoa, colaborador, portador de cartão ou conta pessoal aparece aqui: contas só nomeadas quando são empresas
(Asaas, Blimboo); papéis RBAC por nome de papel, com contagem de usuários.

Predicado usado em Q1/Q2 — o do Realizado de `get_dre_mensal` (`0207:69-73,103-126`), sobre o mapa **vivo**:

```sql
FROM financeiro.dre_categoria_map m
JOIN financeiro.dim_categoria dc ON dc.id = m.categoria_id
LEFT JOIN financeiro.fato_fluxo f ON f.categoria_id = m.categoria_id AND f.tipo = 'realizado'
-- ano = extract(year FROM f.data_competencia)
```

## Resultado de cabeça

- **Paridade provada antes do desenho (inv. 1).** As 13 categorias medidas (11 do FIN, Prejuízos e Reversão
  de Perdas Financeiras) batem ao centavo com `get_dre_mensal`, categoria a categoria, em 2024 e 2025
  (ano fechado) e em 2026 **jan–out** (só o Realizado). Bloco FIN:
  - 2024: **−251.746,13**;
  - 2025: **−532.869,33**;
  - 2026 (jan–out): **−174.988,29**.

  No ano corrente, a célula de nov–dez do DRE é previsão (`0207:177-184`), então a paridade da página
  vale para os meses realizados.
- **Q1:** o FIN é **resultado financeiro líquido** (custos + receitas financeiras + câmbio), não só custo. Decisão do Yan.
- **Q2:** "Prejuízos" é **uma única categoria-folha no bloco CUSTO**. A contrapartida "Reversão de Perdas
  Financeiras" fica no RV (receita). Não há bloco de prejuízo, então o inv. 2 manda a **tabela curada com bandeja**.
- **Q3:** o método dá números plausíveis **hoje** (PMR ≈ 149 d, PMP ≈ 164 d na definição de repasse). Mas
  **não há histórico de saldos** além de 3 semanas de cargas do Aberto: a seção nasce curta.
- **Q4:** a Taxa de Antecipação do Monde em Asaas + Blimboo soma **R$ 195.547,26** (2024–2026), contra
  **R$ 188.063,01** de desconto na planilha (inv. 7). O valor antecipado **não** aparece como lançamento no Monde.
- **Q5:** existe o papel **Diretoria** (2 usuários ativos), hoje sem `marketing/gastos`. O Financeiro tem 4
  usuários; o Administrador, nenhum ativo.

## Q1 — O bloco FIN

Uma linha por categoria do FIN vivo. Soma do Realizado; 2026 até 15/10.

| Categoria | Grupo no Monde | 2024 | 2025 | 2026 | Lanç. |
|---|---|---:|---:|---:|---:|
| Taxa do Cartão de Crédito/Débito | Despesas Financeiras | −254.078,63 | −331.436,12 | −293.659,08 | 23.901 |
| Taxa de Antecipação | Despesas Financeiras | −78.999,30 | −121.022,16 | −39.826,39 | 2.375 |
| Juros e Multa | Despesas Financeiras | −2.422,54 | −25.348,58 | −11.125,01 | 76 |
| IOF | Despesas Financeiras | −3.674,49 | −21.330,27 | −13.836,91 | 69 |
| Taxas e Tarifas Bancárias | Despesas Financeiras | −4.304,47 | −35.319,02 | −7.397,14 | 3.010 |
| Tarifa de Remessa | Custo dos Serviços Prestados | −7.793,96 | −13.559,55 | −10.424,57 | 190 |
| Anuidade de Cartões | Despesas Financeiras | −246,00 | −205,00 | −61,50 | 25 |
| Diferença Taxa de Cambio Dia D | Custo dos Serviços Prestados | −44.572,39 | −101.054,91 | −63.787,58 | 228 |
| Diferença Taxa de Câmbio Dia C | Receita de Vendas | +112.437,93 | +104.481,59 | +202.340,50 | 327 |
| Acréscimos Cobrados | Receitas e Rendimentos Financeiros | +4.299,20 | +11.912,92 | +11.363,94 | 109 |
| Desconto Obtido | Receitas e Rendimentos Financeiros | +27.608,52 | +11,77 | +51.425,45 | 56 |
| **FIN (= `get_dre_mensal`)** | | **−251.746,13** | **−532.869,33** | **−174.988,29** | |

**Agrupamento possível** (proposta, a decidir):

| Grupo | Categorias |
|---|---|
| Cartão | Taxa do Cartão |
| Antecipação | Taxa de Antecipação |
| Juros e IOF | Juros e Multa, IOF |
| Tarifas | Taxas e Tarifas Bancárias, Tarifa de Remessa, Anuidade |
| Câmbio | Dia D (−) e Dia C (+) |
| Receitas financeiras | Acréscimos Cobrados, Desconto Obtido |

Custos puros, sem câmbio nem receitas: 2024 −351.519,39 · 2025 −548.220,70 · 2026 −376.330,60.

Observações:

- A Taxa do Cartão é **60–78% do custo financeiro** (72% em 2024, 60% em 2025, 78% em 2026). Ela é custo de recebimento, não de dívida, e a diretoria
  pode ler "custo financeiro" de outro jeito.
- O câmbio é líquido positivo em todos os anos.
- O seed `0205:182-184` punha "Aplicações e Investimentos C" no FIN, mas o FIN **vivo** não a tem. Onde ela
  vive hoje **não foi medido**: a consulta foi barrada pelo classificador de permissões nesta sessão.

**Decidir (Yan):**

- **(a)** a seção mostra só custos, o líquido, ou os dois (custos e, abaixo, receitas e câmbio);
- **(b)** os grupos;
- **(c)** se a Taxa do Cartão entra como custo financeiro.

O recorte continua pelo **bloco FIN do mapa vivo** (inv. 2). Uma categoria nova no FIN entra sozinha; o
agrupamento interno precisa de regra para "categoria nova sem grupo", que é uma bandeja.

## Q2 — Prejuízos

| | 2024 | 2025 | 2026 (até 15/10) |
|---|---:|---:|---:|
| **Prejuízos** (CUSTO; caixa, Realizado) | −77.892,96 | −175.808,35 | −205.629,09 |
| lançamentos / títulos | 48 / 43 | 56 / 56 | 112 / 112 |
| com venda vinculada | 7 | 17 | 93 |
| mediana / máximo (abs) | 666,81 / 22.366,99 | 883,71 / 35.374,26 | 548,57 / 48.409,52 |
| **Reversão de Perdas Financeiras** (RV; caixa) | +7.320,80 | +39.816,58 | +80.119,24 |
| Prejuízos — competência (Demonstrativo) | −85.262,02 | −202.007,02 | −162.400,36 |
| Reversão — competência | +7.205,36 | +35.540,50 | +82.649,11 |

- Na **competência** (`dre_comp_par`), as duas linhas ficam no sub-bloco **COM**.
- Todo lançamento de Prejuízos é negativo (0 positivos).
- A busca por "antecip" na descrição achou um par Prejuízo/Reversão de 3.702,87 em 2024 que se anula.
  Indício de que a Reversão é usada para estornar prejuízo.
- **"Total por natureza (categoria)"** não tem o que mostrar: é uma categoria só. A "natureza" teria de vir
  de outro eixo, por exemplo o setor da venda vinculada (93 de 112 em 2026 têm venda), ou ser cortada da seção.

**Decidir (Yan):**

- **(a)** recorte = tabela curada com bandeja contendo {Prejuízos}, com ou sem {Reversão de Perdas
  Financeiras} como redutor (prejuízo **líquido**: 2026 −125.509,85);
- **(b)** o que substitui "por natureza".

## Q3 — Prazos médios

Saldos **de hoje** (carga do Aberto de 15/10, linha a linha por grupo de categoria) contra o fluxo de 12
meses (out/25–set/26, blocos de `get_dre_mensal`).

**Saldos em aberto hoje:**

| Lado | Vencido | 0–30 d | 31–90 d | 91–365 d | > 365 d | Total |
|---|---:|---:|---:|---:|---:|---:|
| A receber de clientes (Receita de Vendas) | 1.968.541,88 | 2.360.855,55 | 2.251.496,70 | 5.811.084,18 | 1.142.946,32 | 13.534.924,63 |
| A pagar a fornecedor (Repasse) | −2.565.168,72 | −1.866.502,72 | −1.727.139,91 | −5.305.648,49 | −2.369.466,48 | −13.833.926,32 |
| Outros créditos | 90.440,00 | 77.429,08 | 178.055,46 | 647.174,25 | 3.540.259,04 | 4.533.357,83 |
| Outras despesas | −302.825,52 | −745.236,19 | −1.883.139,40 | −5.878.739,74 | −27.916.278,87 | −36.726.219,72 |

**Fluxos de 12 meses (out/25–set/26):**

| Bloco | Valor |
|---|---:|
| Entrada de clientes (`ENT_H`) | 33.086.422,24 |
| Pagamento a fornecedor (`PAG_H`) | −30.783.208,73 |
| Receita bruta (`RB_H`) | 16.030.118,75 |
| Despesas (`DESP_H`) | −8.422.212,54 |

**Prazos resultantes:**

| Variante | Saldo ÷ fluxo × 365 |
|---|---:|
| **PMR** = a receber de clientes ÷ entrada de clientes | **149 d** |
| PMR só vencido + 90 d (6.580.894,13) | 73 d |
| **PMP** = repasse a pagar ÷ pagamento a fornecedor | **164 d** |
| Folga PMP − PMR | **+15 d** |

Leitura:

- **Pareamento consistente:** a entrada de clientes inclui o repasse (é bruta), como o a receber; o
  pagamento a fornecedor casa com o Repasse em aberto. Os dois prazos são plausíveis para uma agência com
  venda parcelada antes da viagem.
- **"Outras despesas" não serve** para PMP sem horizonte: 27,9 mi vencem além de 365 d (recorrências até
  2031). Se a despesa entrar, tem de ser com horizonte (ex.: só ≤ 365 d).
- **Histórico de saldos:**
  - o Aberto é substituído a cada carga; só existem **34 cargas desde 25/09/2026**, com os arquivos crus no
    Storage (reconstruíveis);
  - antes disso, não há saldo;
  - a "janela móvel de 12 meses" do briefing nasce com 3 semanas de pontos. Ela cresce com as cargas, ou com
    as fotos de contas a receber da v6.4, que dão só o lado a receber.

**Decidir (Yan):**

- **(a)** a definição: a receber de clientes × entrada de clientes; repasse × pagamento a fornecedor;
  incluir ou não outras despesas, e com que horizonte;
- **(b)** a fonte do saldo: Aberto (já existe, os dois lados, desde 25/09) ou fotos de contas a receber
  (só o lado a receber, desde a v6.4);
- **(c)** aceitar que a seção nasce curta e marcada "histórico desde DD/MM".

## Q4 — Antecipação no Monde × registro

Taxa de Antecipação (Realizado) por conta. Só as contas das empresas são nomeadas; o resto é agregado.

| Conta | 2024 | 2025 | 2026 (até 15/10) |
|---|---:|---:|---:|
| Asaas | −40.253,38 (374 lanç.) | −24.057,61 (905) | −22.608,05 (796) |
| Blimboo | — | −91.409,88 (18) | −17.218,34 (3) |
| outras contas | −38.745,92 (188) | −5.554,67 (91) | — |

**Contra a planilha** (inv. 7):

| Conta · ano | Antecipado (planilha) | Taxa no Monde | Taxa implícita |
|---|---:|---:|---:|
| Asaas · 2024 | 1.521.381,14 | 40.253,38 | 2,65% |
| Asaas · 2025 | 823.881,69 | 24.057,61 | 2,92% |
| Asaas · 2026 | 1.343.423,51 | 22.608,05 | 1,68% |
| Blimboo · 2025 | 3.102.209,43 | 91.409,88 | 2,95% |
| Blimboo · 2026 | 454.516,68 | 17.218,34 | 3,79% |

- Σ Monde (Asaas + Blimboo) **195.547,26** × desconto total da planilha **188.063,01**: diferença de
  **7.484,25**, não enumerada.
- O desconto **por conta e ano** está na planilha, fora do repositório
  (`…/8. Financeiro/Análises/Histórico de Antecipações.xlsx`, localizada pelo explorador). A leitura foi
  **barrada pelo classificador de permissões** nesta sessão. A conciliação linha a linha fica para a M4,
  com o arquivo entregue pelo Yan.
- **Asaas** lança a taxa **por cobrança** (centenas por ano, média de R$ 27–108). **Blimboo** lança **por
  lote** (média de R$ 5 mil). O registro de 38 linhas casa com o Blimboo; no Asaas, a conciliação tem de
  ser por mês, não por linha.
- As "outras contas" (2024–2025, 279 lançamentos) **não estão** na planilha.
- O **valor antecipado** não existe como lançamento no Monde: nenhuma categoria além da Taxa tem "antecip"
  na descrição, salvo o par Prejuízo/Reversão de 2024.

**Sem contagem dupla** (como o briefing propõe):

- Custos financeiros usa a **Taxa de Antecipação do Monde**, pelo FIN.
- Antecipações mostra o **volume** do registro, com o desconto só como contexto.
- O cruzamento registro × Monde é informativo: diferença esperada nas "outras contas" e no ritmo por cobrança do Asaas.

## Q5 — Papéis (RBAC)

| Papel | Usuários ativos | Áreas financeiras hoje |
|---|---:|---|
| Diretoria | 2 | executiva, financeiro/acervo, acervo/gestao, dre, faturamento-corp, fluxo-caixa, gerencial (**sem** marketing/gastos) |
| Financeiro | 4 | as da Diretoria + marketing/gastos |
| Gestor | 6 | executiva, financeiro/acervo, marketing/gastos |
| Geral | 26 | financeiro/acervo |
| Recursos Humanos | 1 | financeiro/acervo, acervo/gestao |
| Administrador | **0** | todas |
| Máquina · verificação | 1 (máquina) | toda área fora de Administração (regra do `rpc-contrato.test.ts:924-934`) |
| Máquina · ingestão | 1 (máquina) | admin/uploads |

**Proposta de concessões** (decidir):

- `financeiro/geral` → **Diretoria, Financeiro, Administrador, Máquina · verificação**. Gestor fica fora,
  salvo decisão.
- `financeiro/geral/antecipacoes` (edição) → **Financeiro, Administrador**.
- Pela regra do teste, a Máquina · verificação também recebe a **área** de edição. Só a área: o EXECUTE
  das RPCs de escrita fica fora da allowlist, como no inv. 11.
- "Quem tem só `financeiro/geral`" (inv. 12) não existe entre os papéis atuais. O caso de teste vai precisar
  de um papel ou usuário de teste.

## Checkpoint (GATE 0) — decisões do Yan

1. **Q1:** custos só, líquido ou os dois; grupos; Taxa do Cartão dentro ou fora.
2. **Q2:** Reversão de Perdas como redutor (prejuízo líquido) ou não; o que substitui "por natureza".
3. **Q3:** definição dos prazos, fonte do saldo (Aberto desde 25/09 ou fotos desde a v6.4) e a seção curta.
4. **Q5:** concessões de `financeiro/geral` (Gestor?) e da área de edição.
5. **M4:** autorizar a leitura da planilha "Histórico de Antecipações" (caminho acima) ou entregá-la no repo
   de fixtures, para a carga inicial e o oráculo do inv. 7.

## Reprodução

As consultas estão inline acima. Cálculo de paridade: soma de `linhas[t='cat'].meses` do `get_dre_mensal`
(REST, `verificador`) × o predicado, por `categoria_id`; em 2026, `meses[0..9]`.
