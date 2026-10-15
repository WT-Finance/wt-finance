# v6.4.0 · M1 — Conferência do export de Contas a receber (GATE 1)

Conferido em **15/10/2026, ~13h45 (SP)**, só leitura, com o leitor do projeto (`@e965/xlsx`, `cellDates`,
valor nativo).

Arquivos entregues pelo Yan em `~/projects/arquivo-worktrees-janus/fixtures-ingestao/` (fora do git):

| Arquivo | sha256 (prefixo) | Uso |
|---|---|---|
| `Contas a receber 25-26.xlsx` (entregue primeiro como `Contas a pagar e a receber 25-26.xlsx`, mesmo sha256) | `ebcd58393ecaa11e` | base de contas a receber (M3), vencimentos 2025+ |
| `Contas a receber 24.xlsx` (entregue depois da P1) | `3916bd8a1e0d6a54` | base de contas a receber (M3), vencimentos 2024 |
| `Histórico de Antecipações.xlsx` | `dbbf07d04fb111cd` | carga inicial das antecipações (M4) |

Nenhum valor de `Pessoa`, `Observações`, `Pendente com:`, `Documento`, `Conta (Previsão)`, `Descrição` ou
`Operação Própria` é reproduzido aqui. Só cabeçalhos, contagens e somas.

## Resultado de cabeça

- **Estrutura:** 1 aba, **17 colunas**, **28.603 títulos + 1 linha de total** (a última).
- **A linha de total fecha ao centavo.** `Número` = **28.603** (a contagem) e `Valor Final` =
  **73.062.152,05** = Σ `Valor Final` dos títulos. É o checksum do inv. 3.
- **É só a receber, inclusive comissão de fornecedor.** Dos 16.383 títulos com vencimento ≥ 2026, os 16.366
  que estão na varredura da API (M-1) são **todos crédito** (`transaction_kind = credit`), nenhum débito.
  Entram, como decidido, 828 "Fatura Fornecedor" (`vendor_invoice` de crédito).
  - Contra a API: `Valor Final` igual em 16.364/16.366, `Liquidação` em 16.365, `Vencimento` em 16.364.
- **Inadimplentes:** **21 em aberto, R$ 199.767,74**, exatamente os da API (inclui o de 2025, que a amostra
  de 15/10 perdia). Mais **1 liquidado, R$ 1.228,64** (a recuperação).
- **Divergências que viram pergunta (§3):**
  - o recorte é **vencimento ≥ 01/01/2025**, não "todos os anos";
  - `Descrição` **não é a categoria**;
  - `Operação Própria` e `Descrição` **contêm nomes de pessoas**.

## Conferência item a item

| Item | Briefing §3 / decisão do GATE 1 | Arquivo | Status |
|---|---|---|---|
| Abas / colunas | 1 aba, 17 colunas | 1 aba, 17 colunas | ✅ |
| Cabeçalho | (lista do briefing) | `Número, Emissão, Pessoa, Documento, Observações, Descrição, Conta (Previsão), Vencimento, Liquidação, Valor, Valor Final, Operação Própria, Conferido, Pendente com:, Fatura Cliente Nº, Fatura Fornecedor Conferida, Fatura Cliente Fechada` | ✅ (3 últimas fora da lista fechada, ignoradas) |
| Linha de total | contagem + Σ `Valor Final`; na amostra era **com sinal** | última linha: 28.603 · **+73.062.152,05**, igual à Σ dos títulos | ✅ (positiva porque só há crédito) |
| (a) recorte | só a receber, **todos os anos**, aberto + a vencer | só a receber ✅; vencimento **01/01/2025 → 2049** | ⚠️ ver P1 |
| (b) inadimplência = marcação | `Conferido` com `Inadimplente` | `Conferido`: vazio 25.198 · Sim 3.079 · Pendente 305 · Inadimplente 22 | ✅ (o valor "Enviado para o banco" não ocorre hoje, mas é válido) |
| (c) valor | `Valor Final` | número em 28.603/28.603; `Valor ≠ Valor Final` em 23.562 | ✅ |
| (d) nome | `Pessoa` | texto em 28.603/28.603 | ✅ |
| a receber = todo crédito | inclui comissão de fornecedor | 828 "Fatura Fornecedor" com vencimento ≥ 2026 = `vendor_invoice` de crédito | ✅ |
| Emissão | inválida vira nula, contada no log | **15** com data zero (amostra: 5); o parser também anula, pela errata 1 (piso 2015), **7** emissões de 2000–2006 neste arquivo e **1** de 2014 no de 2024 — 23 no total, linha preservada | ✅ (regra vale) |
| Datas | — | meia-noite de Brasília (03:00 UTC) em 100% | ✅ (coerção canônica) |
| Situação | — | liquidados: 2025 12.205 · 2026 11.554 · 2027 14; em aberto: 2025 15 · 2026 2.350 · 2027 2.267 · 2028–2031 197 · 2049 1 | — |
| Números | únicos | 28.603 distintos | ✅ |

