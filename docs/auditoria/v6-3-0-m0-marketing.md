# v6.3.0 · M0 — Medição dos lançamentos de marketing (GATE 0)

Medido em **08/10/2026** contra produção, **só leitura** (`npx supabase db query --linked`, SELECT
puro; o lado DRE via REST com a credencial `verificador`). Base de movimentação regenerada em
08/10/2026 11:12 (SP) (`fato_fluxo.gerado_em` 14:12:40 UTC). "MKT" abaixo = predicado da DRE de caixa,
copiado de `0207_get_dre_mensal.sql:65-126` / `0209` (sem lista de categorias):

```sql
FROM financeiro.fato_fluxo f
JOIN financeiro.dre_categoria_map m
  ON m.categoria_id = f.categoria_id AND NOT m.excluida AND m.bloco_chave = 'MKT'
WHERE f.tipo = 'realizado'          -- mês = extract(month FROM f.data_competencia)
```

## Resultado de cabeça

- **Paridade provada antes do desenho:** Σ MKT pelo predicado acima × célula MKT de
  `get_dre_mensal` — **34 de 34 células iguais ao centavo** (jan/2024 → out/2026, Δ 0,00 em cada
  ano). 2024: −473.497,33 · 2025: −497.943,69 · 2026 (até out): −472.903,66.
- **Invariante 2 no caso simples:** `fato_fluxo` já carrega fornecedor, descrição e nº do documento —
  a página **não precisa do raw**.
- **Sem setor no dado** (Q3) e **sem estorno no MKT** (Q5). Volume pequeno (Q6): sem paginação no servidor.

## Q1 — Fonte do Realizado

`get_dre_mensal` (única definição, `0207:36`) lê `financeiro.fato_fluxo`, `tipo='realizado'`, mês de
`data_competencia`, ⨝ `dre_categoria_map` por `categoria_id`, `NOT excluida`, agregado por
`bloco_chave` (`0207:65-126`). Para o realizado, `data_competencia = data_movimentacao`
(`0187:139-152`). "Realizado" é decidido **na carga** (`data_movimentacao <= hoje SP` quando o
`fato_fluxo` é regenerado, `0187:75,152`) — a página filtra `tipo='realizado'`, nunca recalcula.

```
origem,tipo,n,min_comp,max_comp,comp_dif_mov,gerado_em_max
em_aberto,previsto,35571,2024-11-01,2031-11-10,35571,2026-10-08 14:12:40+00
movimentacao,previsto,7,2026-10-22,2026-11-23,0,2026-10-08 14:12:40+00
movimentacao,realizado,96915,2024-01-02,2026-10-08,0,2026-10-08 14:12:40+00
```

Todo realizado vem da origem `movimentacao`, com `data_competencia = data_movimentacao` em 100% das
linhas. Colunas de `fato_fluxo`: `id, origem, origem_id, numero, venda_no, emissao, vencimento,
liquidacao, data_movimentacao, pessoa, descricao, valor, categoria_id, conta_bancaria_id, tipo,
data_competencia, pos_corte, gerado_em`. ⚠️ `id`/`origem_id` renumeram a cada carga — nunca em URL.

## Q2 — Universo: categorias no MKT do mapa vivo

| id | Categoria (grupo Monde "Despesas Marketing") | 2024 | 2025 | 2026 (até out) |
|---|---|---|---|---|
| 9 | Anúncios | 102 · −188.490,16 | 33 · −315.891,78 | 34 · −277.352,72 |
| 87 | Agência de Marketing / Terceiros de MKT | 53 · −198.758,58 | 63 · −92.950,76 | 56 · −127.972,35 |
| 99 | Licença de Software (MKT) | 48 · −80.176,86 | 105 · −80.423,82 | 69 · −29.164,45 |
| 556 | TravelBack | 9 · −4.744,56 | — | 12 · −37.973,76 |
| 403 | Marcas e Patentes | 5 · −604,00 | 5 · −6.856,00 | 2 · −152,00 |
| 17 | Material gráfico MKT | 13 · −723,17 | 20 · −1.821,33 | 8 · −288,38 |

