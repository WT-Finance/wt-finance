# ADR-0170 — DRE por competência: regime novo, com árvore própria

- **Status:** aceito
- **Data:** 2026-08-25
- **Versão:** v5.8.0
- **Migrations:** `0255` (base de upload), `0256` (árvore + de-para + view), `0257` (expansão + RPC de leitura) — todas ADITIVAS
- **Substitui/altera:** nada. O regime de caixa segue intocado.

## Contexto

A página `/financeiro/dre` respondia a UMA pergunta: quanto andou na conta. O fato gerador
era a movimentação (realizado) e o vencimento (previsto), a fonte era o upload de lançamentos
e o motor era `financeiro.fato_fluxo` + `get_dre_mensal`.

A diretoria também lê o resultado **por competência** — fato gerador = data de **emissão** —, e
essa leitura vivia fora do Janus: num modelo HTML mantido pela gerente, alimentado à mão a
partir do export "Demonstrativo de Resultado" do Monde. Duas consequências: o número não tinha
histórico versionado e ninguém além dela conseguia reproduzi-lo.

A v5.8.0 traz o regime para dentro do produto.

## Decisões

### 1. Árvore PRÓPRIA, não reuso de `dre_bloco`/`dre_categoria_map`

A competência ganhou `financeiro.dre_comp_bloco` (26 blocos) e `financeiro.dre_comp_map`
(141 pares), espelhando o desenho das tabelas do caixa sem compartilhá-las.

**Por quê.** As duas árvores divergem de verdade: competência não tem REPASSE nem IMOBILIZADO,
e tem ONOP_H, LL, DL e REXG que o caixa não tem. E as CHAVES de mapeamento são de espécies
diferentes — o caixa chaveia por `dim_categoria.id` (um inteiro do próprio banco), a
competência pelo par de TEXTO `(Grupo, Descrição)` que vem no arquivo. Forçar uma tabela só
criaria uma que serve mal aos dois.

**O que se aceita:** duas curadorias a manter. Convergência é decisão futura, deliberadamente
não tomada agora.

### 2. Fórmula com SINAL

Em `dre_bloco` a fórmula é um array JSONB de chaves que se **somam**, e os sinais vivem no dado
(despesa é negativa). Aqui isso não basta: o **Resultado Gerencial é `REX − REEMB`** — uma
subtração de um bloco que já está somado dentro do REX. Então o array aceita chave prefixada
por `-`: `["REX","-REEMB"]`. Sem prefixo soma; com `-` subtrai; `formula IS NULL` é folha e
soma as próprias linhas do de-para.

### 3. Leitura por VIEW + expansão da árvore em folhas signadas

A base chega **já no grão da DRE** (um registro por par × mês, ~3,2 mil linhas). Não há fato a
materializar, então `financeiro.vw_dre_competencia` é a base `LEFT JOIN` o de-para, e não existe
deriva possível entre base e leitura.

As fórmulas apontam para duas direções — um `blocoH` referencia os subgrupos que vêm **depois**
dele na ordem (`RB_H@10 = RV@20 + REEMB@30`) e um `tot` referencia chaves **anteriores**
(`ROL@50 = RB_H@10 + IMP_H@40`) —, então não existe passe único por `ordem`. A saída é
`financeiro.vw_dre_comp_expansao`: cada chave é expandida na sua combinação **signada de
folhas**. O ganho não é de organização: no REXG o coeficiente de REEMB soma `+1 − 1 = 0` e o
`HAVING` o descarta — a subtração vira **aritmética de coeficientes**, não caso especial.

⚠️ A recursão tem teto de profundidade (24) como rede contra laço infinito. **Aciclicidade é
validada no gerador do seed**, não no teto: um ciclo passaria pelo `CREATE VIEW` sem erro e
produziria coeficientes PARCIAIS em silêncio. Quando existir editor da árvore de competência,
ele tem de recusar ciclo na gravação.

### 4. Fusão por nome, no DESTINO

Linhas homônimas de origens diferentes viram UMA linha exibida. São exatamente 3 —
`Comissão`, `Reembolso Cliente`, `Reembolso Fornecedor` —, e medimos que são precisamente as
3 únicas descrições que existem sob dois pais no arquivo. O critério é econômico: comissão é
comissão, independente de o Monde registrar como lançamento ou como campo da venda.

A chave do de-para é **composta** `(grupo_arquivo, descricao_arquivo)` — uma chave só por
descrição colidiria. A fusão acontece no **destino** (mesma `sub_chave` + mesmo `rotulo_linha`),
nunca na chave: é um `GROUP BY`, não um ramo de código. 141 pares ⇒ **138 linhas exibidas**.

### 5. REEMB dentro da Receita Bruta; REXG como LINHA

Reembolsos (Desconto, Reembolso Cliente, Reembolso Fornecedor) são subgrupo da Receita Bruta:
passagem de dinheiro, não resultado. E `REXG = REX − REEMB` entra como **última linha da
tabela**, em formato de totalizador — **não** como card nem destaque nesta versão.

Medido: `REEMB(2024) = −1.114.947,00`, então `REXG(2024) = 1.323.690,77` contra
`REX(2024) = 208.743,77`. É uma diferença grande e deliberada; o rótulo diz
"(=) RESULTADO GERENCIAL (ex-Reembolsos)" para não haver dúvida sobre o que foi retirado.

### 6. Rótulos seguem a regra da v5.7.0, e não o modelo da gerente

Agregação carrega operador `(+)/(−)/(+/−)/(=)`; folha **nunca**. As folhas do modelo dela com
prefixo `(-)` (ex.: "(-) Adiantamento 13º Salário") entram SEM prefixo. Divergência deliberada,
e a guarda mecânica de rótulos foi estendida à árvore nova.

