---
name: graficos
description: Gráficos do Janus (Recharts) — criar OU alterar QUALQUER gráfico do dashboard: adicionar/mudar série, linha de projeção tracejada, legenda, tooltip, eixo (fmtAxisBRL/fmtAxisPct/fmtAxisMes) e cor de série pela paleta canônica por contexto semântico (série principal --brand, margem --brand-deep, cash-flow --positive/--negative, subsetor e cross-setor por token; sólido = real, tracejado = referência/projeção). Cobre também as armadilhas que NÃO dão erro e só aparecem na tela: domínio e escala de eixo (o default corta negativos e desliga os ticks bonitos), GRADE de gráficos/small multiples com escala comparável, altura do ResponsiveContainer e a forma do waterfall. Sempre pelos primitivos de @/components/charts — nunca Recharts cru. Use para qualquer trabalho em gráfico: visualização nova, série nova, projeção, legenda, eixo, domínio/escala, grade de mini-gráficos, tooltip ou cor de gráfico.
---

# Gráficos (Janus)

Todo gráfico da plataforma (Recharts) passa pelos mesmos primitivos e pela mesma paleta —
não reconfigurar Recharts à mão, não escolher hex "que combina" na hora. A causa-raiz
histórica de divergência visual é a mesma de sempre: cada tela montando o próprio gráfico
do zero.

## Primitivos de `@/components/charts` (ADR-0095)

Gráfico novo usa o tema central da pasta `@/components/charts`, não `recharts` cru:

- Tema central (cores base, grade, linha-do-zero).
- `ChartLegend` para a legenda.
- `CustomTooltip` para o tooltip.
- Formatadores de eixo prontos: `fmtAxisBRL`, `fmtAxisPct`, `fmtAxisMes`.

Convenção de traço: **sólido = real/efetivo**, **tracejado = referência/projeção**. Eixo
temporal é sempre **contínuo** (sem buraco/salto entre pontos, mesmo quando falta dado).

Gráfico legado que ainda não usa os primitivos não precisa ser migrado de uma vez —
migração é incremental, feita quando a tela é tocada por outro motivo.

## Paleta canônica por contexto semântico (ADR-0103)

A cor de uma série **nunca é hex literal** — é sempre o token certo para o contexto. A
regra central é: a cor comunica o que o dado É, não é decoração. O mapeamento:

- **Série principal única** → `--brand` (herda a cor da aba ativa via `[data-theme]` —
  por isso o mesmo componente de gráfico muda de cor sozinho ao trocar de setor).
- **Ênfase** (destacar um ponto/série dentro do mesmo gráfico) → `--brand-deep`.
- **Multi-série YoY** (ano atual vs. ano anterior) → a **cor** distingue a métrica
  (`--brand`/`--text-secondary`), o **traço** (sólido/tracejado) distingue o período —
  nunca as duas dimensões na mesma variável.
- **Margem** → `--brand-deep`.
- **Cash-flow** (entrada/saída/resultado) → `--positive`/`--negative`, via `fluxoColors`,
  no drawer de operação e no Financeiro.
  - **Exceção deliberada:** os cards de cash-flow da **visão principal de Weddings**
    (Fluxo de Caixa Mensal, Acumulado de Recebimentos e Pagamentos) usam a identidade
    Welcome turquesa/mostarda (`--chart-fluxo-entrada`/`--chart-fluxo-saida`), por decisão
    de identidade visual — não é um esquecimento de padrão, é intencional e localizado.
- **Composição por subsetor** → `--subsetor-*` (fallback `--brand` quando o subsetor não
  tem token próprio), resolvido por `subsetorColor` de `@/lib/config`.
- **Breakdown cross-setor** (comparando setores entre si) → `--setor-*`/`SETOR_COLORS`.

### Duas cores por setor — não confundir

Um setor (Trips/Weddings/Corporativo) tem **duas** cores diferentes, para dois papéis
diferentes:

- **DESTAQUE** — `--brand` (a cor da aba, ativa **dentro** da aba daquele setor).
- **IDENTIDADE** — `--setor-*` (usada **só** em gráficos cross-setor, quando setores
  aparecem lado a lado).

Usar `--brand` num gráfico cross-setor (ou `--setor-*` dentro da aba de um setor) mistura
os dois papéis e produz cor errada silenciosamente — nenhum lint pega isso, é leitura de
contexto.

**Atenção especial:** o `--brand` de Trips resolve para `#0091B3`. Não hardcode esse hex
como cor de série principal em telas de Trips que também tenham cash-flow — colidiria
visualmente com as cores de fluxo de caixa.

(Telas de **plataforma**, não-setoriais — auth, `/admin/*`, `/sem-acesso` — usam uma
paleta neutra própria, independente de `[data-theme]`; isso é assunto de
`ui-design-system`, não deste gráfico.)

## Eixos e formatação de valores

- **Eixo Y monetário** → `ChartYAxisBRL`/`fmtAxisBRL`: rótulo compacto ("R$ 1,8 Mi", 1
  casa decimal). Formato longo (com todos os centavos) quebra linha em larguras de tela
  menores — sempre validar o gráfico numa largura estreita, não só no monitor do dev.
