---
name: ui-design-system
description: "Design System Welcome/Janus para qualquer UI — tokens CSS (nunca hex; [var(--token)], nunca [--token]), primitivos de src/components/ui/ e pills compartilhadas, respiro e scroll do <main> do AppShell, ScrollAutoHide, formatação de valores e datas (fmtBRL2/fmtMi; fmtDataSP para timestamptz, nunca split), telas de plataforma neutras (--action-*, .foco-neutro), cards KPI clicáveis e responsividade. Use ao criar ou alterar QUALQUER tela, componente ou estilo — antes de escrever o primeiro className."
---

# Design System Welcome/Janus

O Janus é uma plataforma só, mas com identidade por setor (Weddings/Trips/Corporativo)
e telas de plataforma neutras (auth, admin). A causa-raiz histórica de incoerência visual
neste projeto nunca foi falta de gosto — foi cada tela reinventar o próprio botão, a própria
cor, o próprio respiro. Esta skill é o conjunto de decisões já tomadas; a regra de ouro é
**procurar o padrão existente antes de inventar um novo** (primitivo de `src/components/ui/`,
helper de `@/lib/fmt`, token de `src/styles/tokens.css`).

Fonte: Avenir LT Std. Card: sempre `shadow-sm`, nunca borda destacada como afordância padrão.

---

## 1. Cor é SEMPRE token — nunca hex, nunca cor crua do Tailwind

Duas regras distintas travam isso, e as duas custaram caro no passado:

### 1.1 — `[var(--token)]`, NUNCA `[--token]`

O Tailwind v4 removeu o shorthand v3 (`text-[--brand]`, `bg-[--token]`). Escrever assim
compila para `color: --brand` — **CSS inválido** — e a cor do token é **silenciosamente
descartada**. Não quebra build, nem `tsc`, nem lint; a degradação só aparece a olho.

```
❌ text-[--brand]           bg-[--action-soft]
✅ text-[var(--brand)]      bg-[var(--action-soft)]
```

Ao copiar um exemplo de Tailwind v3 (de doc antiga, de outro repo), **converter sempre**.
(Custou caro: 81 ocorrências quebradas app-wide antes de virar hábito — fix v4.16.1.)

### 1.2 — Lint `wt/no-cor-hardcoded` (ADR-0129)

Classe Tailwind de cor crua (`emerald-500`, `amber-600`, `red-400`, `green-`, `blue-`,
`yellow-\d`) e hex em classe (`text-[#fff]`) são **erro de lint**, não sugestão. Use o
token do DS:

| Precisa de... | Use |
|---|---|
| sucesso/positivo | `text-success` / `bg-success-bg` |
| perigo/negativo | `text-danger` / `bg-danger-bg` |
| atenção/pendente | `text-warning` / `bg-warning-bg` (texto em corpo pequeno: `--warning-deep`, passa AA) |
| ação administrativa (gestão, só admin) | `text-gestao` / `bg-gestao-soft` |
| ação de plataforma (CTA neutro) | `bg-action-primary` / `bg-action-soft` |
| cor de setor cross-setor | `border-setor-lazer` etc. (ver §7) |
| micro-texto | `text-2xs` / `text-3xs` |

**Duas exceções, e só essas duas:** `zinc-*` é permitido (cinza de UI neutro, ainda não
tokenizado — follow-up futuro); `src/lib/email/**` é isento (o Outlook exige hex inline,
não lê CSS var). Fora disso, se o token que você precisa não tem utilitária mapeada em
`@theme` (`globals.css`), use `[var(--token)]` — nunca hex solto.

⚠️ **O lint só enxerga CLASSE.** Cor que entra por `style={{ background: ... }}` — o caminho
obrigatório de barra, série de gráfico e qualquer valor calculado — passa batido. A regra do DS
vale igual ali, e quem garante é a revisão: **antes de escrever um hex em `style`, procure o
token**. Caso vivo (v5.4.1): a cor de "Outros" da Decomposição era `#B8B2A8` havia duas versões,
enquanto `--text-subtle` (`#ACA39A`, o cinza neutro-quente canônico) existia e servia. Em `style`,
o token se escreve `'var(--token)'`.

