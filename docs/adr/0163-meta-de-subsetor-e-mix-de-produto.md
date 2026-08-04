# ADR-0163 — Meta de subsetor é meta de MIX DE PRODUTO; Weddings passa a ser derivada

- **Status:** aceito
- **Data:** 2026-08-04
- **Versão:** v5.4.4 (Metas — eixo de subsetor de Weddings)
- **Contexto:** aba Metas › Acompanhamento e Cadastro

## Decisão 1 — "Meta de subsetor" é meta de MIX DE PRODUTO, não de equipe

O eixo de subsetor de Weddings **não é organizacional**. Ele vem de
`analytics.dim_produto_subsetor` (criada na `0026`, dividida em 5 pela `0071`/ADR-0069):
uma tabela de **21 linhas curadas à mão**, com `produto` como chave, que atribui cada venda
pelo NOME DO PRODUTO. O join é `dps.produto_normalizado = UPPER(TRIM(dp.nome))`, então caixa
e espaço não importam.

Composição real do faturamento de Weddings em 2026, medida antes de decidir:

| Subsetor | Produtos | % do faturamento |
|---|---|---|
| CONVIDADOS – Hospedagens | Diárias de Hospedagem (**1 só**) | 53,4% |
| PRODUÇÃO | Cerimonial · Extras Casamento | 21,7% |
| PLANEJAMENTO | Pacote de Casamento · Pacote Turístico (passeios) · Eventos | 16,0% |
| CONVIDADOS – Extras | 10 produtos | 6,4% |
| COMERCIAL | Contrato de Casamento · Atualização de Contrato · Taxa de Serviço | 1,7% |
| *(NÃO_CLASSIFICADO)* | produto fora da matriz | 0,7% |

**Por que registrar isso como decisão de MÉTRICA e não como detalhe de implementação.**
"Meta do Comercial" lido como meta de equipe e lido como meta de família de produto são
duas coisas diferentes, e a segunda é a que o dado sustenta. Um card que diz "Comercial:
24% da meta" será interpretado como desempenho de time por quem não sabe que o balde é
`Contrato de Casamento + Atualização de Contrato + Taxa de Serviço`. A ajuda "?" da
expansão declara isso na tela; este ADR fixa a definição para que ninguém a reinterprete
depois. **Se o Welcome Group quiser meta por equipe, o eixo de produto não serve** — seria
outro modelo de dados, não um ajuste deste.

**Consequência aceita: o mapa é uma lista fechada contra um namespace ABERTO.** O Monde
recebe produtos batizados por grupo (`G - WelConnect - Colômbia AGO2026`), e produto novo
cai em `NÃO_CLASSIFICADO`, saindo dos 5 cards. Antes da v5.4.4 isso era invisível: a
Performance itera `SUBSETOR_ORDER` (5) e descartava o 6º balde em silêncio — R$ 72,7 k em
2026, não-nulo em **26 dos últimos 48 meses**, com receita **negativa** em três deles. Com
meta por subsetor, produto novo passaria a **parecer não-cumprimento de meta**. Por isso a
faixa "Não Classificados" é obrigatória, não decorativa: ela é o que fecha a aritmética na
tela. A **manutenção** do mapa (hoje sem tela nem processo; última carga por migration em
2024) fica registrada como pendência, fora desta versão.

## Decisão 2 — A meta de Weddings é DERIVADA da soma dos subsetores, com rampa por mês

`app.meta_setor` continua sendo a tabela do setor macro, mas a linha de **Weddings** deixa
de ser entrada direta: a grade de Setor a mostra travada e `metas_upsert` **recusa**
`setor_macro_id` de Weddings (`METAS_WEDDINGS_DERIVADO`, `0234`).

**Regra, determinística por mês:**

```
mês COM ao menos uma linha em app.meta_subsetor → meta de Weddings = soma dos subsetores
mês SEM nenhuma linha                          → meta de Weddings = a linha de app.meta_setor
```

**Por que a rampa existe.** Havia R$ 23,8 Mi de metas de Weddings cadastradas para 2026
quando o eixo nasceu. Como o **Group é a soma dos três setores**, travar Weddings sem
fallback derrubaria também a meta do Group — o card de cabeçalho da tela — até o último mês
ser redistribuído à mão. As alternativas foram descartadas: *semear proporcional ao
realizado* inventaria metas por subsetor com aparência de oficiais, que o usuário nunca
definiu; *zerar e preencher* deixaria a tela da diretoria com meta 0 por tempo
indeterminado. A rampa tem **fim visível**: a célula travada do Cadastro diz em qual regime
cada mês está, então dá para saber quando ela pode ser removida.

**O gatilho é "existe linha", não "soma > 0"** — de propósito. Com "soma > 0" seria
impossível cadastrar um mês legitimamente zerado (o valor antigo ressuscitaria sozinho, sem
explicação). Isso acopla o Cadastro à regra: o quadro de subsetores grava **só as linhas que
o usuário tocou**; gravar zeros nas 60 células tornaria todos os meses derivados de uma vez
e levaria Weddings e Group a zero.

**Onde a derivação acontece importa mais que como.** Ela é aplicada UMA vez, sobre o array
de linhas de meta, **antes** de qualquer painel ser montado (`aplicarRampaWeddings`, chamada
em `carregar-acompanhamento.ts`). A tentação é pôr um `if (key === 'Weddings')` dentro de
`metasDoSetor` — e ali estaria **errado**: o ramo `'todos'` daquela função soma `valor_meta`
de todas as linhas sem olhar setor, então o card de Weddings mostraria a soma dos subsetores
enquanto o Group somaria a linha crua. Dois números discordando na mesma tela, por
construção. Caso de contrato permanente cobre a igualdade
`Group == Trips + Weddings(derivada) + Corporativo`, com asserção explícita de que **não** é
a soma com a linha crua.

