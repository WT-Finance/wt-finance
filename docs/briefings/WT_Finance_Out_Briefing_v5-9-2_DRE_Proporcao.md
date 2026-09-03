# Out-Briefing v5.9.2 — DRE: proporção sobre a Receita Bruta

**PATCH** · branch `feat/v5-9-2-dre-proporcao-e-acumulacao` · **ZERO migration** · **sem ADR
novo** · **1171 testes** (de 1146) · base: `origin/main` na v5.9.1 (`ed1de9c`)

Rota B: sem briefing próprio — o plano validado em plan mode virou a spec
(`docs/briefings/spec-v5-9-2-dre-proporcao-e-acumulacao.md`, commit `3dbd397`).

---

## 1. O que foi entregue

| Item | Estado |
|---|---|
| **Grade "Proporção sobre a Receita Bruta"** (7 mini-gráficos, Visão Geral) | entregue |
| **Cabeçalho da página** + os dois selos de frescor no topo | entregue |
| Decomposição partindo do fechamento do ano anterior | **avaliado e REVERTIDO** (§4) |

A grade responde o que nenhum card respondia: **se um grupo cresceu mais rápido que a
receita**. RH saiu de −32,1% para −42,2% da receita em dois anos — o valor absoluto dele
subiu junto com o faturamento, e só a proporção mostra que subiu mais.

---

## 2. As decisões que a medição forçou

Quatro escolhas desta versão foram tomadas contra número, não contra intuição.

### 2.1 Eixo ANUAL, não mensal

A proporção mensal foi medida e não serve: um mês de receita fraca estoura o percentual e a
linha vira serrote. O custo dos serviços, com média de −4%, marca **−26% em abril de 2026** —
não porque o custo explodiu, mas porque a receita daquele mês foi baixa.

### 2.2 Escala COMPARÁVEL entre os sete gráficos

Com o eixo auto-escalado, cada gráfico esticava a própria série até preencher o card. Medido:

| grupo | amplitude |
|---|---|
| RH | **10,16 p.p.** |
| RHB | 4,34 p.p. |
| MKT / CUSTO / ADM / ESTR | 1,3 – 2,0 p.p. |
| COM | **0,36 p.p.** |

Uma razão de **28×** desenhava a mesma inclinação. Agora todas as janelas têm a mesma altura
em pontos percentuais (12 p.p.), posicionadas no nível de cada série: **RH usa 85% da altura,
Comerciais 3%**.

**O custo, aceito:** grupo estável fica quase reto. É a verdade sobre ele e é o que se queria
enxergar — mas surpreende, então o card anota o Δ e o "?" avisa que a escala é comum.

### 2.3 Eixo INVERTIDO

A AV de despesa é negativa. Com o eixo normal, um grupo que passa a pesar mais desenha a curva
DESCENDO — o oposto do que o olho lê. O eixo virou; os rótulos continuam `−5,4%`, como a coluna
AV do demonstrativo. **Não** se plotou o módulo: ali a mesma grandeza apareceria com dois
sinais em telas vizinhas, o defeito que a v5.7.2 corrigiu ao unificar a base da AV.

### 2.4 Dois Δ, e sem seta

`Δ Total` e `Δ YoY` porque contam coisas diferentes — RH Benefícios fecha `+1,6 p.p.` no
período e `−2,8 p.p.` no último ano.

A referência de cor que o Yan passou (cards de KPI) usa seta. Aqui **não**: lá a métrica é
receita e ↑ quer dizer "subiu, é bom". Aqui a série é despesa com sinal algébrico — um Δ
positivo significa que a proporção subiu (de −5,1% para −3,3%) **e** que a despesa passou a
pesar menos. A seta teria de escolher entre apontar a direção do número e a do significado, e
qualquer escolha contradiz a outra metade.

O Δ usa **ponto decimal** (`−1.8 p.p.`), e não a vírgula do resto da página — decisão do Yan.
Ele é uma ANOTAÇÃO sobre o gráfico, não um valor contábil que alguém confere contra o
demonstrativo, e ali o ponto não compete com a régua de leitura das tabelas.

---

## 3. O achado que só o dado real pegou

### A janela empurrava pontos para FORA do gráfico

A primeira versão da escala comum encaixava as **duas pontas** do domínio na grade do passo.
Com RH (−32,06% a −42,2%), a base alinhada em −45 levava o topo a −33: **o ponto de 2024 saía
do eixo e sumia da linha, sem erro nenhum.**

O domínio passou a ser exato, com só os TICKS em múltiplos redondos.

⚠️ **Quem pegou foi o caso de contrato contra a BASE VIVA.** Os dados sintéticos que eu
escrevi no teste de módulo passaram — não tinham essa borda. Virou teste de regressão com os
números reais. É o argumento mais forte que esta versão produziu a favor de manter casos de
contrato batendo em produção.

