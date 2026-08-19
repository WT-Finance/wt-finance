---
name: tabela-densa
description: Tabelas financeiras densas do Janus — <ValorContabil> (formato contábil, R$ à esquerda e número à direita), cabeçalho padrão (sem caixa alta, sem negrito) e a receita completa de tabela longa com scroll interno e cabeçalho sticky (border-separate, fundo na célula, bordas por célula, cabeçalho de duas linhas com rowSpan, exceção min-w). Use ao criar ou alterar qualquer tabela de dados — especialmente com valores monetários, cabeçalho fixo ou scroll interno.
---

# Tabela densa (Janus)

Convenções para qualquer tabela financeira densa da plataforma (Lista de Operações,
Fluxo de Caixa Gerencial, DRE, Faturamento Corporativo, Cadastro de Clientes). O objetivo
é que toda tabela nova pareça a mesma tabela — mesma tipografia de cabeçalho, mesmo
alinhamento de valor, mesmo comportamento de scroll — sem cada tela reinventar o próprio
CSS.

## Formato contábil de valor monetário: `<ValorContabil>`

Em tabela financeira densa, valor monetário usa o componente `<ValorContabil>`
(`@/components/shared/valor-contabil`, ADR-0124/v4.22), não um `<span>` montado à mão:

- "R$" ancorado à **esquerda** da célula, cor `--text-subtle`.
- Número à **direita**, com centavos (`numBRL2`).
- `flex justify-between` + `tabular-nums` — os dígitos alinham entre as linhas (é o que
  faz uma coluna de valores "casar" visualmente de cima a baixo).
- A cor é opcional via `className` e pinta **só o número**, nunca o "R$".

Use nas tabelas do Fluxo de Caixa Gerencial (projeção agregada e base) e em qualquer
tabela nova com coluna monetária densa. Não remonte esse flex à mão — é exatamente o
tipo de padrão que diverge sutilmente entre telas quando cada uma inventa o seu.

Isso é **distinto** do `fmtBRL2`/`numBRL2` inline usado em **operação individual** (Lista
de Operações, drawer de operação) — ali o valor é um número solto no fluxo do texto, não
uma célula de tabela densa com "R$" ancorado.

## Cabeçalho de tabela: padrão único, sem caixa alta e sem negrito

Todo `<thead>` da plataforma segue a mesma receita tipográfica — não inventar variação
por tela:

- Caixa **normal** — NUNCA `uppercase`/`tracking-wide`.
- Peso `font-medium` — nunca `font-semibold`/`font-bold`.
- Tamanho `text-xs`/`text-2xs`.
- Cor terciária: `text-zinc-400`/`--text-muted`.

A referência viva é o cabeçalho da **Lista de Operações**. Em cards-tabela (tabela dentro
de um Card com título), a forma canônica é a constante `CARD_TABELA_TH`.

## Receita completa: tabela longa com scroll interno e cabeçalho sticky

Esta é a parte que **custou caro duas vezes** (vazamento em v4.34.1; corte de borda em
v5.3.0) — siga a receita inteira, não uma parte dela. As peças são interdependentes: tirar
uma quebra o resultado de um jeito que só aparece ao rolar, não no build/tsc/lint.

1. **A tabela usa `border-separate border-spacing-0`, nunca `border-collapse`** (o
   default do HTML). Em `border-collapse`, fundo e borda **não acompanham o sticky** de
   forma confiável — as linhas de dados vazam por baixo do cabeçalho fixo ao rolar.
2. O container que rola é `overflow-auto max-h-[...]`.
3. O `<thead>` é `sticky top-0 z-20 [&_th]:bg-zinc-50` — o fundo opaco vai **nas células**
   (`th`), não no `<thead>`/`<tr>` (tom distinto do corpo da tabela).
4. **Toda borda horizontal vai nas células, nunca no `<tr>`** — borda de `<tr>` **não
   renderiza** em `border-separate`. No cabeçalho: divisórias via
   `[&_tr:first-child_th]:border-b ...zinc-100` e `[&_tr:last-child_th]:border-b ...zinc-200`
   no próprio `thead`. No corpo: `[&>td]:border-b [&>td]:border-zinc-50` na `<tr>` de cada
   linha.
5. **Sombra sob o cabeçalho só quando rolado** — um estado `rolado` setado no `onScroll`
   do container ativa `[&_tr:last-child_th]:shadow-[...]` condicionalmente. Sem rolagem,
   sem sombra.
6. **Sem `min-w` na tabela** (regra padrão — ver exceção abaixo): colunas pequenas em
   px fixo; colunas de texto **sem width** (em `table-fixed` elas dividem o espaço
   restante e truncam) — assim não aparece barra de rolagem horizontal indesejada.
7. **Cantos superiores do cabeçalho arredondados** para acompanhar o `Card`:
   `[&_tr:first-child_th:first-child]:rounded-tl-lg` +
   `[&_tr:first-child_th:last-child]:rounded-tr-lg` — só nas células de canto da 1ª
   linha, senão o header cinza fica pontudo dentro do Card arredondado.

A tabela vive dentro de um `Card` (fundo branco, não o fundo cru da página). Como toda
página usa largura total (ver `ui-design-system`), a tabela densa já dispõe de todo o
espaço lateral disponível — não precisa de `max-w`/`mx-auto` próprio.