`src/styles/tokens.css` é a fonte da verdade dos valores; `src/styles/tokens.test.ts`
protege o lado oposto (falha se um token-âncora sumir, se `--text-primary` deixar de ser
`#2D2A26`, ou se o `--primary` azul voltar). Convenção sozinha não segurava — emerald e
âmbar cru voltavam a aparecer em telas novas até o lint existir (v4.26); é o lint que
segura hoje, não a memória de quem está codando.

**Cor de setor cross-setor tem fonte única.** Um gráfico ou breakdown que atravessa
Weddings/Trips/Corporativo usa `SETOR_COLORS` de `@/lib/config` (que resolve para
`--setor-*`), nunca hex local nem o `cor_hex` vindo do banco. Dentro da aba de um setor
(destaque, não comparação), a cor é `var(--brand)` — ver §7 sobre quando **não** usar
`var(--brand)`.

---

## 2. UI nova usa os PRIMITIVOS de `src/components/ui/` — não reinventa o seu

Canônicos: `Button` (variantes sólido/contorno/ghost/ícone/ícone-borda/livre),
`Input`/`Select`/`Textarea` (`field.tsx`, que envolvem `CAMPO`/`CAMPO_COMPACTO` de
`@/lib/ui/campos`), `Badge` (success/danger/warning/brand/gestao/neutro/count), `Tabs`,
`Tooltip`, `Card`, `Checkbox`. Antes de montar um botão ou campo do zero, procure aqui —
a divergência visual histórica nasceu de cada tela montar o próprio.

**Afordância "?" de ajuda** (rótulo/cabeçalho que precisa explicar uma definição): bolinha
`h-3 w-3` com borda `zinc-300` e o "?" em `text-[8px]`, envolvida no primitivo `Tooltip`.
Receita completa, com os dois detalhes que já custaram caro:

```tsx
<Tooltip conteudo={texto} className="z-30 w-64 !whitespace-normal font-normal leading-snug">
  <button type="button" aria-label={`${rotulo}: ${texto}`}
          className="foco-neutro inline-flex h-3 w-3 items-center justify-center rounded-full
                     border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400">?</button>
</Tooltip>
```

- **O gatilho é `<button type="button">`, NUNCA `<span>`.** `span` não entra no tab-order
  nem é nomeável por leitor de tela: a dica fica **invisível para quem navega por teclado**
  — e num cabeçalho de coluna ela costuma ser a única explicação de uma definição de
  métrica. O `Tooltip` abre no hover **e no foco** (`group-focus-within/tip:visible`) desde
  a v5.4.2; sem um gatilho focável, essa metade não serve para nada. (Achado ALTO do
  revisor na v5.4.2.)
- **`!whitespace-normal` é obrigatório** (com o `!`): o `Tooltip` traz `whitespace-nowrap` na
  base, e sem forçar o wrap um texto longo vira **uma linha invisível gigante** que
  transborda e cria barra de rolagem horizontal (medido: 313px → 0px, v4.38.0).
- **Perto da borda direita, ancore à direita** (`!left-auto right-0`): o balão é
  `absolute left-0` e abriria para fora da tela na última coluna de uma tabela (v5.4.2).
- Dentro de `<th>` clicável (tabela ordenável), o "?" precisa de
  `onClick={e => e.stopPropagation()}` — ler a dica não deve reordenar a tabela.

Call-sites vivos: `weddings/lista-operacoes` (`AjudaHeader`, já com `<button>`),
`financeiro/faturamento-corp` (`CabecalhoAjuda`) e `financeiro/posicao-projetado`
(`KpiJanela`) — **estes dois últimos ainda usam `<span>`** e portanto seguem inacessíveis
por teclado (pendência registrada no out-briefing da v5.4.2; é uma linha em cada). São
**três cópias da mesma receita** — candidata natural a primitivo compartilhado quando uma
quarta aparecer.

Pills de plataforma/filtro são consts de `@/components/shared/botoes`
(`PILL*`/`PILL_FILTRO*`); badge de status de solicitação é `statusBadge` de
`@/lib/solicitacoes/format.ts`. Foco neutro (sem o anel dourado/de marca) vem da
utilitária `.foco-neutro`.

