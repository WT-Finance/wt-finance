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

## Seções recolhíveis

Apenas as 2 grandes seções mantêm comportamento recolhível (ADR-0042):
- **Visão Geral** (`TopSection`)
- **Visão Analítica por Operação** (`TopSection`)

Cards individuais ficam sempre visíveis.

`TopSection` usa padrão de alta visibilidade (chevron 20px, bold, fundo `--brand-soft`, faixa lateral `--brand`).

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

## Barras de rolagem (v4.40.0 — padrão)

Container rolável INTERNO (lista/painel dentro de uma página) usa a **barra flutuante
auto-hide**: a scrollbar nativa é escondida (`.scrollbar-none` — largura 0, não desloca o
conteúdo, sem "goteira") e um **thumb em overlay** aparece ao rolar/hover e **some sozinho**
(~1,2s). Componente pronto: **`<ScrollAutoHide>`** (`src/components/shared/scroll-auto-hide.tsx`)
— substitui o `<div className="overflow-y-auto">`; a `className` vai no viewport. Mecânica
imperativa (refs, zero state — não re-renderiza por scroll). Exemplos vivos: a **sidebar**
(implementação própria embutida, a origem do padrão) e o **Acervo de Documentos**.

Exceção: o `<main>` do AppShell mantém a scrollbar NATIVA com `scrollbar-gutter: stable`
(DS §12) — é o scroll do documento; o padrão auto-hide vale para containers internos.

## MetaProgressBar — barra de progresso de meta (v5.0.0)

Primitivo `<MetaProgressBar>` (`@/components/shared/meta-progress-bar`) — elemento central dos
cards do Acompanhamento de Metas. Componente PURO (o tooltip é CSS-only `group-hover`, sem JS).
*(Substituiu o antigo `<Gauge>` semicírculo, removido no adendo v5.0.0 por decisão do Yan.)*

- **Trilha** neutra (`bg-zinc-100`, cantos plenos); **preenchimento** = `pctMeta` (realizado/meta,
  clampa em 100) na **cor de MARCA** do painel (`--marca-*` via `SETOR_MARCA_COLORS`; Group = neutro
  `--text-muted`) — nunca hex. *(Metas usa a cor de marca de cada setor, não a `--setor-*` de gráficos
  cross-setor — exceção deliberada ao ADR-0103, ver ADR-0146; cada card É o card daquele setor.)*
- **Tick MUDO** na posição `pctEsperado` (= `% do período decorrido`, pois o esperado é LINEAR),
  atravessando a barra (`bg-zinc-500`).
- **Tooltip ESCURO** no hover (zinc-800) que **SAI DA LINHA DO ESPERADO** (seta no tick; a caixa abre
  para o lado com espaço, sem vazar da tela): título `"N% do período decorrido"` (`pctDecorrido`),
  linhas `Esperado`/`Realizado` (R$), e a conclusão colorida — `+R$ Z adiantado` (`text-success`) ou
  `R$ Z abaixo do esperado` (`text-danger`).
- Props: `pctMeta`, `pctEsperado`, `cor`, `altura` (12 Group / 10 setorial), `pctDecorrido`,
  `esperado`, `realizado`. Régua (verde/âmbar/vermelho) colore só o "% da meta" e a conclusão — nunca a barra.
- **Esperado LINEAR** (`@/lib/metas/ritmo`): `esperado = metaPeriodo × dias_decorridos/dias_período`.
  O card compara "X% da meta" (régua-colorido) vs "Y% esperado" (referência neutra = % do período).

## Metas — Acompanhamento & Cadastro (v5.0.0)

Seção Metas (tema **group**, neutro): **Acompanhamento** (`/metas`) e **Cadastro** (`/metas/cadastro`);
subabas "Acompanhamento" / "Cadastro" na sidebar (o grupo "Metas" dá o contexto).
- **Acompanhamento**: pills de período (`PeriodoFilterPillsUrl`, `defaultPreset="este-ano"`) → aviso de
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
