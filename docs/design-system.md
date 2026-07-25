# WT Finance — Design System

**Versão:** 4.26 · Jun 2026

> **Referência VIVA:** a página `/admin/design-system` reflete o código real (tokens, gráficos e estilos de plataforma importados de verdade). Cor é **SEMPRE via token** — cor crua do Tailwind ou hex em classe **quebram o lint** (`wt/no-cor-hardcoded`, ADR-0129); `zinc` é permitido; `src/lib/email` é isento. Primitivos canônicos em `src/components/ui/` (`Button`, `Input`/`Select`/`Textarea`, `Badge`, `Tabs`, `Tooltip`, `Card`, `Checkbox`). Micro-texto: `text-2xs` (11px) / `text-3xs` (10px).

## Tokens CSS

Os tokens são declarados em `src/styles/tokens.css` e importados em `src/app/globals.css`. Estão disponíveis como variáveis CSS (`var(--brand)`) e como classes Tailwind (`bg-brand`, `text-brand`, etc.).

### Texto

| Token CSS      | Valor     | Uso                          |
|---------------|-----------|------------------------------|
| `--text-primary` | `#2D2A26` | Títulos, valores principais  |
| `--text-muted`   | `#75777B` | Labels, subtítulos           |
| `--text-subtle`  | `#ACA39A` | Metadados, placeholders      |

Classes Tailwind: `text-text-primary`, `text-text-muted`, `text-text-subtle`

### Superfícies

| Token CSS          | Valor     | Uso                          |
|-------------------|-----------|------------------------------|
| `--surface`        | `#FFFFFF` | Fundo de cards               |
| `--surface-soft`   | `#F5F1EB` | Fundo da plataforma          |
| `--surface-strong` | `#FAF6EF` | Hover, destaque sutil        |

Classes Tailwind: `bg-surface`, `bg-surface-soft`, `bg-surface-strong`

### Bordas

| Token CSS          | Valor     | Uso                          |
|-------------------|-----------|------------------------------|
| `--border`         | `#E8E0D2` | Bordas de cards              |
| `--border-strong`  | `#D4C8B4` | Bordas com ênfase            |

Classes Tailwind: `border-wt-border`, `border-wt-border-strong`

### Brand (dinâmico por aba)

O token `--brand` muda conforme a aba ativa via `data-theme` no elemento `<html>`.

| Aba           | `--brand`   | `--brand-soft` | `--brand-deep` |
|--------------|-------------|----------------|----------------|
| Weddings      | `#BD965C`   | `#FBF1E1`      | `#8F7E35`      |
| Trips         | `#0091B3`   | `#D9EEF5`      | `#005670`      |
| Corporativo   | `#0D5257`   | `#DDE7E9`      | `#072F33`      |
| Group (plat.) | `#75777B`   | `#EAE6DD`      | `#4B4F54`      |

Classes Tailwind: `bg-brand`, `text-brand`, `border-brand`, `bg-brand-soft`, `bg-brand-deep`

### Feedback (terrosos refinados)

| Estado   | Texto (`--*`)  | Fundo (`--*-bg`) | Quando usar                         |
|---------|----------------|-----------------|--------------------------------------|
| Positivo | `#4F8E54`     | `#E8F0E4`       | Crescimento, margem alta (≥15%)     |
| Alerta   | `#D9A23F`     | `#FAEFD5`       | Margem média (10–15%), atenção      |
| Negativo | `#B85C5C`     | `#F5DDDD`       | Queda, margem baixa (<10%), prejuízo |

Classes Tailwind: `text-success`, `bg-success-bg`, `text-warning`, `bg-warning-bg`, `text-danger`, `bg-danger-bg`