---

## 4. O item revertido, e o aprendizado que fica

O pedido original incluía fazer a "Decomposição da Variação do Resultado" partir do
**fechamento do ano anterior**. Duas tentativas, ambas descartadas contra medição:

1. **Trocar a âncora e manter a subtração** — inverte o sinal de **8 dos 15 degraus**, porque
   um lado tem 12 meses e o outro 9. RH apareceria em barra VERDE com +814.691,75 estando pior
   (42,2% da receita contra 35,4%); a Receita de Vendas, em VERMELHO com −3,52 Mi, em pleno
   crescimento.
2. **Trocar a operação para acumulação** — as duas âncoras ficam honestas, mas a final vira
   **R$ 360,2 k**: a soma de dois exercícios, um acumulado de 20 meses que não é linha de
   demonstrativo nenhum. Foi o próprio Yan quem estranhou o número na conferência.

**Decisão: manter YTD × YTD**, onde as duas âncoras são linhas da DRE.

> **O durável:** numa cascata, **a operação do degrau não é livre — ela é determinada pelas
> âncoras.** Querer que as duas pontas existam no demonstrativo *e* que os degraus expliquem a
> distância entre elas obriga os dois lados a terem a mesma janela. "Partir do fechamento" e
> "degrau honesto" não cabem na mesma figura.

A reversão deixou uma **guarda nova**: o caso de contrato agora prova que as duas âncoras usam
a mesma janela YTD. Se alguém trocar a inicial por 12 meses, o teste cai contra o dado real.

---

## 5. Parecer da revisão

⚠️ **O subagente `revisor` NÃO foi despachado** — a sessão operava sob restrição de harness que
proíbe invocar subagentes sem pedido explícito do usuário. Seguiu-se o **Protocolo D5**: fazer
tudo o que não depende do passo barrado e declarar o que ficou sem verificação.

**Feito no lugar:** auto-auditoria adversarial (que produziu os achados do §3), 9 casos de
contrato contra a base viva na área da DRE, e **cinco rodadas de conferência visual com o Yan**
— das quais quatro foram verificadas ao vivo pelo próprio agente via Claude in Chrome.

**Não verificado por terceiro:** aderência às convenções por um contexto limpo, sem o viés de
ancoragem de quem planejou. Vale rodar `revisor` sobre `src/lib/dre/`, `src/lib/escala-grafico.ts`
e `src/components/charts/` quando der.

`revisor-db` **não se aplica**: zero migration, zero RPC.

---

## 6. Aprendizado — régua de 5 destinos

| Aprendizado | Destino | Estado |
|---|---|---|
| Small multiples com eixo auto-escalado mentem sobre a inclinação | **Skill `graficos`** | proposto abaixo |
| `domain` explícito exige `ticks` — e encaixar as PONTAS na grade expulsa pontos | **Skill `graficos`** | proposto abaixo |
| Numa cascata, a operação do degrau é determinada pelas âncoras | **Out-briefing §4** | registrado |

**Proposta para a skill `graficos`** (não aplicada — edição de skill passa pelo aval do Yan):

> - **GRADE de gráficos (small multiples)** → eixo auto-escalado MENTE sobre a inclinação:
>   cada gráfico estica a própria série até preencher o card, e uma variação de 0,3 p.p.
>   desenha a mesma subida de uma de 10 p.p. Séries que serão comparadas entre si precisam de
>   **domínio de mesma AMPLITUDE**, posicionado no nível de cada uma (preserva o nível e torna
>   a inclinação comparável). O custo é que série estável fica quase reta — anote o Δ ao lado
>   do título para devolver a precisão. Caso vivo: `dre/grade-proporcao.tsx` (v5.9.2).
> - **Domínio fixo:** derive a amplitude do PASSO redondo (`lib/escala-grafico.ts`), não o
>   contrário — arredondar a amplitude e depois dividir dá passos quebrados. E encaixe só os
>   TICKS na grade, **nunca as pontas do domínio**: alinhar as pontas empurra a janela para
>   fora da série e faz pontos sumirem do gráfico sem erro (v5.9.2).

---

## 7. Pendências

- ⚠️ A hora do `changelog-diretoria` é de **autoria** (`2026-09-03T16:21`) — o `/pos-merge`
  reconcilia ao horário real do merge.
- ⚠️ `revisor` não despachado (§5).
- Herdadas e ainda abertas da v5.8.1: o subtítulo `Δ%` da decomposição (os degraus estão em
  reais) e o tamanho do degrau "Impostos e Deduções" na ponte, que é de-para e não código.

## 8. Fronteira (fica fora)

Proporção no regime de CAIXA · mais anos que os 3 da janela navegável · orçado · qualquer
mudança nas tabelas densas ou no motor de caixa.
