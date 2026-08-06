# ADR-0165 — O espelho espelha: o filtro de negócio sai da escrita e vai para a leitura

- **Status:** aceito
- **Data:** 2026-08-05
- **Versão:** v5.4.5 (o espelho passa a espelhar)
- **Contexto:** ingestão do Monde (`src/lib/monde/transform.ts`, `monde.*`) — emenda ao
  **ADR-0149** (ingestão) e ao **ADR-0164** (reconciliação)

## O problema

O espelho **retinha venda que a origem já não reconhecia**, com os valores congelados de antes do
cancelamento. Medido em 05/08/2026 contra a API, venda a venda, nos 12 meses: **24 vendas,
R$ 896.718,90 de faturamento e R$ 282.422,05 de receita**. jul/2026 estava inflado em **25,19% da
receita**, quase tudo numa venda só (a `73083` valia R$ 293.721,82 no espelho e −R$ 687,96 na API,
com o único produto cancelado em 24/07). Baseline completo em
`docs/investigacoes/2026-08-05-v5-4-5-baseline-vendas-retidas.md`.

A causa não era a ingestão errar a conta — era **onde o filtro morava**.

## Decisão 1 — O espelho guarda tudo; a regra de negócio mora na leitura

`transformSale` filtrava `status === 'active'` **antes de gravar** e descartava a venda inteira
quando não sobrava item ativo. Como o UPSERT (`monde_ingest_promover`) só escreve sobre o universo
que pediu, venda que **saía** desse universo ficava **invisível para a escrita**: não podia ser
atualizada nem removida, e a linha velha sobrevivia para sempre.

Agora **todos** os produtos são gravados, com o `status` real. Quem decide o que soma é a
`monde.mv_vendas_diarias`, que **já filtrava** `WHERE i.status = 'active'` desde a 0179 — um filtro
que era **código morto** (a tabela tinha 47.182 itens, todos ativos) e passou a ser o mecanismo
vivo. Venda 100% cancelada entra no espelho e não produz linha nenhuma na mv: contribui zero
**sozinha**, sem ninguém marcar nada.

O ganho não é o conserto, é a classe: **a falha deixa de ser possível**, em vez de detectável e
reparável.

## Decisão 2 — A materialized view NÃO foi tocada

O briefing previa alterar a mv para excluir venda marcada. Validando contra o repo: **materialized
view não aceita `CREATE OR REPLACE`**. Mudá-la exigiria `DROP`+`CREATE`, que o classificador do
db-gate devolve como **`destrutiva`** (testado) — inaplicável por um agente (ADR-0131) — e o
`CASCADE` derrubaria `monde.mv_vendas_diarias_compat`, confirmada em `pg_depend` como dependente e
lida pelas 7 funções da virada (ADR-0151). Ou seja: o desenho literal do briefing arriscava
**derrubar a fonte de Metas e Performance**.

E era desnecessário: o filtro que já existia resolve. A versão inteira ficou sem mudança
estrutural de banco.

## Decisão 3 — O rateio de receita continua caindo só nos ativos

O `total_revenue` da venda é rateado entre os itens; o cancelado recebe **`receitas = 0`** e o
denominador é a soma dos **ativos**. Se ele participasse, receita vazaria para linha que a mv não
soma e o total por venda deixaria de fechar com `total_revenue`. Por isso o resto de arredondamento
vai ao **último ativo** (`idxUltimoAtivo`), não ao último item do array.

**Provado contra dado real, não fixture:** rodando o `transformSale` antigo e o novo sobre o mesmo
input da API em julho — **776 vendas idênticas, 0 mudam**. A versão **não altera cálculo nenhum**;
o efeito dela é permitir que o UPSERT **sobrescreva a linha velha**.

## Decisão 4 — Exclusão de ESCOPO continua na escrita

`welcome` e `sem_setor` seguem descartados antes de gravar, e isso é deliberado: são exclusões de
**escopo**, estáveis — uma venda não deixa de ser Welcome. `sem_item_ativo` era de **estado**, e
estado muda; era daí que vinha o furo.

**Resíduo aceito e declarado:** venda que **mude** para Welcome ou sem-setor depois de espelhada
ainda ficaria retida. Zero casos medidos nos 12 meses. Tratá-la exigiria filtrar venda na mv — a
mudança destrutiva da Decisão 2. Fica coberta pelo **tripwire**, que a acusaria por mês.

## Decisão 5 — O detector é o tripwire, não uma contagem do banco

Registrado porque a primeira tentativa estava **invertida** e teria passado despercebida:
`vendas − vendas_que_contam` dá **zero justamente quando o defeito existe**. A venda retida tem
itens **ativos** no espelho (os valores velhos), então ela "conta"; só depois de regravada é que
fica com itens `canceled` e o delta sobe. Um teste sobre essa métrica **passaria com o defeito
presente e reprovaria depois da correção**.

O passivo só é visível **comparando com a API** — o que a reconciliação faz e grava no tripwire
como `sobrando`. O caso de contrato afirma `sobrando === 0` **por mês verificado**, e ignora mês
não verificado (mesma filosofia do tripwire: não acusar o que não mediu).

Corolário registrado pelo `revisor`: um invariante **global** (sem recorte de mês) seria alcançável
só via reprocesso do histórico completo — e um gate vermelho por esse motivo empurraria alguém a
rodar backfill sem autorização, **derrubando faturamento de mês fechado** sem checkpoint.

## Decisão 6 — `vendas_que_contam` no status (migration 0237, aditiva)

Como a venda cancelada agora **permanece** no espelho, os contadores crus do
`monde_ingest_status` passariam a incluir o que a mv ignora — e `vendas` é exibido no cartão de
`admin/uploads`. A `0237` acrescenta `vendas_que_contam` e `itens_cancelados`. Aditiva pura, sem
remover chave. Depois do reprocesso: **193 vendas preservadas canceladas** e **529 itens
cancelados** — informação honesta, não defeito.

## O que foi aplicado, e o que isso mudou

Migration `0237` aplicada (backup-gate verde) e **os 12 meses reprocessados** pelo caminho de
produção (lock + staging + UPSERT + refresh), com autorização explícita do Yan — as 24 vendas
tinham `raw_hash` divergente, então o UPSERT as regravou **sozinho, sem DML**.

| | faturamento | receita |
|---|---|---|
| **12 meses** | **−R$ 864.917,26** | **−R$ 267.370,33** |
| jul/2026 (o pior) | −R$ 450.349,65 | **−R$ 295.801,06** |
| **dez/2025** | −R$ 40.000,00 | **+R$ 44.877,47** |

**Não é "tudo cai".** Em dez/2025 e fev/2026 a receita **sobe** — a venda retida lá tinha receita
negativa. A correção acerta o número; não o reduz por definição.

## O que NÃO foi decidido aqui

- **Alargar a janela de reconciliação além de 3 meses.** Mês fora dela não é revisitado, então
  resíduo futuro em mês antigo exige `mode=window` manual. O desbloqueio real é o pedido de
  **filtro por data de alteração** ao provedor (§8.1 do briefing).
- **O resto do Scope B**, em espera do pedido de **receita por produto**.