- **Casas decimais em agregado/eixo de gráfico** → sempre abreviado, via `fmtMi`/
  `fmtAxisBRL` ("R$ 1,8 Mi"). Nunca formatação local reinventada no componente do
  gráfico. (O caso de **valor de operação individual**, com 2 casas via `fmtBRL2`/
  `numBRL2`, não é responsabilidade deste gráfico — vive em `tabela-densa`/
  `ui-design-system`, porque ali o valor está numa célula, não num eixo.)
- **Rótulo de valor sobre COLUNA estreita** → `LabelList` com `formatter` **quebra o texto
  na largura da barra**: "R$ 2,65 Mi" numa coluna de ~30px vira três linhas empilhadas e
  corta no teto do gráfico — e só aparece na tela (tsc/lint/testes não veem). Usar
  `content` custom que desenha UM `<text>` centrado acima da barra (caso vivo:
  `comparativo-colunas.tsx`, v5.6.1). Em barra horizontal (`position="right"`) o problema
  não existe.

## Domínio e escala — as armadilhas que NÃO dão erro

Todas as regras desta seção têm a mesma assinatura: o gráfico desenha algo **errado sem
lançar nada**. `tsc`, lint e teste passam; só a tela mostra. Cada uma custou pelo menos uma
rodada de conferência visual.

- **Série que cruza o ZERO** → o domínio default de um eixo numérico é `[0, 'auto']`
  (`axisSelectors.js`): ele **ancora em zero e corta os negativos**. Gráfico com valores dos
  dois lados exige `domain` explícito. E em barra HORIZONTAL (`layout="vertical"`) a linha do
  zero é `ChartZeroLineX()` — `ChartZeroLine()` ancora no Y, que ali é o eixo de CATEGORIAS, e
  desenha a régua atravessando a primeira categoria. (`charts/cascata.tsx`, v5.8.1.)
- **`domain` explícito DESLIGA os ticks bonitos** → o Recharts passa a dividir o intervalo cru
  e produz marcas como `-471 k · 79 k · 629 k` — numa escala simétrica, **sem o zero entre
  elas**, que era o ponto de ser simétrica. Quem fixa `domain` fixa `ticks` junto.
- **Derive a amplitude do PASSO redondo** (`lib/escala-grafico.ts`), nunca o contrário:
  arredondar a amplitude e depois dividir dá passos quebrados (15 / 4 = 3,75). E encaixe na
  grade **só os TICKS, nunca as pontas do domínio** — alinhar as pontas empurra a janela para
  fora da série e faz pontos SUMIREM da linha. (v5.9.2: com RH indo de −32,06% a −42,2%, a base
  alinhada em −45 levava o topo a −33 e o ponto de 2024 saía do eixo. Quem pegou foi o caso de
  contrato contra a BASE VIVA — a fixture sintética não tinha a borda.)
- **GRADE de gráficos (small multiples)** → eixo auto-escalado **mente sobre a inclinação**:
  cada gráfico estica a própria série até preencher o card, e uma variação de 0,3 p.p. desenha
  a mesma subida de uma de 10 p.p. Séries que serão comparadas entre si precisam de **domínio
  de mesma AMPLITUDE**, posicionado no nível de cada uma — isso preserva o nível e torna a
  inclinação comparável. O custo é que série estável fica quase reta (o que é a verdade sobre
  ela): anote o Δ ao lado do título para devolver a precisão sem depender do olho.
  (`dre/grade-proporcao.tsx`, v5.9.2 — a razão de 28× entre RH e Desp. Comerciais era invisível.)
- **Série sempre NEGATIVA por natureza** (proporção de despesa sobre receita) → `ChartYAxisPct`
  com `invertido`: o eixo vira e "pesa mais" volta a ser "mais alto", com o rótulo continuando
  `−5,4%`. É diferente de plotar o módulo, que faria a mesma grandeza aparecer com dois sinais
  em telas vizinhas.

## Estrutura e forma

- ⚠️ **`ResponsiveContainer` exige `height` no pai, NUNCA `min-height`.** Percentual de altura
  resolve contra `height`; com `min-height` o filho mede **0** e o gráfico some sem erro — card
  desenhado, área vazia. Num `grid` o defeito fica **LATENTE** (o item ganha altura do
  `align-items: stretch`) e só aparece quando o card vira bloco. Medido: bloco+min-height → 0px;
  grid+min-height → 200px; bloco+height → 200px. (v5.8.1.)
- **Waterfall / cascata** → barra de FAIXA (`dataKey` apontando para `[início, fim]`, nativo no
  Recharts), nunca o truque da barra transparente empilhada: o empilhamento manda negativo para
  o outro lado e a figura quebra assim que uma âncora cruza o zero.

## Ver também

- `tabela-densa` — quando o dado é melhor representado em tabela (valor monetário denso,
  `<ValorContabil>`) em vez de gráfico.
- `ui-design-system` — tokens de cor gerais, paleta neutra de telas de plataforma
  (`--action-*`), primitivos de UI fora de gráfico.