(n · soma realizada). Nenhuma categoria do MKT está `excluida`. As 6 são do grupo "Despesas
Marketing" do Monde.

**Ambíguas — com cara de marketing e FORA do MKT** (regex sobre grupo+categoria; ficam fora da página,
porque a DRE as põe em outro bloco):

| id | Grupo · Categoria | Bloco na DRE | Realizado (todos os anos) |
|---|---|---|---|
| 45 | Despesas Marketing · **Endomarketing** | **RHB** | 710 · −381.654,17 |
| 84 | Despesas Comerciais · Feiras, Eventos e Divulgações | COM | 172 · −139.694,80 |
| 515 | Custo dos Serviços Prestados · Material de apoio - Eventos | CUSTO | 9 · −1.590,66 |

Endomarketing é do grupo "Despesas Marketing" no Monde, mas foi para RHB por decisão da
controladoria (`0251:50-54`). Se a gestora esperar ver Endomarketing ou Feiras, o caminho é
remapear no editor da DRE de caixa, o que **muda a DRE** — fora desta versão (§9 do briefing).

## Q3 — Setor / centro de custo / operação

**Não existe** em `fato_fluxo` nem em `raw.lancamentos_movimentacao` (colunas acima; o raw tem
`id, arquivo_origem, carregado_em, numero, venda_no, emissao, vencimento, liquidacao,
data_movimentacao, pessoa, descricao, descricao_categoria, valor, categoria, grupo_categoria,
conta`). `venda_no` vem em 19 de 637. O setor só aparece de forma solta na descrição ("Google Ads -
Weddings", "Ações de MKT - Welcome Trips") e no nome de 2 cartões ("8152 Trips", "1773 Weddings"):
sem base para filtro confiável. **Recomendação: o filtro de setor sai** (fronteira §9).

## Q4 — Qualidade do fornecedor (`pessoa`)

```
total 637 · pessoa nula/vazia 0 · distintas (cru) 103 · distintas (normalizado*) 103 · grupos com >1 grafia 0
```
*normalizado = sem acento, minúsculo, só alfanumérico. O nome agrupa bem — ranking por fornecedor vale.
Top 5 (todos os anos): GOOGLE 80 · −521.141,83; FACEBOOK 84 · −258.099,47; Active Campaign 7 ·
−106.169,17; [pessoa física A] 4 · −49.000,00; [pessoa física B] 17 · −48.580,00.
(Nomes de pessoa física omitidos neste relatório; a consulta `q4b` os reproduz.)

Observações para o Yan:
- **Pessoa física** aparece como fornecedor (prestadores com nome próprio, ex. 4º e 5º do
  ranking). A página exibe o nome como está na base.
- **Empresas do grupo** como fornecedor no MKT: Welcome Trips Agencia de Viagens (13 · −44.425,64),
  Welcome Weddings (2 · −4.919,69), WELCOME SURF TRIPS (1 · −3.161,07). Repasse interno?

## Q5 — Sinal

```
ano,n_pos,soma_pos,n_zero,n_neg,soma_neg
2024,0,0,0,230,-473497.33
2025,0,0,0,226,-497943.69
2026,0,0,0,181,-472903.66
```
**Nenhum lançamento positivo (estorno/devolução) e nenhum zero no MKT.** A convenção de sinal hoje só
decide a exibição; o estorno é caso futuro. Recomendação da M0: exibir o gasto positivo.
**Decidido pelo Yan (D2, 08/10): o gasto fica NEGATIVO, como na DRE** — a página mostra o valor da
base sem inversão; um estorno futuro aparece positivo, reduzindo o gasto, exatamente como na DRE.

## Q6 — Volume

230 (2024) · 226 (2025) · 181 (2026 até out) lançamentos; mês máximo = 29. **Sem paginação no
servidor:** a RPC de lançamentos devolve o ano inteiro e o filtro/ordenação/busca roda no cliente.

## Q7 — Colunas e o que é sensível

Preenchimento nos 637 lançamentos: `numero` 637 · `venda_no` 19 · `emissao` 636 · `vencimento` 637 ·
`liquidacao` 637 · `descricao` 637 · `conta_bancaria_id` 637 · `pos_corte` 0.

**`conta` carrega o nome do portador do cartão** — 13 das 19 contas usadas no MKT são cartão de
crédito, 11 delas "WCLARA - <nome do portador>" (as maiores com 140, 81+54, 76 e 12 lançamentos;
nomes omitidos aqui). Expor diria à gestora quem gastou com qual cartão. As descrições são genéricas (repetem a categoria, "Google Ads - Weddings",
"Software Adobe Creative Cloud"); não achei conteúdo interno sensível nas 40 mais frequentes nem
numa amostra de 20 de 2026.

**Proposta de lista FECHADA:** data (movimentação) · categoria · fornecedor · descrição · nº do
documento · valor. **Fora:** conta bancária/cartão, `venda_no` (3% preenchido), emissão/vencimento/
liquidação (redundantes com a data de movimentação para quem acompanha gasto pago), ids.

Observação de qualidade (dado, não página): dentro do MKT há descrições que sugerem categoria
trocada no Monde — "Licença de Software (ADM)" (4), "Faturamento Tecnicópias …" (9), "iCloud+ com
200 GB" (30), "Fatura Cliente" (8). Estão no MKT porque a **categoria** está; a página mostra o
mesmo que a DRE.

## Achado extra — o último mês fica subcontado até a fatura do cartão entrar

```
mês 2026, cartão?, n, soma
6 não 3 −8.244,00 | 6 sim 13 −36.678,48
7 não 8 −28.711,51 | 7 sim 14 −38.368,17
8 não 12 −40.557,49 | 8 sim 16 −44.067,36
9 não 5 −19.512,76 | 9 sim — (nenhum)
base inteira: último lançamento de cartão 24/09/2026; não-cartão 08/10/2026
```
Google/Facebook/Adobe pagam por cartão; em set/2026 o MKT ainda não tem nenhum lançamento de
cartão. O número continua igual ao da DRE, mas a gestora pode ler "setembro barato". Pesa na
decisão D4 abaixo.

## Decisões do Yan (GATE 0 — fechado em 08/10/2026)

| # | Decisão | Recomendação da M0 | **Decidido** |
|---|---|---|---|
| D1 | Filtro de setor (Q3) | Sai — o dado não tem setor | **Sai** (conforme recomendação) |
| D2 | Convenção de sinal (Q5) | Gasto positivo; estorno = linha negativa | **Gasto NEGATIVO, coerente com a DRE** (valor da base sem inversão; estorno aparece positivo) |
| D3 | Colunas expostas (Q7) | Data · categoria · fornecedor · descrição · nº doc · valor; sem conta/cartão | **Conforme recomendação** — lista FECHADA: data (movimentação), categoria, fornecedor, descrição, nº do documento, valor |
| D4 | Inv. 10 × decisões da v6.0.0 (out-briefing v6.0.0 :212, :280) | Carimbo no padrão vigente ("Última atualização em DD/MM/AAAA HH:MM"); sem "· parcial"; aviso "cartão lançado até DD/MM" | **Conforme recomendação** |
| D5 | Lista do MKT (Q2) | As 6 categorias do mapa vivo; Endomarketing (RHB) e Feiras/Eventos (COM) ficam fora | **Conforme recomendação** — a página segue o mapa vivo, sem exceção |

Consequências para o desenho: KPI de Δ% sobre valores negativos usa a mesma regra da DRE
(`deltaYtd`, travessão quando |base| < 0,005); a cor do Δ segue o sentido "gasto maior = pior"
(a definir no mockup, M1). "% do total de marketing" é razão de dois negativos, logo positiva.