Não há lint pegando nenhuma destas regras — é convenção pura; os exemplos vivos são
`cadastro-clientes.tsx` e `base-dados-tab.tsx`.

### Custou caro: vazamento por `border-collapse` (v4.34.1)

O cabeçalho sticky em `border-collapse` (o default) deixava fundo e borda **não
acompanharem** o sticky de forma confiável — as linhas do corpo vazavam visualmente por
baixo do cabeçalho fixo ao rolar. O fix foi virar tudo para `border-separate` + bordas por
célula + envolver em `Card`, e de quebra veio o refino: `zinc-50` no fundo do header,
sombra-só-ao-rolar, e o fim do `min-w`.

### Custou caro 2×: cabeçalho de DUAS linhas corta a régua e a sombra (v5.3.0)

A receita acima pressupõe **cabeçalho de uma linha só**. Quando o `<thead>` tem duas
linhas (ex.: grupo em cima + meses embaixo), as células com `rowSpan={2}` existem **só
na 1ª `<tr>`** do `thead` — então qualquer seletor de "última linha"
(`[&_tr:last-child_th]`) **nunca as alcança**. O resultado: a régua de base e a
sombra-ao-rolar saem cortadas exatamente na(s) coluna(s) com `rowSpan`, como se aquela
coluna estivesse "vazando" por trás.

**Regra:** aplique borda e sombra **diretamente** nas células com `rowSpan`, além de
tratar a 2ª linha normalmente — não confie em seletor de "última linha" quando há
`rowSpan` cruzando as duas. Este mesmo bug de especificidade apareceu duas vezes de forma
independente na v5.3.0: como achado ALTO do revisor no React e, separadamente, no CSS de
um estudo visual — é fácil de reintroduzir porque o sintoma só aparece ao rolar de fato,
não em uma captura estática.

### Exceção `min-w` (v5.1.9)

A regra "sem `min-w`" vale quando o truncamento das colunas de texto basta (o caso
comum). Quando a tabela densa tem **três ou mais colunas de texto livre** que, sem width,
colapsam a ponto de os **cabeçalhos se sobreporem** em telas menores (ex.: Cadastro de
Clientes — Contato/Destinatários/Observações), é aceitável:

- Dar `min-w-[…]` à `<table>`.
- Envolver em `<ScrollAutoHide eixo="both">` (rola na horizontal abaixo do limite; acima
  do limite, preenche o container sem scroll — ver `ui-design-system` para o componente).

### Colunas presas à DIREITA: a largura é a fonte única do `right` cumulativo (v5.4.x, v5.7.0)

Quando um grupo de colunas fica `sticky` na borda direita, cada uma encosta num `right`
calculado pela **soma das larguras das que estão à sua direita**. Duas regras que isso impõe:

- **A largura DECLARADA e o `right` saem da MESMA constante.** Uma coluna nova que seja
  renderizada mas não entre nessa aritmética senta **por cima da vizinha, em silêncio** —
  nenhum gate mede sobreposição de `position: sticky`, e no screenshot parece só "apertado".
  Quando uma coluna vira um PAR (valor + um percentual colado, por exemplo), a conta passa a
  contar **blocos**, não colunas. Confira sempre `right + largura` de cada coluna caindo
  exatamente no `right` da vizinha — é aritmética de dois números e pega o erro na hora.
- **Dimensione pelo PIOR caso, não pelo típico**, e trave-o num teste do formatador. Sem
  `maxWidth` (e não se deve pôr: cortar dígito é dado errado na tela), a coluna que não cabe
  **cresce** — e aí o `right` das vizinhas, que foi calculado com a largura declarada,
  desalinha tudo.

**O thumb do `<ScrollAutoHide>` divide a borda com a última coluna.** Ele é overlay
(`absolute right-1 w-1.5` do wrapper) e não desloca conteúdo: com uma coluna larga na ponta
ele pousa no padding e ninguém nota; com uma coluna **estreita**, cai em cima dos dígitos.
A folga tem de vir de **fora do container que rola** (encolher o wrapper) e do **padding da
própria célula** — nunca de `padding-right` no viewport, que deslocaria o ponto em que as
colunas `sticky` grudam e faria o conteúdo aparecer no vão à direita delas durante o scroll.

## Tabelas em container estreito (cards compactos)

Fora do caso de tabela longa/sticky, tabela dentro de um card estreito segue outra
receita, mais simples:

- Prefira `table-fixed w-full` + `truncate` nas colunas flexíveis — evita barra de
  rolagem horizontal indesejada.
- Em cards compactos, reduza o número de colunas; o detalhe completo fica no drawer.
- Evite `whitespace-nowrap` em texto largo — ele força a coluna a alargar em vez de
  quebrar/truncar.

## Ver também

- `ui-design-system` — tokens de cor (nunca hex em coluna colorida), primitivos de UI,
  `<ScrollAutoHide>` para scroll interno arrastável, largura total de página.
- `graficos` — quando o dado é melhor representado visualmente (série, eixo) em vez de
  tabular; casas decimais de eixo/agregado (`fmtMi`/`fmtAxisBRL`) vivem lá.