Migração de call-site legado (tela antiga que ainda não usa o primitivo) é incremental —
byte-equivalente quando a tela for tocada por outro motivo; não é preciso caçar e
converter one-offs que ninguém está mexendo.

### 2.1 — Cortina (qualquer coisa que expande/recolhe)

A curva é uma só, aprovada em mockup pelo Yan (v5.1.9): **450ms
`cubic-bezier(.32,.72,0,1)`**, animando `grid-template-rows` de `0fr` a `1fr`, com o filho
em `min-h-0 overflow-hidden`. A referência viva é `shared/top-section.tsx`; copie a
mecânica, não recrie a curva (`motion-reduce:transition-none` faz parte dela).

Duas regras que não são óbvias e já custaram achado de revisor:

- **O conteúdo fica MONTADO nos dois estados, com `inert` quando fechado.** `inert` é o que
  o tira do tab-order e do leitor de tela (achado ALTO, v5.1.9). Desmontar por
  `{aberto && ...}` parece equivalente e **não é**: no fechamento o conteúdo some no mesmo
  render em que a altura começa a animar, e a cortina colapsa uma caixa vazia — abre bonito
  e pisca ao fechar (v5.4.1, Decomposição). Se o conteúdo é caro, memoize; não desmonte.
- **Nada de `position:absolute` dentro da cortina** — o `overflow-hidden` do clip corta
  popover, tooltip do DS e menu (risco registrado na v5.1.9). Dica curta ali dentro é
  atributo `title` nativo, que não vive no DOM.

---

## 3. Layout de página — o respiro vem do `<main>`, fonte única

O `<main>` do AppShell é a **única** fonte de respiro de página: vertical `py-8` +
horizontal `px-8`. O container raiz de uma página **não define `py` nem `px`/`max-w`/
`mx-auto`** — a página usa a largura TOTAL restante do `<main>`.

```tsx
// ✅ root de página nova — puro, sem padding/max-w próprios
export default function MinhaPagina() {
  return <div className="space-y-6">{/* ... */}</div>
}
```

**Exceção:** página que precisa preencher a altura toda (ex.: Acervo, Solicitações) usa
`<div className="h-full flex flex-col">` no root — ainda sem `px`/`py`/`max-w`.

Antes da v5.1.1 cada página tinha `px-4`/`px-6` próprio e capava em `max-w-7xl mx-auto`
(sobrava espaço lateral vazio); antes da v4.16.1 cada tela inventava o próprio `py`.
Se o gap lateral da plataforma inteira precisar afinar, o ajuste é **um lugar só**: o
`px` do `<main>` — nunca 20+ páginas.

---

## 4. Scroll — `<main>` é o único scroll do documento; rolável interno usa `ScrollAutoHide`

O `<main>` do AppShell tem `scrollbar-gutter: stable` — a goteira da barra vertical fica
**sempre** reservada, então o conteúdo centralizado não desloca lateralmente quando a
barra some/aparece (ao recolher uma `TopSection`/`<details>`, ou trocar para página mais
curta). **Não crie outro scroll container de página** (`overflow-auto` próprio no root) —
isso reintroduz o salto lateral. (Custou caro: salto ao recolher seção em
Gerencial/Weddings — v4.23.2.)

Qualquer rolável **interno** à página — lista, painel, tabela, board em colunas, vertical
ou horizontal — usa `<ScrollAutoHide>` (`@/components/shared/scroll-auto-hide`), nunca
`overflow-*` cru:

```tsx
<ScrollAutoHide className="max-h-[420px]" eixo="y" onScroll={handleScroll}>
  <div className="space-y-3">{/* conteúdo */}</div>
</ScrollAutoHide>
```

- A barra flutua em overlay (nativa escondida, thumb aparece ao rolar/hover e some sozinho);
  por ser overlay, **não** desloca conteúdo — dispensa `scrollbar-gutter` aqui.