**Assimetria registrada (achado do `revisor-db`):** a invariante "Weddings é derivada" é
imposta em `metas_upsert`, não na camada de dado. `public.inserir_metas` (`0009`,
`service_role`-only, usada pelo seed) escreve em `app.meta_setor` **sem** passar pela trava.
Risco prático baixo — nenhum usuário da UI alcança aquele caminho —, mas um script
administrativo futuro que reuse `inserir_metas` para Weddings passaria batido.

## Decisão 3 — COMERCIAL tem DUAS metas, em unidades diferentes

Comercial recebe uma meta de **contratos** e uma de **faturamento**:

- a de **contratos** governa a métrica grande, o "% da meta", o "% esperado" e a **barra**
  do card — é como a diretoria cobra o Comercial (decisão registrada na `0099`);
- a de **faturamento** não tem barra própria e existe para **compor a soma** da meta de
  Weddings.

**Por que as duas, e não uma.** Com meta só em contratos, o realizado de Weddings incluiria
o faturamento de Comercial (R$ 181,7 k em 2026) enquanto a meta somaria apenas 4 subsetores
— numerador com 5, denominador com 4, e o "% da meta" de Weddings **estruturalmente
otimista**. Com meta só em R$, Comercial perderia a leitura de contratos que a diretoria
pediu. As duas metas fecham a aritmética sem tirar a leitura.

**Ressalva que a tela tem de declarar:** as duas cobrem universos diferentes.
`meta_contratos` é medida contra **um** produto
(`UPPER(TRIM(dp.nome)) = 'CONTRATO DE CASAMENTO'`, filtro da `0099`), enquanto o
`valor_meta` de Comercial cobre os **três** produtos do balde. Dividir um pelo outro não dá
ticket médio. Está no "?" da expansão.

Consequência técnica: `calcularRitmoAgregado` é **agnóstico de unidade** — `valorMeta` e
`realizado` podem ser R$ ou contagem. Comercial faz duas chamadas da mesma função.

## Decisão 4 — Sem série diária por subsetor: ritmo agregado, e nada de fonte nova

Não existe série diária por subsetor em fonte nenhuma: `metas_ritmo_diario` foi repontada ao
Monde (`0181`) e a mv só tem `data_venda + setor_macro_id`; `get_sumario_subsetor` tem
subsetor mas só agregado por período. Os cards de subsetor **não entram** no gráfico "Ritmo
do período".

Isso não custa nada do que o card mostra, porque o **esperado é linear no tempo**
(`metaPeriodo × pctDecorrido`, ADR-0146) — a série só alimentava a "escadinha" do gráfico.
`calcularRitmoAgregado` faz as mesmas contas sem ela, e `janelaDoPeriodo` é **fatorada e
compartilhada** com `calcularRitmo` para que os dois "% esperado" da mesma tela não possam
divergir (caso de contrato compara as duas saídas campo a campo em 4 cenários).

**Construir a série seria mexer no que o Scope B vai reescrever.** Subsetor é eixo de
PRODUTO e por isso só existe no upload (`analytics.fato_venda_item`); o espelho do Monde
ainda não tem granularidade de item. Regra desta versão: **nenhuma query nova de subsetor**.
A RPC de leitura de Metas é um wrapper de 6 linhas sobre o núcleo já existente, e a lista de
produtos não classificados entrou como **chave nova no payload desse mesmo núcleo** — então
o Scope B repointa **um** corpo e as duas telas (Performance e Metas) seguem juntas.

**Consequência aceita e declarada na tela:** enquanto o subsetor vier do upload e o setor do
Monde, a soma dos 5 cards **não fecha** com o card de Weddings. Medido em 2026: **0,00** no
mês corrente (a pill default), **19,1%** em julho, **5,1%** no ano. O "?" da expansão
declara as fontes; a faixa "Não Classificados" absorve parte do resíduo. A conclusão do
Scope B elimina a divergência por consequência, sem mudar nada desta versão.

## Alternativas descartadas

- **Independentes com aviso de divergência** (Weddings segue editável, o Cadastro avisa
  quando o Total dos subsetores não bate): mantinha o controle direto do usuário, mas
  conviveria para sempre com dois números que podem divergir — o padrão que já mordeu neste
  projeto. Descartada pelo usuário em favor da derivação.
- **Reescalar o faturamento dos subsetores** para fechar com o total do Monde: inventa
  número. Nunca considerada seriamente.
- **Excluir Comercial da soma** e aceitar o "% da meta" otimista de Weddings: descartada por
  ser exatamente a distorção que a Decisão 3 fecha.
- **Dimensão `analytics.dim_subsetor`** com FK numérica, em vez de `text` + `CHECK`: não
  existe dimensão de subsetor hoje (`dim_produto_subsetor` tem PK em `produto`), e o
  precedente do repo é `CHECK IN` (a coluna `subsetor` grossa da `0026`). Custo aceito: a
  lista canônica vive em dois lugares (SQL e `SUBSETOR_ORDER`), com **guard mecânico** que lê
  a migration e compara — visto reprovando ao trocar `PRODUÇÃO` por `PRODUCAO`.