Cruzamento com a varredura da API (M-1, 11h22–11h41), contra o export (~13h40):

- **17 títulos do export** (vencimento ≥ 2026) não estavam na varredura;
- **8 créditos da API** não estão no export (5 `vendor_invoice`, 3 `customer_invoice`; 1 liquidado).

Atribuídos às ~2 h entre as duas leituras (títulos criados, excluídos ou com vencimento alterado no
intervalo). **Não foram enumerados título a título**; isso exige nova sondagem e não é gate.

## Perguntas ao Yan (GATE 1)

- **P1 — Recorte 2025+.** O arquivo traz vencimentos a partir de 01/01/2025, não "todos os anos". A API
  mostrou **0 créditos em aberto vencidos antes de 2025** (M-1), então hoje o recorte não perde nenhum título
  em aberto nem inadimplente. Aceitar "vencimento ≥ 01/01/2025" como recorte-padrão do export (instrução do
  card de upload), ou exportar todos os anos?
- **P2 — `Descrição` não é a categoria.** É a descrição do título, que por padrão repete o tipo:
  - "Pagamento venda" → `sale_payment`;
  - "Fatura Cliente" → `customer_invoice`;
  - "Fatura Fornecedor" → `vendor_invoice`;
  - e textos livres ("Devolução de Empréstimo 3/19", "Fatura <cartão> - <nome>").

  A página não precisa dela, porque "a receber" é todo o arquivo. Tirar da lista fechada?
- **P3 — `Operação Própria` contém nomes de pessoas** (é o nome da operação/evento, ex. casal + data). A
  página não usa. Tirar da lista fechada?

Se P2 e P3 forem "tirar", a **lista fechada** (inv. 5) fica: `Número`, `Emissão`, `Pessoa`, `Vencimento`,
`Liquidação`, `Valor Final`, `Conferido`. `Valor` também fica fora: o checksum é sobre `Valor Final`.

Consequências para a M3, informativas:

- O parser exige a linha de total com `Número` = contagem de títulos e `Valor Final` = Σ, tolerância 0.
  Um arquivo com pagar e receber juntos traz o total **com sinal** e não fecha com a Σ positiva das
  linhas: a carga é rejeitada, sem precisar classificar.
- `Conferido` aceita {vazio, Sim, Pendente, Enviado para o banco, Inadimplente}. Valor fora disso rejeita a carga.
- Fixture do oráculo: registrar o arquivo no `scripts/ingestao/fixtures-manifest.json` com um nome canônico
  (proposta `contas-receber-cru.xlsx`) e o sha256 completo.

## Decisões do Yan (15/10/2026) — GATE 1 fechado

