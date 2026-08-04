# Consolidado 2026-08-04 — Metas por subsetor de Weddings: o que ficou sabido

> **Por que este documento existe em `main`.** A versão que produziu estes achados entrou em
> **stand-by**, e o out-briefing dela vive numa branch não mergeada
> (`feat/v5-4-4-metas-subsetor-weddings`, PR #213), fora do alcance de qualquer sessão futura.
> O conhecimento vale mais que a feature: a decisão do Scope B depende dele, e o incidente de
> produção não pode se repetir. Aqui está o consolidado, autossuficiente.

## 1. Mapa: onde está cada coisa

| Coisa | Onde | Estado |
|---|---|---|
| Migrations `0233`/`0234` (eixo de subsetor) | `main` (PR #215) | **APLICADAS**, objetos **inertes** |
| Migration `0235` (conserto do incidente) | `main` (PR #215) | **APLICADA** |
| Código da feature (UI, lib, testes, ADR-0163, out-briefing) | `feat/v5-4-4-metas-subsetor-weddings`, **PR #213 em rascunho** | **STAND-BY — não mergear** |
| Este consolidado | `main` | — |

`ADR-0163` está **reservado** pela branch em stand-by. Quem precisar de ADR antes da retomada usa
`0164`+.

## 2. A descoberta que parou a versão

A tela foi construída, revisada e o banco aplicado. Depois, uma pergunta do Yan — *"por que os
cards de subsetor não podem ser alimentados pela API?"* — expôs que a entrega **amarrava uma
métrica de gestão ao upload manual de vendas**, que é justamente o que o Scope B quer aposentar.

Decisão dele: **parar** até definir o caminho. O custo de parar aqui é baixo — o que ficou no banco
é inerte e o conhecimento está neste documento.

## 3. Errata: o espelho do Monde JÁ tem granularidade de item

O briefing e o ADR desta versão afirmavam que *"o espelho do Monde ainda não tem granularidade de
item"*. **Falso.** Vinha das notas antigas do Scope B e nunca foi conferido.

`monde.venda_item` existe desde a `0178` e está populada — via `monde_ingest_status()`:

```
47.150 itens · 28.498 vendas · 02/01/2023 → 04/08/2026
```

Colunas relevantes: `produto`, `product_kind`, `valor_total`, `receitas`, `status`
(`active`/`canceled` — que a versão do upload nem tem). E `monde.venda` traz `setor_macro` e
`data_venda`. **Todo** insumo da RPC de subsetor existe no espelho.

**O que falta é o DE-PARA de produto, e é curadoria, não código.**

## 4. A medição do de-para (o número que dimensiona o Scope B)

`SELECT` read-only pelo `SUPABASE_DB_URL` — o cliente `pg` já está no `node_modules`, então não
houve dependência nova nem migration. Weddings, **itens ativos**, todo o histórico:

| `product_kind` | itens | descrições | faturamento |
|---|---|---|---|
| `hotels` | 4.454 | 154 | 29.639.574,09 |
| `others` | 2.137 | 17 | 23.925.263,37 |
| `airline_tickets` | 490 | 1 | 2.672.213,19 |
| `operations` | 74 | 6 | 156.468,35 |
| `travel_packages` | 24 | 10 | 113.775,34 |
| `insurances` | 496 | 1 | 96.390,66 |
| `car_rentals` | 12 | 1 | 21.825,87 |

**7 `product_kind`, 190 descrições, 7.687 itens, R$ 56.625.510,87.**

**Repontar hoje, com o mapa atual, casaria só 46% do faturamento** — 3.072 de 7.687 itens;
R$ 26.060.900,22 de R$ 56.625.510,87. Os outros 54% cairiam em "Não Classificados". O motivo: o
espelho guarda `produto = item.description` (texto livre por item — `transform.ts:116`; o fixture
mostra `description: 'Hotel Single'`), enquanto `analytics.dim_produto_subsetor` tem **21 linhas com
as CATEGORIAS do upload** ("Diárias de Hospedagem", "Contrato de Casamento"). E **não existe nenhum
de-para `product_kind` → subsetor no repo** — `product_kind` só aparece no DDL e no transform.

### 4.1 O trabalho é muito menor do que "190 descrições" sugere

As 154 descrições de `hotels` são **nomes de hotel**; resolvem-se por **kind**, não por descrição:

- `hotels` → CONVIDADOS – Hospedagens
- `airline_tickets`, `insurances`, `car_rentals` → CONVIDADOS – Extras

**Quatro regras cobrem R$ 32,4 Mi (57% do total).**

A curadoria real está em `others`/`operations`/`travel_packages`: **33 descrições**, das quais
**11 já casam** com o mapa atual (Extras Casamento → PRODUÇÃO · Pacote de Casamento →
PLANEJAMENTO · Contrato de casamento → COMERCIAL · Receptivo · Transporte Rodoviario · Taxa de
Serviço · Cerimonial · Ingressos · Passes de Trem · Bagagens ou assentos) e **~22 precisam de
decisão de negócio**. As que pesam:

| Descrição | `product_kind` | Faturamento |
|---|---|---|
| `Bloqueio Hospedagem` | others | 469.040,30 |
| `Evento` | others | 100.295,25 |
| `Catamarã Privativo` | travel_packages | 61.940,19 |
| `Atualização de Contrato de Casamento` | others | 54.864,00 |
| `G - WelConnect - Punta Cana AUG2025` | operations | 47.523,96 |
| `G - WelConnect - Colômbia AGO2026` | operations | 46.631,53 |
| `G - WelConnect - Mendoza MAR2026` | operations | 44.461,02 |
| `G - WelConnect - Curaçao AUG2024` | operations | 16.489,20 |

### 4.2 Três achados que mudam COMO o de-para deve ser feito

**Quase-acertos que vazariam em silêncio** — pedem normalização, não linha nova na lista:

- Monde `Atualização de Contrato de Casamento` × mapa **`Atualização de Contrato`**
- Monde `Contrato de casamento - venda online` × mapa **`Contrato de casamento`**

Uma palavra de diferença, ~R$ 60 k somados.

**O namespace é ABERTO por construção.** `operations` contém produto batizado por evento —
`W - Joana e Daniel - 22FEV25`, `W - Júlia e Leandro - 04MAR25`. Qualquer de-para por descrição vai
vazar para sempre: ele **precisa de fallback por `product_kind`**, nunca só de uma lista.

**Há entrada livre com sujeira:** existe descrição com espaço à esquerda (` Dominican Snack`). O
join usa `TRIM`, então não quebra hoje — mas confirma que o campo é digitado à mão.

## 5. O balde `NÃO_CLASSIFICADO` é estrutural — e a Performance o descarta em silêncio

`get_sumario_subsetor` devolve um 6º item, `NÃO_CLASSIFICADO`, para produtos de Weddings fora do
mapa. `weddings-kpis-section.tsx:216` itera `SUBSETOR_ORDER.map(...)` — a lista fixa de 5 — e
**nunca o encontra**. Logo **os 5 cards da Performance já não fecham com o total de Weddings**, e
isso nunca apareceu na tela. Continua assim (não foi tocado).

Tamanho: **não-nulo em 26 dos últimos 48 meses**, desde fev/2023, R$ 382.763,15 acumulados; maior
mês **abr/2024 (R$ 105.550,25)**. Em 2026: **4 produtos, R$ 72.717,41**, com receita
**−37.339,05** vinda de **um único produto** (`G - WelConnect - Colômbia AGO2026`).

**Pendência de negócio, um nível ACIMA do subsetor:** as viagens `G - WelConnect - Colômbia` e
`Mendoza` estão classificadas como **Weddings no nível de SETOR**, uma delas com receita negativa
de R$ 37,3 mil. Não têm cara de casamento. Decisão do Yan.

**Sem processo de manutenção do mapa:** a última carga foi por migration, em 2024. Produto novo
entra em Weddings, sai dos subsetores e ninguém é avisado — e, com meta por subsetor, passaria a
**parecer não-cumprimento de meta**.

## 6. A divergência de fonte NÃO é estável — e é o achado mais operacional

O card do setor vem do **Monde** (`get_executiva_kpis`); os subsetores vêm do **upload**
(`analytics.fato_venda_item`). Medições do MESMO dia (04/08):

| Período | Weddings (Monde) | Soma dos 5 (upload) | Δ |
|---|---|---|---|
| Ago/2026, **manhã** | 48.144,44 | 48.144,44 | **0,00** |
| Ago/2026, **tarde** | 80.696,38 | 48.144,44 | **32.551,94 (40,3%)** |
| Jul/2026 | 2.154.633,82 | 1.743.694,79 | 19,1% |
| Ano 2026 | 10.915.158,83 | 10.363.739,15 | 5,1% |

Entre as duas medições entraram vendas no Monde que o upload não tinha. **Não dá para tratar essa
divergência como resíduo pequeno e estável** — ela é função de quando o upload foi feito por
último.

⚠️ **O selo "Última atualização" das telas de Metas é do MONDE, não do upload.** Qualquer número
que venha do upload pode estar arbitrariamente velho **sem nenhuma indicação própria na tela**. Um
selo de frescor do upload é candidato a versão própria — e vale para além de Metas.

## 7. Post-mortem do incidente de produção

**O que quebrou.** A `0234` fez `metas_upsert` recusar meta de Weddings
(`METAS_WEDDINGS_DERIVADO`). Está correto **com** o front da feature, onde a coluna Weddings do
Cadastro é read-only e nunca é enviada. Mas as migrations foram aplicadas **antes do merge**, e o
front vigente monta o lote com `for (const s of setores)` sobre
`{1 Lazer, 2 Weddings, 3 Corporativo}`, sem exclusão.

**O efeito foi pior que "não salva Weddings":** o `RAISE` aborta a transação, então **uma única
célula alterada de Weddings derrubava o lote inteiro** — Trips e Corporativo da mesma leva também
não gravavam. E a mensagem chegava genérica ("Falha ao salvar as metas"), porque o `traduzirErro`
que reconhece o código novo está no front não mergeado.

**Por que nenhum gate pegou.** `tsc`, `lint`, `build` e 727 testes estavam verdes — todos rodam
contra o código **da branch**, onde a combinação é coerente. O caso quebrado é
`banco novo × front antigo`, que só existe em produção e que nenhum teste do repo representa.

**Corrigido** pela `0235`, que remove a trava. Verificada por REST **sem escrever nada**: item de
Weddings com mês inválido devolve `METAS_MES_INVALIDO` — como a trava vinha **antes** das
validações, o erro que aparece prova que ela saiu.

### A lição, generalizada

> **Migration não é segura só por ser ADITIVA no schema.** O que decide é o **front que está no
> ar**, não o da branch. Comportamento novo só pode ser aplicado antes do merge se for
> **invisível** para o código já publicado. Recusar algo que o front vigente envia é, por
> definição, visível — e se a versão atrasa ou para, a quebra fica.

Regra prática: antes de aplicar, perguntar *"o front em produção faz alguma chamada que este
comportamento novo passa a rejeitar?"*. Se sim, a migration vai **junto** com o merge, não antes.
Vale para travas, `CHECK` mais estritos, `NOT NULL` novo e remoção de parâmetro.

## 8. Lições de método (valem além deste caso)

1. **Guard que nunca falhou não é guard.** A primeira tentativa de ver o guard da lista canônica
   reprovando não alterou o arquivo (a string procurada tinha quebra de linha no meio) e o teste
   passou. Só a mutação refeita provou que ele funciona.
2. **Onde uma derivação mora importa mais que como ela calcula.** A meta derivada de Weddings, se
   morasse dentro de `metasDoSetor`, deixaria o ramo `'todos'` (Group) somando a linha crua
   enquanto o card mostrava a soma — dois números discordando **por construção**. Derivar UMA vez,
   antes de montar os painéis.
3. **Duas telas com Salvar próprio na mesma página não podem re-hidratar por REFERÊNCIA de array.**
   `router.refresh()` entrega array novo às duas, então salvar uma apagava a digitação não salva da
   outra. O gatilho tem de ser um valor estável (o `ano`), e quem zera pendência é o Salvar.
4. **`ON CONFLICT DO UPDATE` sem `COALESCE` ⇒ item de upsert é LINHA COMPLETA.** Omitir um campo
   apaga o valor gravado — perda de dado por omissão, não por intenção.
5. **`NULL` em comparação nunca é TRUE.** `v_sid = NULL` e `v_mes < 1` com NULL **não disparam**
   validação; o erro só aparece depois, como violação crua de `NOT NULL`. Todo guard de RPC precisa
   de `IS NULL OR`.
6. **Tooltip/`position:absolute` dentro de cortina é decapitado** pelo `overflow-hidden` do clip.
   A saída é a informação como TEXTO. (E `financeiro/collapsible-section.tsx` usa o padrão **errado**
   de cortina — desmonta no fechado — e não deve ser copiado.)
7. **"Adotar em vez de construir" vale para MECANISMO, não para a forma que o usuário especificou.**
   Um pedido de "6º card" virou faixa porque instruí um subagente a reaproveitar um visual
   existente. Reuso não é licença para trocar o substantivo do pedido.
8. **Verificar antes de afirmar, mesmo com a memória confiante.** A premissa "o espelho não tem
   item-level" atravessou briefing, ADR e out-briefing sem nunca ser conferida — e era falsa.

## 9. Decisões de produto já tomadas (não re-litigar na retomada)

Tomadas pelo Yan em 04/08, registradas no ADR-0163 (branch em stand-by):

1. Meta de subsetor é **meta de MIX DE PRODUTO**, não de equipe. Se o objetivo for cobrar TIME, o
   eixo de produto não serve — é outro modelo de dados.
2. A meta de Weddings é **derivada** da soma dos subsetores, com **rampa por mês** (mês sem
   subsetor cadastrado mantém a meta antiga). Existe porque havia R$ 23,8 Mi cadastrados para 2026 e
   o **Group é a soma dos três setores** — travar sem rampa derrubaria o card de cabeçalho.
3. **COMERCIAL tem DUAS metas:** contratos (governa a barra) e faturamento (compõe a soma). Sem a
   segunda, o realizado contaria 5 subsetores contra meta de 4. As duas medem universos diferentes:
   contratos = **um** produto; R$ = **três**.
4. Subsetores têm Faturamento **e** % Rec.
5. **6º card "Não Classificados"**, recolhível, com a lista de produtos.
6. Subsetores **não** entram no gráfico "Ritmo do período" (não existe série diária por subsetor).

## 10. O que ficou no banco, inerte

- `app.meta_subsetor` e `app.meta_subsetor_historico` — **vazias**, nenhum consumidor publicado.
- `metas_subsetor_listar`, `metas_subsetor_upsert`, `metas_sumario_subsetor` — sem call-site.
- A chave `produtos_nao_classificados` no payload de `get_sumario_subsetor__nucleo` — **aditiva**;
  os 3 consumidores da Performance fazem cast solto e ignoram chave desconhecida. **Funciona hoje**
  e a invariante foi verificada: a soma da lista bate com o agregado do balde **ao centavo**.
- **Assimetria registrada:** a invariante "Weddings é derivada" nunca foi imposta na camada de
  dado. `public.inserir_metas` (`0009`, `service_role`, usada pelo seed) escreve em
  `app.meta_setor` sem passar por trava alguma.

## 11. Se a versão for retomada — checklist

1. **Decidir o eixo primeiro:** manter no upload (e assumir a divergência do §6) ou construir o
   de-para do §4 e repontar. Só depois mexer no código.
2. Rebase no `main`, **redefinir o número da versão** e refazer bump + os dois CHANGELOGs (foram
   revertidos na branch para liberar o `5.4.4`).
3. Conferir se `ADR-0163` ainda está livre.
4. **Reaplicar a trava de Weddings JUNTO com o merge do front** — a `0235` a removeu de propósito
   (§7).
5. **A conferência visual nunca foi concluída.** O §8 do out-briefing da branch lista o que olhar;
   a 1ª rodada do Yan já rendeu duas correções (o card e o bloco "Como isto soma").
6. Se o de-para for construído, lembrar que **o núcleo é compartilhado com a Performance** —
   repontá-lo muda os números de subsetor lá também, e isso exige validação de negócio.

## 12. Pendências abertas do Yan

- **Decidir o caminho do eixo de subsetor** (§11.1) — é o que destrava a versão.
- **Classificar as ~22 descrições** do §4.1, se o caminho for o de-para.
- **As viagens WelConnect** classificadas como Weddings no nível de setor (§5).
- **Manutenção do mapa produto→subsetor** — hoje não há tela nem processo.
- **Selo de frescor do upload** nas telas que o consomem (§6).