### 7. Base da Análise Vertical: Receita Bruta (`RB_H`), não ROL

O briefing pedia "÷ ROL" porque foi escrito sobre a v5.7.1. A v5.7.2 (mergeada horas antes)
trocou a base da AV para a Receita Bruta. **Decisão do Yan nesta sessão: seguir a regra viva** —
duas seções na mesma página com denominadores diferentes seriam dois números vizinhos que não
conversam. A árvore de competência já tem `RB_H` como primeira linha, então `src/lib/dre/av.ts`
serve sem alteração.

### 8. A seção de Competência vem ACIMA do Regime de Caixa

O briefing dizia "abaixo". **Decisão do Yan nesta sessão.** Consequência de projeto: a seção
nova é a primeira coisa da página, o que eleva a exigência do fail-safe — sem payload ela
**não renderiza**, porque bloco quebrado no topo é pior que a ausência dele. O regime de caixa
segue inteiro em qualquer cenário.

### 9. Sem toggle Realizado/Previsto

O regime tem **uma coluna por mês**: não existe projeção a mostrar, então as pills de modo
não aparecem — oferecê-las abriria colunas de zero.

### 10. O editor da estrutura EXISTE (revisão desta decisão, ainda na v5.8.0)

Esta decisão nasceu como "sem editor nesta versão; curadoria por migration, e editor por
regime é pendência registrada". **O Yan pediu o editor com o PR já aberto**, replicando o que
existe no Demonstrativo por Fluxo de Caixa. Está implementado (migration `0260`), e a
curadoria por migration segue sendo a origem do **seed**: daqui para frente a estrutura viva é
editável, exatamente como já acontece no caixa — onde a estrutura viva divergiu do seed `0205`
e isso é o comportamento esperado, não um defeito.

**O de-para editável é uma tabela NOVA (`financeiro.dre_comp_par`), não um `ALTER` na
`dre_comp_map`.** O editor precisa de três estados por linha — classificada, na bandeja
(sem destino) e excluída — e a `dre_comp_map` nasceu com `sub_chave NOT NULL`, porque para
curadoria por migration todo par tem destino por definição. O caminho óbvio,
`ALTER TABLE ... ALTER COLUMN sub_chave DROP NOT NULL`, foi **rejeitado**: o classificador do
backup-gate casa `/ALTER\s+TABLE[\s\S]*DROP/` e trataria a migration como DESTRUTIVA, que
exige confirmação humana em TTY (ADR-0131). O regex está certo em ser conservador — quem tinha
de mudar era o desenho, não a rede. A `dre_comp_map` fica **órfã de leitura** sem ser removida
(DROP também é destrutivo): dívida registrada, custo baixo (tabela pequena, ainda é a fonte do
seed e o que o teste de paridade confere contra os anexos).

Ganho lateral do desenho: como `dre_comp_par` é ao mesmo tempo o catálogo de pares e o
de-para, a bandeja é `sub_chave IS NULL` — mais simples que no caixa, onde ela é um
`NOT EXISTS` contra `dim_categoria`. E o salvar é sempre `UPDATE` por id, nunca upsert, o que
fecha uma porta que o caixa deixa aberta: lá é possível inserir no de-para uma categoria que
não existe no dado.

**O editor provisiona ao abrir.** Um par que já está na base mas ainda não tem linha no
de-para aparece corretamente na bandeja da LEITURA (o `LEFT JOIN` da view garante), mas
ficaria invisível ao editor, que identifica cada linha por id. A alternativa — a RPC do editor
tolerar o par sem linha — mostraria a órfã e não deixaria mexer nela, o que é pior. Então a
página chama `provisionar_dre_comp_par()` (idempotente) antes de ler; de quebra, provisionando
pela sessão, o diário atribui a inserção a quem abriu a tela em vez de gravar um lote anônimo.

## Consequências

- A mesma página passa a mostrar **DOIS resultados para o mesmo mês**, por critérios diferentes.
  Isso é o ponto da entrega e é também o principal risco de leitura: exige comunicação à
  liderança (registrado como pendência).
- O oráculo é estrutural: expandindo as fórmulas, `REX` tem coeficiente **+1 em cada uma das 15
  folhas**, e as 15 folhas são exatamente os destinos que o de-para usa. Logo
  **`REX ≡ Σ(base do ano)` por construção**, e não por coincidência numérica — desde que a
  bandeja esteja vazia. Provado sem banco em `src/lib/dre/competencia-estrutura.test.ts` e
  medido ao vivo em `src/lib/rpc-contrato.test.ts`.
- Par novo num export futuro **não some**: cai na bandeja "Não classificadas" (a view é
  `LEFT JOIN` de propósito) e a reconciliação `base = linhas + bandeja + excluídas` continua
  fechando. Medido injetando um par inventado e revertendo.
- A base de upload é **full-swap**: re-upload substitui, sem migration.

## Alternativas descartadas

- **Rota própria** (`/financeiro/dre-competencia`): descartada — a comparação entre regimes é o
  valor, e ela exige as duas leituras na mesma tela.
- **Materializar um fato de competência**: descartada — a base já chega no grão da DRE, então um
  fato seria uma cópia com deriva possível e nenhuma informação nova.
- **Converger as duas árvores agora**: descartada — ver decisão 1.
- **Reusar `dreBandejaSchema` do caixa** para a bandeja da competência: descartada por ser
  ativamente perigosa. `categoria_id` é obrigatório lá, a competência não o tem, e `bandeja` é
  campo obrigatório do envelope — o `safeParse` falharia no objeto RAIZ e a seção inteira
  desapareceria com um `console.error`, no **primeiro** par não mapeado. Ou seja: apagaria a
  tela exatamente quando a bandeja tinha algo a dizer. (Achado ALTO do `revisor-db`.)