- **P1:** o export é feito **por faixa de ano**, porque o Monde limita a pesquisa a 30 mil linhas. Entregue o
  arquivo de 2024 em separado. A base de contas a receber aceita **N arquivos** por carga, como Vendas
  (divergência D5 do plano: generalizar o multiarquivo de `carga.ts`).

  Conferência do arquivo de 2024 (`Contas a receber 24.xlsx`):

  | Medida | 2024 | 2025–26 |
  |---|---:|---:|
  | Títulos | 10.354 | 28.603 |
  | Linha de total (`Número` · `Valor Final`) | 10.354 · 23.925.307,37 | 28.603 · 73.062.152,05 |
  | Fecha com a Σ das linhas | ✅ | ✅ |
  | Vencimentos | 01/01–31/12/2024 | 01/01/2025–2049 |
  | Em aberto / inadimplentes | 0 / 0 | 4.830 / 21 |
  | Emissão com data zero | 0 | 15 |
  | `Conferido` | vazio 10.349 · Pendente 6 | (acima) |
  | Mesmo cabeçalho de 17 colunas | ✅ | ✅ |

  **Números em comum entre os dois arquivos: 0.** O checksum é **por arquivo**: cada um traz a própria linha
  de total. A união tem 38.957 títulos.

  Recorte-padrão do card de upload: **um arquivo por faixa de vencimento que caiba em 30 mil linhas**, sem
  lacuna entre as faixas, a partir de 01/01/2024.
  - Lacuna ou sobreposição entre faixas não é detectável pelo checksum (cada arquivo fecha sozinho).
  - A M3 implementa uma guarda: **número repetido entre arquivos rejeita a carga**.
  - A M3 também alerta sobre **lacuna de vencimento entre as faixas**.
- **P2/P3:** **mantém `Descrição` e `Operação Própria`.** A lista fechada do inv. 5 fica a do briefing:
  `Número`, `Emissão`, `Pessoa`, `Descrição`, `Vencimento`, `Liquidação`, `Valor Final`, `Conferido`,
  `Operação Própria`.
  - As duas contêm nomes de pessoas em parte das linhas. Ficam no raw, sob a mesma proteção de `Pessoa`
    (área `financeiro/geral`, nunca em relatório commitado).
  - `Descrição` **não** é a categoria: é a descrição do título.

## Planilha de antecipações (insumo da M4)

`Planilha1`, cabeçalho `Conta, Data, Valor Antecipado, Valor Líquido, Desconto de Antecipação, %`.

- **38 linhas** de registro. Mais 5 linhas com conteúdo fora da tabela (a anotação "Taxa cartão" etc.),
  ignoradas como manda o briefing. Colunas G–I vazias.
- Contas: só **Asaas** e **Blimboo**. Datas em meia-noite de Brasília.
- **Oráculo do inv. 7, igual ao centavo:**

| Conta · ano | n | Antecipado | Líquido | Desconto |
|---|---:|---:|---:|---:|
| Asaas · 2024 | 9 | 1.521.381,14 | 1.477.416,75 | 43.964,39 |
| Asaas · 2025 | 5 | 823.881,69 | 799.732,89 | 24.148,80 |
| Asaas · 2026 | 8 | 1.343.423,51 | 1.318.673,56 | 24.749,95 |
| Blimboo · 2025 | 13 | 3.102.209,43 | 3.024.227,89 | 77.981,54 |
| Blimboo · 2026 | 3 | 454.516,68 | 437.298,35 | 17.218,33 |
| **Total** | **38** | **7.245.412,45** | **7.057.349,44** | **188.063,01** |

- **Coerência (inv. 6):** desconto = antecipado − líquido em **38/38**; 0 < líquido ≤ antecipado em **38/38**.

**Conciliação com a Taxa de Antecipação do Monde** (completa a Q4 da M0; informativa, não gate):

| Conta · ano | Desconto (planilha) | Taxa no Monde (Realizado) | Δ |
|---|---:|---:|---:|
| Asaas · 2024 | 43.964,39 | 40.253,38 | 3.711,01 |
| Asaas · 2025 | 24.148,80 | 24.057,61 | 91,19 |
| Asaas · 2026 | 24.749,95 | 22.608,05 | 2.141,90 |
| Blimboo · 2025 | 77.981,54 | 91.409,88 | −13.428,34 |
| Blimboo · 2026 | 17.218,33 | 17.218,34 | **−0,01** |
| **Total** | **188.063,01** | **195.547,26** | **−7.484,25** |

O Blimboo 2026 bate (−0,01 de arredondamento). Os demais pares divergem. O Asaas lança a taxa por cobrança
e o Blimboo por lote (M0 Q4); a diferença por mês fica para o cruzamento informativo da página. A carga
inicial (M4) usa a **planilha** como verdade, conforme o briefing.