⚠️ **`--warning` não serve como TINTA em corpo pequeno** — #D9A23F sobre branco dá **2,29:1**
(reprova AA). Para texto âmbar use **`--warning-deep`** (#8A6413, classe `text-warning-deep`):
5,37:1 sobre branco, 4,70:1 sobre `--warning-bg`, 4,77:1 sobre `--surface-soft`. Segue a convenção
`*-deep` de `--positive-deep`/`--negative-deep`. O `--warning` continua sendo o certo para **fundo,
borda e ícone**. Não recorra a `--gestao-fg` para isso: o DS separa a família de gestão de propósito
(gestão é "ação administrativa" e não acompanha mudanças do warning). (v5.3.0, nasceu nas colunas de
PREVISTO da DRE.)

---

## Tipografia

Fonte oficial: **Avenir LT Std** (auto-hospedada em `public/fonts/avenir/`).
Stack de fallback: `'Avenir LT Std', 'Avenir Next', 'Inter', Arial, sans-serif`

| Uso               | Peso Avenir   | CSS weight | Tamanho   |
|------------------|--------------|-----------|-----------|
| Display (KPI)     | 85 Heavy     | 800       | 32–40px   |
| Heading 1 (seção) | 85 Heavy     | 800       | 20–22px   |
| Heading 2         | 65 Medium    | 600       | 18px      |
| Title (card)      | 65 Medium    | 600       | 16px      |
| Body strong       | 55 Roman     | 500       | 14–15px   |
| Body              | 45 Book      | 400       | 14px      |
| Numeric (tabelas) | 55 Roman     | 500       | 14px      |
| Subtitle/Caption  | 45 Book      | 400       | 12–13px   |

---

## Padrão de cards (ADR-0041)

```tsx
import { Card } from '@/components/ui/card'

<Card title="Nome do componente" subtitle="Descrição do conteúdo">
  {/* conteúdo */}
</Card>
```

Especificações:
- Background: `--surface` (#FFFFFF)
- Border: 1px solid `--border`
- Border-radius: 10px
- Padding: 24px horizontal, 20px vertical (`px-6 py-5`)
- Shadow: `0 1px 3px rgba(45,42,38,0.04)`
- Title: font-weight 600, 16px, `--text-primary`
- Subtitle: font-weight 400, 13px, `--text-muted`

---

## Seções recolhíveis — padrão "linha-cortina" (v5.1.9)

Apenas as grandes seções mantêm comportamento recolhível (ADR-0042):
- **Visão Geral** (`TopSection`)
- **Visão Analítica por Operação** (`TopSection`)

Cards individuais ficam sempre visíveis.

`TopSection` (`src/components/shared/top-section.tsx`) usa padrão de alta visibilidade
(chevron 20px, bold, fundo `--brand-soft`, faixa lateral `--brand`) e, desde a v5.1.9, a
animação **"linha-cortina"** (aprovada em mockup interativo) — **o padrão de TODA barra
horizontal recolhível da plataforma**:

- **A barra fica FIXA** (nunca muda de altura) — é o "trilho" da cortina.
- **O conteúdo sai por baixo dela**, revelado de cima para baixo: a janela de revelação
  anima `grid-template-rows` `0fr↔1fr` (o conteúdo fica ancorado no topo do clip — efeito
  de cortina desenrolando, não de bloco empurrado).
- **A linha separadora fica presa à borda inferior da janela** (`absolute bottom:0`), sempre
  ao final do conteúdo visível: **desce à frente ao abrir e sobe à frente ao fechar**, como a
  haste de uma cortina. Cor: gradiente `color-mix` sobre `--brand-deep` (fade nas pontas).
- **Timing: `450ms` · `cubic-bezier(.32,.72,0,1)`** (escolhidos pelo Yan no mockup).
- **Folga lateral p/ a sombra dos cards (v5.1.10):** o `overflow-hidden` da janela clipa também
  na horizontal e cortaria a **sombra dos cards encostados nas bordas** (o hover de `.card-clicavel`
  sangra ~10px). O clip é estendido 16px p/ cada lado com `-mx-4` (entra na `px-8` do `<main>`, sem
  gerar barra horizontal) e o conteúdo é re-padronizado com `px-4` (segue ALINHADO à barra) → o
  padding-box do clip acomoda a sombra com folga (~6px). É o **idioma padrão** "deixar a sombra respirar
  dentro de um clip"; qualquer clip novo que envolva cards com sombra deve segui-lo (a linha-cortina
  compensa com `inset-x-7` = 16px de padding + 12px de inset). A folga vertical já vem do `pt-6/pb-5`.
- Acessibilidade: conteúdo fechado fica **`inert`** (fora do tab-order/leitor de tela — o
  `<details>` que este padrão substituiu fazia isso via `display:none`); `motion-reduce`
  desliga a transição. Estado só em memória (nasce aberto); conteúdo permanece montado.
- ⚠️ A janela usa `overflow-hidden`: popover `position:absolute` (não-portal) dentro da
  seção depende de haver conteúdo abaixo do gatilho; para popover que possa estourar o
  clip, usar `createPortal` (padrão de `base-dados-tab.tsx`).

Barra recolhível NOVA nasce com o `TopSection` (não reinventar o accordion).

## Badge de seção "Administração" (v5.1.9)

Toda tela da subárvore `/admin/*` exibe o selo **"Administração"** no canto superior direito,
**alinhado à altura do título da página** — substitui a antiga faixa branca full-bleed.
Vive em UM lugar só: `src/app/admin/layout.tsx` (wrapper `relative` + badge `absolute right-0
top-0 z-10`; tela admin nova ganha o selo de graça, sem gap sobrando).

Receita (âmbar de gestão — o canônico "ação administrativa só-admin"; NÃO confundir com a
badge "PRODUÇÃO" do Faturamento, que é neutra por decisão):
`inline-flex items-center gap-1.5 rounded-md border border-gestao bg-gestao-soft px-2.5 py-1
text-xs font-semibold text-gestao-fg` + ícone `VenetianMask` (14px). O top-right das páginas
admin fica RESERVADO ao selo (o refresh manual de `/admin/uploads` saiu na v5.1.9).

## Skeletons de carregamento (v4.39.0)

Estados de carregamento por rota via `loading.tsx` (App Router) + módulo reutilizável
`src/components/shared/skeletons.tsx`. O App Router mostra o skeleton **imediatamente** ao
navegar, enquanto o RSC da página resolve.

Receita (inegociável):
- **Silhueta aproximada da página real** — header + filtros + cards/tabela/gráficos nas dimensões
  aproximadas. **Sem CLS:** alturas/larguras fixas; a troca skeleton→conteúdo não "pula".
- **Tom neutro** — `bg-zinc-100`/`bg-zinc-200` + `animate-pulse`. Nunca token de marca no skeleton.
- **A sidebar NUNCA entra no skeleton** — `loading.tsx` só substitui o slot `children` do `<main>`
  do AppShell (a sidebar é irmã, não filha); o layout permanece.
- **Mesmo container da página** — cada `loading.tsx` envolve o skeleton no mesmo `max-w-*`/`px-*`
  da sua page (senão CLS). Use `SkeletonPagina container="…"`.
- **Puros de markup** — server components, zero JS/hook.

Primitivos/templates: `SkeletonHeader`, `SkeletonFiltros`, `SkeletonKpis`, `SkeletonGrafico`,
`SkeletonTabela`; templates `SkeletonDashboard` (KPIs+gráficos) e `SkeletonPaginaTabela` (busca+tabela).
Um `loading.tsx` num segmento cobre suas subrotas (ex.: `/performance` cobre trips/corporativo/weddings).

## Identidade Janus (v4.40.0, ADR-0145)

**Fronteira de marca:** Janus = plataforma INTERNA (sidebar, headers, auth, title, e-mails
internos, onboarding). O cliente externo vê só **Welcome** (e-mail de fatura 100% Welcome Trips
— invariante provado por diff/teste). Repo/`package.json` não renomeiam.

**Logo = máscara CSS + token (regra única).** O SVG monocromático entra como `mask-image` e a
cor é `backgroundColor: var(--brand)` — o asset nunca é editado; no repouso o logo é neutro
(#75777B, novo default do `:root`) e nas abas setoriais herda o override de `[data-theme]`.
Receita do header: caixa `h-12 w-[168px]` centralizada, `mask-size: contain`, posição `center`;
abaixo do logo, SÓ o "version X.X.X" centralizado (`mt-2`) — sem byline (decisão do checkpoint
v4.40.0; a marca Welcome vive no selo do rodapé): box `46px · p-1 · rounded-xl · bg-white · border`.

**`--brand` default = neutro do Grupo.** O dourado #BD965C é SÓ de Weddings (override
`[data-theme=weddings]`); o `:root` tem o trio do tema group (#75777B/#EAE6DD/#4B4F54).
Nunca reintroduzir dourado como default nem hardcodear #BD965C fora do contexto Weddings
(e-mail é isento — hex inline obrigatório).

**Lockup duplo (e-mails internos):** `[JANUS] | [WELCOME GROUP]` — tabela de células
(Outlook-safe), divisor de 1px em célula própria (`bgcolor`, nunca border), gaps de 18px em
células vazias, artes com ALTURAS ÓPTICAS casadas (36px exibidos; rasters 93px de altura).
CIDs no bundle (`janus-logo` + `welcome-logo`). A fatura usa só o Welcome.

**Modal de onboarding (receita):** overlay `bg-black/50` + painel `max-w-lg rounded-2xl p-8`
centrado; lockup duplo horizontal (empilha no mobile: `flex-col sm:flex-row`, divisor `w-px`
só no desktop); título serif via `style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}`
(a troca para Trajan Pro é essa linha); corpo `text-sm text-zinc-600`; CTA `bg-action-primary`
(tokens neutros de plataforma — nunca `var(--brand)`). Flag no banco (`onboarding_visto_em`),
promise fora do caminho bloqueante, fail-safe (falha → não exibe).

## Barras de rolagem (v4.40.0; ARRASTÁVEL + horizontal em v5.0.0 — padrão)

**TODO** container rolável INTERNO (lista/painel/tabela dentro de uma página, vertical OU
horizontal) usa a **barra flutuante auto-hide**: a scrollbar nativa é escondida
(`.scrollbar-none` — largura 0, não desloca o conteúdo, sem "goteira") e um **thumb em
overlay** aparece ao rolar/hover e **some sozinho** (~1,2s). O thumb é **ARRASTÁVEL** (pointer
capture — arrastar e mouse-scroll funcionam; v5.0.0 fechou o furo de "só rola com a roda do
mouse"). Componente único: **`<ScrollAutoHide>`** (`src/components/shared/scroll-auto-hide.tsx`).
Mecânica imperativa (refs, zero state — não re-renderiza por scroll); matemática pura e testada
em `@/lib/ui/scrollbar-math` (`scrollbar-math.test.ts`).

Props:
- `className` → vai no **viewport** (o que rola). Coloque **padding** (`px/py`), `max-h-*`,
  `min-w-*`. NUNCA `overflow-*`, `scrollbar-*`, `flex-1`, `min-h-0`, `h-full` (o wrapper já provê).
- `eixo` → `'y'` (default) · `'x'` (horizontal) · `'both'` (tabela densa, os dois eixos).
- `onScroll` → repassado ao viewport; usar p/ acender a **sombra do cabeçalho sticky** (§7):
  `onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}`.
- `contentClassName` → SÓ para espaçamento **entre filhos** (`space-y-*`, `flex flex-col gap-*`),
  pois `className` vai no viewport (cujo único filho é o wrapper de conteúdo). Padding fica em
  `className` (preserva o cálculo do sticky `-top-5`).

**Thumb ACIMA do cabeçalho sticky (v5.0.0):** o wrapper do `<ScrollAutoHide>` é `isolate`
(cria stacking context) e o thumb é `z-30`, então numa **tabela densa com `<thead>` sticky
`z-20`** (§7) a barra flutuante fica **por cima do header** — sem isso ela some atrás do cabeçalho
fixo ao rolar. Já é automático no primitivo: não precisa fazer nada no call-site. (Regra p/ QUALQUER
header fixo: se um container com header sticky não usar o primitivo, o indicador de rolagem tem de
ter `z-index` maior que o do header.)

**Respiro do thumb nas pontas (v5.2.0 — padrão):** o thumb **não encosta** nas bordas do
container — o trilho útil é `clientSize − 2×THUMB_FOLGA` (8px por ponta, constante canônica em
`@/lib/ui/scrollbar-math`). A folga entra na GEOMETRIA (`thumbGeom`) **e** na conversão do arraste
(`scrollAoArrastar`) — passar aos dois, senão a proporção do arraste descola do trilho. Vale para
o `<ScrollAutoHide>` (ambos os eixos) e para a cópia da sidebar (que desde a v5.2.0 consome o
`thumbGeom` compartilhado — fim da conta duplicada). (Origem: checkpoint v5.2.0 — o thumb da
sidebar colava no topo/rodapé.)

Migração (regra de escoteiro + varredura v5.0.0): trocar `<div className="overflow-* …">` por
`<ScrollAutoHide …>`; remover `overflow-*`/`flex-1`/`min-h-0`/`h-full`, manter padding/max-h/min-w
em `className`, mover `space-y-*` para `contentClassName`. Migrados na varredura: modais
(`ModalCentral` corpo), drawers (`ListDrawer`, `KpiDetailDrawer`, drilldown/margem de Weddings,
Calendário de Liquidez, Próximos Lançamentos), tabelas densas com sticky (Cadastro de Clientes,
Faturamento Corp, Revisar envio, Base de Dados) e tabelas horizontais (Lista de Operações, Mix
por Setor, Prejuízos, Movimentações, Carteira, Sumário por Subsetor, etc.). A **sidebar** mantém
implementação própria embutida (mesma mecânica; também arrastável desde a v5.0.0).

Exceção: o `<main>` do AppShell mantém a scrollbar NATIVA com `scrollbar-gutter: stable`
(DS §12) — é o scroll do documento; o padrão auto-hide vale para containers internos. E o
container HORIZONTAL do **board Kanban de Solicitações** mantém a barra nativa visível de
propósito (afordância "há mais colunas a rolar") — as COLUNAS dele rolam pelo padrão abaixo.

**Dimensionamento do viewport (v5.1.1):** o viewport dimensiona por **cadeia flex**
(`flex-1 min-h-0` dentro do wrapper `flex-col`), NUNCA `h-full` — porcentagem de altura não
resolve quando o ancestral tem altura INDEFINIDA (ex.: painel de modal `max-h-[85vh]`) e o
conteúdo VAZAVA sem barra (bug do modal de Nova Solicitação). Em fluxo normal a cadeia degrada
para altura de conteúdo (capada pelo `max-h` da `className`). Não reintroduzir `h-full`.

**Padrão: painel em COLUNAS (kanban/status) — v5.1.1.** Toda visão em colunas de cards
(caixa de entrada de Solicitações, Minhas solicitações) usa: **header da coluna FIXO** (título +
contagem, FORA do scroll) e os cards rolando por dentro com
`<ScrollAutoHide className="pl-1 pr-4 pt-2 pb-2" contentClassName="space-y-2">` — cada coluna tem a
própria barra. **A altura PREENCHE o espaço disponível por CADEIA FLEX** (v5.1.1), não por `max-h`
fixo: a página é `h-full flex flex-col` → o painel (tabpanel) `flex-1 min-h-0` → o container de
colunas (`flex ... overflow-x-auto` no board / `grid sm:grid-cols-3 sm:grid-rows-[minmax(0,1fr)]` em
Minhas) `flex-1 min-h-0` → cada coluna `flex flex-col min-h-0` → o `<ScrollAutoHide>` (já `flex-1`
por dentro) enche o resto e rola. Antes o `max-h-[calc(100vh-24rem)]` sobrava espaço embaixo e era
frágil (offset chumbado). O **padding do viewport é assimétrico de propósito**: `pr-4` abre uma
**goteira à direita** para o thumb vertical (`right-1 w-1.5`, 4–10px da borda) não ficar em cima do
card, e `pt-2` dá **respiro no topo** para o `box-shadow` de realce do hover (`.card-clicavel-neutra`)
do PRIMEIRO card não ser cortado pelo `overflow` do viewport. Painel novo desse tipo nasce assim.

## Cabeçalho de tabela ORDENÁVEL (v5.2.0 — padrão)

Coluna ordenável usa o idioma da **Lista de Operações** (o exemplo vivo mais antigo):
o `<th>` vira um `<button>` com o rótulo + ícone **lucide tamanho 12** —
- coluna **ativa**: `<ArrowUp size={12} />` (asc) ou `<ArrowDown size={12} />` (desc), na cor do texto;
- coluna ordenável **inativa**: `<ArrowUpDown size={12} className="text-zinc-300" />`.

Nada de caracteres unicode (▲/▼/↕) nem outros ícones — um idioma só, plataforma inteira.
Exemplos vivos: `SortTh` em `weddings/lista-operacoes.tsx` e `ThOrdenavel` em
`financeiro/ranking-caixa.tsx` ("Maiores variações"). (Registrado na v5.2.0: o padrão existia
só como código vivo e uma implementação nova recriou outro símbolo — documentado para não repetir.)

## Rótulo "Última atualização" — sinal de saúde da sincronização (v5.1.11)

Componente `<UltimaAtualizacao>` (`@/components/metas/ultima-atualizacao`) — o rótulo "Última
atualização em <ts>" das telas de Metas (Acompanhamento, Comparação e Modo TV). Mostra a última
**sincronização** com o Monde (`monde_ingest_status.ultima_sincronizacao`, v5.1.8) e, quando ela
**não avança há mais de 45 min** (3 ticks do cron de 15 min), fica **vermelho** (`text-danger`) com
o relógio trocado por um `TriangleAlert` — sinaliza que a integração pode ter parado **sem depender
de alguém reparar no horário**.

- O atraso é avaliado no **cliente** contra o horário atual e re-checado a cada 30 s (o rótulo cruza
  para vermelho sozinho ao passar do limite; volta ao neutro quando a sincronização é retomada, via
  o auto-refresh de 5 min). Começa NEUTRO no 1º render (o servidor não sabe o "agora" do cliente →
  sem mismatch de hidratação) e reavalia no efeito.
- Lógica pura e testável em `@/lib/metas/sync-atraso` (`sincronizacaoAtrasada(iso, agoraMs)`,
  `LIMITE_ATRASO_MS` = 45 min). Comparação de **instante** (fuso-agnóstica); o fuso só importa p/ exibir.
- **Cor:** o componente é dono da cor — passe só `className` de LAYOUT/tamanho (`text-xs`/`text-lg`),
  nunca cor (senão conflita com o `text-danger` do estado atrasado). Cor OK via `corNeutra`
  (default `text-[var(--text-muted)]`).
- **Cobre a falha DURA** (API fora do ar / cron parado → marcador congela). **Não cobre a SILENCIOSA**
  (API 200 sem vendas → marcador avança e engana). Ver o cabeçalho de `sync-atraso.ts`.

## MetaProgressBar — barra de progresso de meta (v5.0.0)

Primitivo `<MetaProgressBar>` (`@/components/shared/meta-progress-bar`) — elemento central dos
cards do Acompanhamento de Metas. Componente PURO (o tooltip é CSS-only `group-hover`, sem JS).
*(Substituiu o antigo `<Gauge>` semicírculo, removido no adendo v5.0.0 por decisão do Yan.)*

- **Trilha** neutra (`bg-zinc-100`, cantos plenos); **preenchimento** = `pctMeta` (realizado/meta,
  clampa em 100) na **cor de MARCA** do painel (`--marca-*` via `SETOR_MARCA_COLORS`; Group = neutro
  `--text-muted`) — nunca hex. *(Metas usa a cor de marca de cada setor, não a `--setor-*` de gráficos
  cross-setor — exceção deliberada ao ADR-0103, ver ADR-0146; cada card É o card daquele setor.)*
- **SETA do esperado** na posição `pctEsperado` (= `% do período decorrido`, pois o esperado é
  LINEAR): um marcador estático apontando para baixo, acima da barra (mesmo tom escuro da seta do
  balão — é "de onde o balão nasce"). Sem linha atravessando a barra.
- **Tooltip ESCURO** no hover (zinc-800): a seta estática é a PRÓPRIA PONTA do balão — a caixa
  encosta nela (sem segunda seta) e **cresce a partir dela** (scale+fade com transform-origin no
  ponto da seta; `motion-reduce` respeitado). **CLAMP ao viewport** (client: mede a barra/balão →
  lógica pura `@/lib/metas/tooltip-clamp`, testada): perto das bordas a caixa desliza para dentro
  da tela e a seta desliza dentro dela para seguir apontando o tick — nunca vaza: título `"N% do período decorrido"` (`pctDecorrido`), linhas
  `Esperado`/`Realizado` (R$), e a conclusão colorida — `+R$ Z adiantado` (`text-success`) ou
  `R$ Z abaixo do esperado` (`text-danger`).
- Props: `pctMeta`, `pctEsperado`, `cor`, `altura` (12 Group / 10 setorial), `pctDecorrido`,
  `esperado`, `realizado`. Régua (verde/âmbar/vermelho) colore só o "% da meta" e a conclusão — nunca a barra.
- **Esperado LINEAR** (`@/lib/metas/ritmo`): `esperado = metaPeriodo × dias_decorridos/dias_período`.
  O card compara "X% da meta" (régua-colorido) vs "Y% esperado" (referência neutra = % do período).

## Metas — Acompanhamento & Cadastro (v5.0.0)

Seção Metas (tema **group**, neutro): **Acompanhamento** (`/metas`) e **Cadastro** (`/metas/cadastro`);
subabas "Acompanhamento" / "Cadastro" na sidebar (o grupo "Metas" dá o contexto).
- **Acompanhamento**: pills próprias **calendário-fixas** (`MetasPeriodoPills` + `@/lib/metas/periodo-metas`):
  **Mensal (default) / Trimestral / Semestral / Anual** — o corte-calendário CORRENTE (1º tri = jan–mar,
  nunca "últimos 3 meses"; sem Personalizado). Distintas das pills de janela móvel da Performance. → aviso de
  parcialidade → card Group (label `WELCOME GROUP`, Faturamento + `% da meta`/`% do esperado` +
  `<MetaProgressBar altura=12>` + rodapé Receita | Margem) → 3 cards setoriais (`<MetaProgressBar altura=10>`
  na cor do setor) → gráfico "Ritmo do período". **SEM YoY na superfície** (Metas responde "entregamos o
  combinado?"; Performance responde "melhoramos vs ano passado?"); a **Margem** mostra o delta em **p.p.
  contra o alvo** de %Rec, colorido (acima=success, abaixo=danger).
- **Cadastro**: grade anual 12 meses × 3 setores × [Faturamento, % Rec] com **Group computado ao vivo**
  (coluna read-only, fundo distinto), Total em formato contábil pleno, e **edição local + salvar em lote**
  (ver padrão abaixo). "Aplicar ao ano" no cabeçalho de cada % Rec preenche os 12 meses do setor.
- **Fonte única**: o real vem de `get_executiva_kpis`; meta/ritmo do módulo puro `calcularRitmo`
  (`@/lib/metas/ritmo` — pró-rata por dias, régua com constantes nomeadas, "hoje" = última venda,
  `pctDecorrido`). Display "Trips"/chave "Lazer". Cor de identidade via `SETOR_COLORS`.

### Padrão: edição local + salvar em lote (com contador e guarda)
Grade editável com muitas células (Cadastro de Metas) NÃO faz autosave por célula. Em vez disso:
clique → edita → **Enter/blur confirma LOCALMENTE** (Esc cancela), a célula suja ganha **ponto âmbar**
(`bg-warning`), e derivados (Group/Total) recalculam ao vivo. O rodapé mostra **"N alterações não
salvas"** + botão **Salvar** (desabilitado sem pendências) que persiste TUDO numa chamada
(o histórico continua por célula no banco). **Guarda de saída**: trocar de contexto/ano ou fechar a aba
com pendências → confirmação explícita (`window.confirm` + `beforeunload`) — a edição nunca evapora.
Erro no salvar mantém as pendências marcadas (retry). (Distinto do autosave-por-célula de
`contas-manager`/`lancamento-row`, para grades pequenas.)

## Tela de exibição / quiosque (Modo TV — v5.1.0)

Padrão para uma **pele de exibição** de uma tela existente numa TV/parede: tela cheia, tema claro,
**zero interação** (sem pills/tooltip/hover/botão), tudo grande e legível do fundo da sala.
Primeiro caso: `/metas/tv` (Modo TV do Acompanhamento). Regras:

- **Reusa os DADOS e a linguagem visual da tela-mãe — sem terceiro caminho.** A orquestração de
  dados é extraída para um módulo compartilhado (`carregar-acompanhamento.ts`) consumido pela tela
  normal E pela TV; os números batem por construção. A régua de cor e os primitivos (barra + seta)
  são os mesmos (`corComparacao`, `<MetaProgressBar>`); a barra usa `mostrarTooltip={false}` (o
  balão de hover some) e `setaEscala` para ampliar a seta sem mudar o desenho/tom.
- **Sem AppShell por curto-circuito de pathname, não por route group.** Como o AppShell vive no
  layout raiz, a rota de exibição é liberada do chrome via `usePathname()` no próprio AppShell (e no
  modal de onboarding), renderizando `{children}` puro. Ocupa o viewport por `h-screen` — **sem
  Fullscreen API**. Sidebar e proxy/auth intocados. (ADR-0148.)
- **Interação zero; a leitura vem de elementos fixos** (a seta + uma legenda fixa no rodapé
  substituem o que era hover na tela-mãe).
- **Auto-refresh é INTERIM**: um client isolado (`router.refresh()` em intervalo), fácil de remover
  quando houver tempo-real. Nunca acoplar lógica a ele.
- **Auth por usuário dedicado de mínimo privilégio** (só a área de leitura da tela exibida), criado
  na UI de Usuários & Acessos — sem migration.

## Painel de Histórico de alterações + desfazer (v5.2.1, ADR-0155)

Padrão reutilizável de auditoria+reversão sobre uma tabela editável (nasce no Gerencial,
generalizável). Componente `historico-alteracoes.tsx`.

- **Colapsável**, mesmo idioma do `TopSection`/`ContasCards` (chevron `ChevronRight` que gira,
  rótulo `text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]`, `foco-neutro`).
  Carrega os lotes só ao abrir; recarrega por `recarregarKey` (o pai incrementa após qualquer
  mudança/desfazer).
- **Agrupado por LOTE** (uma transação = uma "ação"): cada item mostra operação (Inclusão/Edição/
  Exclusão/Alterações/Reversão), autor, data-hora (`fmtDataHoraSP`) e nº de linhas; expande para o
  **antes→depois** por linha (campos alterados com `line-through` no "de" e tom neutro no "para").
  Lista rolável via `<ScrollAutoHide>` (nunca `overflow-*` cru).
- **Fricção proporcional:** desfazer em MASSA (lote > 1 linha) abre `ConfirmModal` (confirmação
  forte, com `AlertTriangle` e a contagem); desfazer unitário é direto; desfazer por linha usa o
  duplo-clique-confirma (mesmo idioma da lixeira das linhas).
- **`lote_id` viaja como STRING** ponta-a-ponta (bigint/txid pode passar de 2^53 — `Number()`
  perderia precisão; o PostgREST casta a string p/ bigint no servidor). Regra: IDs de banco que
  possam estourar 2^53 nunca viram `number` no cliente.
- **Aviso vivo compartilhado:** o banner de topo da Base de Dados (âmbar `--warning`, dispensável)
  serve tanto o CONFLITO de trava otimista quanto a mudança de OUTRO usuário (realtime) — um só
  mecanismo, sempre seguido de `router.refresh()`.
- **Realtime é fail-safe e por broadcast** (não polling, não `postgres_changes`): o hook
  `useRealtimeGerencial` assina o canal privado, ignora as próprias mudanças (por `usuario_id`) e
  degrada em silêncio se o Realtime cair (a página nunca quebra). ADR-0155 §3.

## Tabela hierárquica da DRE + bandas neutras (v5.3.0, ADR-0156)

A DRE por Fluxo de Caixa (`/financeiro/dre`, `tabela-dre.tsx`) fixa o padrão de
**demonstrativo hierárquico denso** da plataforma:

- **Bandas neutras de agrupamento**: tokens `--band` (#E8E6E1, cabeçalho de bloco) e
  `--band-soft` (#F3F2EE, sub-bloco) — cinza NEUTRO-QUENTE alinhado à plataforma
  (deliberadamente nem o zinc frio, nem o `--border` tan; primeiro passo da tokenização
  do cinza, follow-up v4.26). **Linhas de resultado em banda ESCURA** `--action-primary`
  com rótulo `--action-primary-fg` e valores nos tons `-soft` (`--positive-soft`/
  `--negative-soft`, 6,5:1 — os tons base reprovam AA sobre as bandas).
- **Cor por SINAL nos valores** (verde receita / vermelho gasto), parênteses contábeis
  com largura reservada (`<span class="invisible">)</span>` nos positivos/zeros), zero
  como travessão `--text-subtle`.
- **Previsto = escala ÂMBAR por nível** (tempo no FUNDO, sinal na TINTA): cada banda tem
  o par âmbar via `color-mix` de tokens (cat → `warning-bg/50`; claro → 60% de warning-bg
  sobre `--band`; soft → 60% sobre `--band-soft`; escuro → 22% de `--warning` sobre
  `--action-primary` — mais que isso derruba os `-soft` abaixo de AA). Colunas de
  previsto RECOLHÍVEIS numa coluna-soma (toggle acessível no cabeçalho do grupo).
- **Chevron de expansão sempre à DIREITA** da célula de rótulo; a célula inteira é o
  botão (padrão acordeão). Célula sticky SEMPRE com fundo opaco da banda da linha.
- **Cabeçalho sticky de 2 linhas**: as células `rowSpan={2}` existem só na 1ª `<tr>` —
  régua de base e sombra-ao-rolar vão DIRETAMENTE nelas (nunca por seletor de "última
  linha do thead"); ver a nota em CLAUDE.md §Cabeçalho de tabela.
- **Respiro dos thumbs nos limites**: gutter interno `pr/pb-1.5` no viewport do
  `<ScrollAutoHide>` — nos extremos o thumb flutua sobre o gutter, não sobre a última
  coluna/linha (o mesmo respiro que a sidebar obtém via padding do nav).
- **Bandeja "Não classificadas"** ao fim (âmbar, rótulo na célula sticky): órfãs do
  de-para sempre visíveis — nada some em silêncio.

O editor da estrutura (`/financeiro/dre/estrutura`, `editor-dre.tsx`) segue o padrão de
edição em lote do Cadastro de Metas + o painel de histórico prop-izado (ADR-0155/0156).