- O thumb é **arrastável** (pointer capture) — não é só roda do mouse.
- `className` vai no **viewport** (padding, `max-h`, `min-w`) — **nunca**
  `overflow-*`/`flex-1`/`min-h-0`/`h-full` aí. `contentClassName` é só para
  `space-y-*`/`gap` do wrapper de conteúdo. `eixo`: `'y'` | `'x'` | `'both'`. `onScroll`
  repassa para sombra de header sticky (ver skill `tabela-densa`).
- **Não vale** para o `<main>` do AppShell (mantém nativa + `scrollbar-gutter: stable`)
  nem para o scroll horizontal do board Kanban de Solicitações (nativo, propositalmente;
  as **colunas** dele é que usam `ScrollAutoHide`). A sidebar tem cópia própria embutida
  da mesma mecânica.

Container rolável novo nasce com `ScrollAutoHide`; ao encostar num `overflow-*` cru
remanescente, migre.

⚠️ **O thumb é overlay e NÃO reserva folga — o call-site é que reserva.** Ele é posicionado
por `absolute` contra o **próprio wrapper** (`right-1` + `w-1.5` no vertical, `bottom-1` +
`h-1.5` no horizontal), então, sem gutter, ele flutua **por cima** da última coluna ou da
última linha. Bateu três vezes na v5.4.1 (eixo X do Resumo Executivo, eixo Y da
Decomposição) antes de virar regra. A receita, copiada da tabela da DRE:

- **Gutter interno** no `className` (que vai para o viewport): `pb-3.5` no eixo **X**,
  `pr-3.5` no eixo **Y** — 14px sobre os quais o thumb flutua, dentro da área rolável.
  (O eixo dá o LADO onde o thumb encosta: no X ele é horizontal e mora embaixo
  (`bottom-1 h-1.5`) ⇒ gutter em `pb`; no Y é vertical e mora à direita (`right-1 w-1.5`)
  ⇒ gutter em `pr`. Os dois estavam **trocados** aqui até a v5.4.2 — achado do revisor;
  os call-sites vivos sempre seguiram a implementação: `resumo-executivo.tsx` usa
  `eixo="x"` com `pb-3.5`, e `decomposicao-lancamentos.tsx` usa o eixo Y com `pr-3.5`.)
- **Gutter externo** — um wrapper `pb-1.5`/`pr-1.5` em volta do `ScrollAutoHide` — quando o
  rolável encosta na borda de um box: encolhe o wrapper e afasta a barra da moldura **sem
  tocar no componente compartilhado**.
- Se houver `-mx-*`/`-mr-*` no conteúdo (hover que sangra), desconte: o gutter útil é o que
  sobra depois da margem negativa.

Em `flex flex-col`, o `ScrollAutoHide` já é a região flexível — a raiz dele traz
`flex min-h-0 flex-1 flex-col`. Basta o irmão fixo (título/rodapé) ter `shrink-0`; não
passe `flex-1`/`min-h-0` no `className`.

### 4.1 — Rodapé que não pode rolar (total, resumo, ação)

Total de painel, linha de resumo e barra de ação ficam **fora** da região rolável: pai
`flex flex-col` com altura definida (`h-full max-h-[…]`), `ScrollAutoHide` no meio, rodapé
irmão com `shrink-0`. Para dois painéis lado a lado terem os rodapés **na mesma linha
horizontal**, os dois precisam do MESMO teto de altura e o grid precisa de `items-stretch`
— o painel mais curto fica com espaço vazio antes do rodapé, e é isso que produz o
alinhamento (não é sobra de layout). Caso vivo: os Totais de Entradas × Saídas na
Decomposição dos Lançamentos (v5.4.1).

---

## 5. Formatação de valores e datas

### 5.1 — Casas decimais por contexto

- **Operação individual** (Lista de Operações, drawer de operação) → 2 casas via
  `fmtBRL2`/`numBRL2` (`@/lib/fmt`).
- **Agregado e eixo de gráfico** → abreviado, via `fmtMi`/`fmtAxisBRL` ("R$ 1,8 Mi").
- **Nunca** formatação local (`.toFixed()`, `Intl.NumberFormat` ad-hoc na tela) — os
  helpers centrais existem para isso não divergir entre telas.
- Tabela financeira densa (Fluxo de Caixa Gerencial etc.) usa `<ValorContabil>`
  (`@/components/shared/valor-contabil`) — "R$" ancorado à esquerda em `--text-subtle`,
  número à direita com centavos e `tabular-nums`; ver skill `tabela-densa` para o
  componente completo.

### 5.2 — Timestamptz (UTC do banco) → SEMPRE `fmtDataSP`/`Intl`, nunca split de string

Timestamps do Postgres (`last_sign_in_at`, `decidido_em`, `criado_em`...) chegam em UTC.
Formatar por `iso.split('T')`/`slice(0,10)` mostra a **hora UTC** e **erra o dia perto da
meia-noite** (ex.: `02:30Z` é 23:30 do dia anterior em São Paulo). Use `fmtDataSP`/
`fmtDataHoraSP` (`@/lib/fmt`, `Intl.DateTimeFormat` + `timeZone: 'America/Sao_Paulo'`,
cacheados).

```
❌ dataIso.split('T')[0]
✅ fmtDataSP(dataIso)
```

O split só é correto para **datetime local ingênuo** (sem fuso — ex.: as datas do
`CHANGELOG_DIRETORIA`); `fmtDataHora` detecta o marcador de fuso e trata os dois casos
certo. `data_limite` é `date` puro (sem fuso) — compara/exibe como string mesmo.
(Custou caro: `fmtDataHora` por split mostrava UTC — v4.18/M2.)

Esta regra é sobre **exibição**. O parse de data de planilha (`toIsoDate`) é assunto da
skill `ingestao-planilhas`; o fuso das RPCs em si (rolconfig por role) é assunto da skill
`banco-e-rpc` — os três nunca reescrevem a mesma coisa três vezes, só cobrem pontas
diferentes do mesmo fuso.

---

## 6. Telas de plataforma são NEUTRAS — nunca `var(--brand)`

Telas não-setoriais — auth (`/login`, `/trocar-senha`, `/solicitar-acesso`, `/auth/*`),
`/sem-acesso`, `/admin/*` — usam tokens neutros **dedicados**, independentes de
`[data-theme]`: `--action-primary` (botão/realce, Cool Gray escuro) +
`--action-primary-fg`, `--focus-ring`, utilitária `.foco-neutro`. **Nunca** hardcode o
dourado de Weddings nem use `var(--brand)` numa tela de plataforma — o objetivo é a tela
neutra ficar visualmente estável não importa qual seja o `--brand` corrente/default.

- **Pill "ativa/primária" de plataforma** = bege suave `--action-soft`/
  `--action-soft-border`/`--action-soft-fg` (mesmo visual das pills de período do
  Financeiro) — **não** o `--action-primary` escuro, que é reservado para CTA sólido
  (ex.: botão "Entrar" do login).
- **Foco neutro só em `:focus-visible`**: o anel aparece no teclado, mas clicar com mouse
  num botão/pill/aba não deixa "sombreado" — a classe é `.foco-neutro` (inputs de texto
  continuam mostrando o anel ao clicar, tratados como focus-visible pelo browser).
- O wordmark da plataforma é dinâmico: cor da aba dentro do setor, `--text-muted` no
  resto.

Dentro da aba de um setor (Weddings/Trips/Corporativo), `var(--brand)` É a cor certa —
resolve pelo `[data-theme]` corrente. A distinção que importa: **destaque** (`--brand`,
válido dentro da aba) vs **identidade cross-setor** (`--setor-*`, usado em gráfico que
compara setores — ver §1). Ao criar uma tela nova, pergunte primeiro "isso é de
plataforma ou de dentro de um setor?" antes de escolher o token.

(A paleta de séries de gráfico por contexto — cash-flow, YoY, subsetor — é assunto da
skill `graficos`; aqui só a parte de telas de plataforma neutras.)

---

## 7. Card KPI clicável — afordância no hover na cor da aba

Um card de KPI que leva a mais detalhe (drawer, outra tela) ganha borda + sombra + o CTA
"Ver mais" na cor `var(--brand)` (resolvida pelo `[data-theme]`) ao passar o mouse. As
utilitárias já existem em `globals.css`: `.card-clicavel` no card, `.card-clicavel-cta`
no CTA. Abas futuras herdam de graça, via var — não é preciso regra por setor.

---

## 8. Responsividade — validar nos dois extremos, não só no monitor do dev

O layout precisa funcionar em larguras pequenas e grandes. Padrões que já custaram caro:

- **Cards num grid de altura igual:** o card é `flex flex-col h-full`; o rodapé (ex.:
  Receita/Margem) usa `mt-auto` — para as linhas alinharem entre cards mesmo quando o
  valor principal quebra em 2 linhas numa tela estreita. Não confie em altura implícita.
- **Valores lado a lado num flex precisam de `shrink-0`:** item de flex encolhe **abaixo do
  próprio conteúdo** por default (`flex-shrink: 1`), e aí um valor monetário de 8 dígitos
  **invade o vizinho** — dois KPIs numa linha viram um borrão ilegível. `gap` não resolve:
  o gap é respeitado e o conteúdo transborda. Em card de KPIs lado a lado, cada item leva
  `shrink-0` (com `flex-wrap` no container, para empilhar em tela estreita em vez de
  sobrepor). **Nenhum gate pega isso** — `tsc`, lint, build e a suíte inteira passam com a
  sobreposição na tela; só a conferência visual encontra. (v5.4.2, card de totais de
  Weddings.)
- **Tabela em container estreito:** prefira `table-fixed w-full` + `truncate` nas colunas
  flexíveis (evita scroll horizontal indesejado). Em card compacto, reduza colunas — o
  detalhe completo fica no drawer; evite `whitespace-nowrap` em texto largo. (Tabela
  densa com sticky tem receita própria — skill `tabela-densa`.)
- **Eixo Y de gráfico:** use `ChartYAxisBRL`/`fmtAxisBRL` (rótulo compacto "R$ 1,8 Mi",
  1 casa) — formato longo quebra linha em larguras menores. (Detalhe de gráfico — skill
  `graficos`.)
- **Sticky dentro do `ListDrawer`** (scroll body `px-6 py-5`): para grudar pills/cabeçalho
  ao topo sem fresta, use `sticky -top-5 -mx-6 -mt-5 px-6 pt-5` — o `-top-5`/`-mt-5`
  cancelam o `py-5` do scroll body. Padrão recorrente; não reinvente.

---

## 9. Rota pesada nasce com skeleton (visão rápida)

Toda rota pesada (dashboard, tabela densa) tem `loading.tsx` com skeleton na **silhueta
real** da página — sem isso, o RSC deixa a tela "congelada" até todo o trabalho do
servidor terminar. Receita visual: silhueta aproximada, alturas fixas (sem CLS), tom
`zinc` + `animate-pulse` (nunca token de marca), sidebar fora (só o `<main>` é
substituído), mesmo container (`max-w`/`px`) da página real — senão o conteúdo salta na
troca. O padrão React completo (`loading.tsx`, `Suspense`/`use()`, `startTransition`) é
assunto da skill `react-padroes`; aqui só a parte visual do skeleton.

---

## Ver também

- `tabela-densa` — cabeçalho sticky, `border-separate`, `<ValorContabil>`, cabeçalho de
  duas linhas, exceção de `min-w` com `ScrollAutoHide eixo="both"`.
- `graficos` — primitivos de `@/components/charts`, paleta canônica por contexto
  semântico (série principal, cash-flow, YoY, subsetor/setor), formatadores de eixo.
- `react-padroes` — `loading.tsx`/skeleton completo, `Suspense`/`use()`,
  `startTransition`, os padrões do `eslint-plugin-react-hooks` v7.
- `frontend-design` (PLUGIN externo, **não versionado neste repo** — vem instalado como plugin
  oficial na máquina do operador; se não aparecer na listagem da sessão, siga sem ela) —
  direção estética para tela **nova** do zero; o
  Design System do Janus documentado aqui **sempre vence** em caso de conflito (tokens,
  primitivos e convenções deste projeto não são negociáveis por uma diretriz genérica).
