# Levantamento as-built — Fundação (infra, casca, design system)

**Data:** 2026-09-15
**Commit de referência:** `62bd8b9ce37dfaf7eacb2c2f3f3560b7df25247b` (`main`, merge do PR #273 — v5.11.0)
**Versão do app:** 5.11.0 (`package.json`)
**Natureza:** levantamento só-leitura. Nenhum arquivo do repositório foi alterado além deste.

## Regra de leitura deste documento

A verdade aqui é o **código e a configuração no commit acima**. Onde a documentação do projeto
(ADRs, skills, página `/admin/design-system`) diverge, a divergência está registrada na seção 7 e
**o código prevalece**. Toda afirmação carrega evidência em `caminho:linha` ou o comando que a
produziu. Onde não foi possível determinar, está escrito "não determinado" — isso é saída
legítima, não lacuna a preencher por inferência.

Régua de escrita: medição fica, opinião sai. Não há proposta de melhoria neste documento.

## O que NÃO foi coberto, e por quê

| Não coberto | Por quê |
|---|---|
| Camada de dados (RPCs, RLS, schemas, políticas) | Fora do escopo "Fundação". O mapa vive em `docs/adr/` e na skill `banco-e-rpc`. |
| Telas de domínio (DRE, Fluxo de Caixa, Metas, Solicitações, Estante, Inventário) | Só entram aqui quando consomem ou contaminam a fundação (seções 3 e 6). |
| Verificação visual em navegador | Levantamento estático. Nenhuma tela foi aberta; afirmações sobre render vêm do código e de comentários in-code que registram conferências anteriores. |
| Conteúdo de e-mail (`src/lib/email/**`) | Tem regime próprio (hex inline obrigatório por compatibilidade com Outlook, isento do lint de cor) e não faz parte da casca web. Aparece só como exceção documentada. |
| Medição de performance, bundle, Core Web Vitals | Não solicitado e não medido. |
| Auditoria de acessibilidade em ferramenta (axe, Lighthouse) | Não executada. O que consta em "receita de acessibilidade" (seção 2) é o que está **implementado no código**, não um veredito de conformidade. |
| Suíte de testes (1.225 testes) | Citada só quando funciona como **sonda de convenção** do design system. |

---

# 1. Tokens e tema

## 1.1 Onde os tokens vivem e em que forma

Duas camadas, ambas CSS puro — **não há arquivo de tema em TypeScript, nem `tailwind.config`**:

1. **`src/styles/tokens.css`** (171 linhas) — declara as variáveis CSS no `:root` e nos quatro
   blocos `[data-theme="…"]`. É a fonte da verdade.
2. **`src/app/globals.css`** (245 linhas) — importa o Tailwind (`@import "tailwindcss"`, linha 1)
   e o `tokens.css` (linha 2), e reexpõe parte dos tokens como **utilitárias Tailwind** dentro de
   um bloco `@theme inline` (linhas 54–150). É aí que `--positive` vira as classes
   `bg-positive` / `text-positive` / `border-positive`.

Tailwind 4 sem arquivo de config: a configuração de tema é o próprio `@theme inline`. O PostCSS
carrega só `@tailwindcss/postcss` (`postcss.config.mjs`).

**Consequência prática para replicação:** um token existe em duas formas e elas não são
intercambiáveis. Dentro do `@theme` ele vira classe (`text-text-muted`); fora dele só é alcançável
por `var(--token)` ou pela forma arbitrária `[var(--token)]`. A forma `-[--token]` (atalho do
Tailwind 3) **compila para CSS inválido e é descartada em silêncio** no Tailwind 4 — há uma regra
de lint dedicada a barrá-la (`wt/no-tailwind-var-shorthand`) e um hook de sessão que varre o mesmo
padrão a cada resposta do agente.

## 1.2 Inventário por família

### Cor — 64 tokens no `:root`, mais 3 redefinidos por tema

| Família | Tokens | Valores |
|---|---|---|
| Texto (4) | `--text-primary` `--text-secondary` `--text-muted` `--text-subtle` | `#2D2A26` `#4B4F54` `#75777B` `#ACA39A` |
| Superfície (3) | `--surface` `--surface-soft` `--surface-strong` | `#FFFFFF` `#F5F1EB` `#FAF6EF` |
| Borda (2) | `--border` `--border-strong` | `#E8E0D2` `#D4C8B4` |
| Bandas de agrupamento (2) | `--band` `--band-soft` | `#E8E6E1` `#F3F2EE` — cinza neutro-quente, deliberadamente **não** o `zinc` (frio/azulado) nem o `--border` (tan). Fundo de cabeçalho de bloco em tabela financeira densa. |
| Feedback (7) | `--success` `--success-bg` `--warning` `--warning-bg` `--warning-deep` `--danger` `--danger-bg` | `#4F8E54` `#E8F0E4` `#D9A23F` `#FAEFD5` `#8A6413` `#B85C5C` `#F5DDDD` |
| Plataforma neutra (6) | `--action-primary` `--action-primary-fg` `--focus-ring` `--action-soft` `--action-soft-border` `--action-soft-fg` | `#3F4144` `#FFFFFF` `rgba(63,65,68,.20)` `#EAE6DD` `#75777B` `#4B4F54` |
| Ação administrativa (3) | `--gestao` `--gestao-soft` `--gestao-fg` | `#BA7517` `#FAEEDA` `#633806` |
| Semântica de sinal / cash-flow (8) | `--positive` `--positive-soft` `--positive-deep` `--negative` `--negative-soft` `--negative-deep` `--neutral` `--neutral-soft` | `#5F7A3D` `#C4D5A6` `#3F5028` `#A35442` `#E8C9C0` `#6B2D1F` `#C99E5E` `#F5E6CC` |
| Valor teórico (2) | `--teorico` `--teorico-soft` | `#8A6413` `#FBF1E1` |
| Marca (3, redefinidos por tema) | `--brand` `--brand-soft` `--brand-deep` | default `#75777B` `#EAE6DD` `#4B4F54` |
| Subsetor (5) | `--subsetor-comercial` `--subsetor-planejamento` `--subsetor-producao` `--subsetor-hospedagens` `--subsetor-extras` | `#8C857B` `#8F7E35` `#874B52` `#4B4F54` `#7A8289` |
| Balão de dica (1) | `--tooltip-bg` | `#27272a` |
| Gráfico — estrutura e séries (7) | `--chart-axis-tick` `--chart-grid` `--chart-success` `--chart-warning` `--chart-danger` `--chart-neutral` `--chart-info` | `#52525b` `#e4e4e7` `#10b981` `#f97316` `#dc2626` `#94a3b8` `#6366f1` |
| Gráfico — cash-flow identitário (2) | `--chart-fluxo-entrada` `--chart-fluxo-saida` | `#0091B3` `#D9A23F` |
| Setor macro (3) | `--setor-lazer` `--setor-weddings` `--setor-corporativo` | `#378ADD` `#BA7517` `#0F6E56` |
| Marca por setor, cross-contexto (3) | `--marca-lazer` `--marca-weddings` `--marca-corporativo` | `#0091B3` `#BD965C` `#0D5257` |

Fora do `tokens.css`, o `globals.css` declara mais 4 no `:root` (linhas 47–52): `--background`
`#ffffff`, `--foreground` `#171717`, `--sidebar-bg` `#fafafa`, `--sidebar-border` `#e4e4e7`. Esses
quatro **não** pertencem ao sistema semântico — são resíduo do boilerplate do `create-next-app`, e
três deles são consumidos de verdade (ver 1.3).

**Decisões não óbvias embutidas nos valores** (o código diz o porquê):

- `--warning-deep` existe porque `--warning` puro dá **2,0:1 sobre branco** e reprova AA como
  tinta; a variante escura mede 5,4:1 sobre branco e 4,7:1 sobre `--warning-bg`
  (`src/styles/tokens.css:32-39`).
- `--teorico` tem **exatamente o mesmo valor** de `--warning-deep` hoje e ainda assim é token
  separado: "se um dia 'atenção' virar laranja, o float não pode ir junto"
  (`src/styles/tokens.css:80-91`). Valor teórico — dinheiro que a operação renderia mas que nunca
  entra em resultado — precisa de cor própria porque pintá-lo de verde faria a tela afirmar um
  ganho que não houve.
- O `--brand` default do `:root` é o **neutro do grupo**, não o dourado: o dourado é só de
  Weddings e, como default, causaria flash dourado antes da hidratação do provider de tema
  (`src/styles/tokens.css:93-100`).
- `--tooltip-bg` foi criado para reproduzir **exatamente** o `zinc-800` que estava cravado na
  classe, "para tirar a cor crua do componente sem mudar um pixel"
  (`src/styles/tokens.css:110-113`).
- `--setor-weddings` (`#BA7517`) **não pode ser usado como texto**: dá 3,72:1 sobre branco e
  reprova AA. A variante legível é `--teorico` (`src/styles/tokens.css:86-89`).

### Tipografia

Existem exatamente **dois** tokens de tamanho: `--text-2xs: 11px` e `--text-3xs: 10px`
(`src/app/globals.css:145-149`), declarados **em px e não rem** de propósito, para serem
byte-equivalentes aos arbitrários `text-[11px]`/`text-[10px]` que substituíram. Todo o resto da
escala é a padrão do Tailwind.

Escala efetivamente em uso (ocorrências de classe em `src/**/*.tsx`):

| Classe | Ocorrências |
|---|---|
| `text-xs` (12px) | 532 |
| `text-sm` (14px) | 317 |
| `text-2xs` (11px, próprio) | 223 |
| `text-3xs` (10px, próprio) | 98 |
| `text-base` (16px) | 46 |
| `text-xl` (20px) | 34 |
| `text-2xl` (24px) | 15 |
| `text-lg` (18px) | 11 |
| `text-3xl` / `text-5xl` / `text-6xl` | 4 / 2 / 1 |

Mais **97 tamanhos arbitrários em px**, concentrados em `text-[13px]` (43), `text-[10px]` (14),
`text-[9px]` (12), `text-[15px]` (9), `text-[11px]` (9). O `text-[13px]` é o mais frequente e não
tem classe própria — é o tamanho de subtítulo e de corpo de tabela densa.

Pesos: `font-medium` 357 · `font-semibold` 274 · `font-bold` 25 · `font-normal` 21 ·
`font-extrabold` 3, mais dois `font-[800]` inline.

### Espaçamento, raio, sombra, borda, largura de contêiner, densidade

**Não existe token para nenhum desses.** Todos vêm da escala padrão do Tailwind 4, usada direto. O
que existe é **convenção repetida**, não sistema:

- **Raio**: `rounded` 276 · `rounded-lg` 148 · `rounded-xl` 121 · `rounded-full` 79 · `rounded-md`
  38 · `rounded-sm` 8 · `rounded-2xl` 5. A convenção de fato: `rounded-xl` para card,
  `rounded-lg` para campo e botão, `rounded-full` para pill.
- **Sombra**: `shadow-sm` 96 (card em repouso) · `shadow` 14 · `shadow-lg` 12 (balão de dica) ·
  `shadow-2xl` 7 (painel de modal/drawer) · `shadow-xl` 3 · `shadow-md` 3.
- **Largura de contêiner**: não há. O respiro horizontal e vertical é **fonte única no `<main>`**
  do AppShell (`px-8 py-8`, `src/components/layout/app-shell.tsx:64`); páginas não definem `px`,
  `py`, `max-w` nem `mx-auto` no container raiz — isso está escrito como regra no próprio
  comentário (`app-shell.tsx:57-63`).
- **Densidade**: não é parametrizável globalmente. Onde existe, é prop local do componente
  (`Card size="sm"`, `Input variant="compacto"`, `PILL_FILTRO_SM`).

## 1.3 Tema escuro: existe hoje? — **Não.**

Sem rodeio: **o produto não tem tema escuro**. O que existe é um vazamento do template inicial do
Next.js que produz um defeito real.

Evidência (varredura do repositório inteiro):

- **Zero** ocorrências da variante `dark:` do Tailwind em `src/`.
- **Zero** ocorrências de `data-theme="dark"`, `.dark`, `colorScheme` ou `color-scheme` em `src/`.
- Duas ocorrências de `prefers-color-scheme`:
  - `src/app/icon.svg:4` — o favicon SVG troca o preenchimento da marca para branco no escuro.
    Inofensivo, é só o ícone da aba.
  - **`src/app/globals.css:152-159`** — redefine **quatro** variáveis: `--background` → `#0a0a0a`,
    `--foreground` → `#ededed`, `--sidebar-bg` → `#111111`, `--sidebar-border` → `#27272a`.

**Nenhum dos 64 tokens de `tokens.css` tem par escuro.** Nem `--text-primary`, nem `--surface`,
nem `--border`, nem `--brand`.

**O defeito que isso produz.** Três das quatro variáveis do bloco escuro são consumidas em
produção:

- `--background` e `--foreground` pintam o `<body>` (`src/app/globals.css:161-165`);
- `--sidebar-bg` e `--sidebar-border` pintam a sidebar e o cabeçalho mobile
  (`src/components/layout/sidebar.tsx:223,225,327,332` e
  `src/components/layout/mobile-header.tsx:13`), sempre via `style={{…}}`.

Num usuário com o sistema operacional em modo escuro, a sidebar recebe fundo `#111111` enquanto o
nome do usuário continua em `--text-primary` `#2D2A26` (`sidebar.tsx:344`) e o rótulo da role em
`--text-muted` `#75777B` (`sidebar.tsx:348`): **texto escuro sobre fundo quase preto**. O mesmo
vale para o `<body>`, que fica `#0a0a0a` sob todos os cards `bg-white`. Nada no app decide isso —
não passa pelo mecanismo `[data-theme]`, que é o único canal de variação de cor documentado.

**Onde há cor absoluta que impediria adotar tema escuro.** A resposta não é "os hex" (são poucos,
ver 1.5) — é a **paleta `zinc` crua** e o **`bg-white`**:

| Obstáculo | Ocorrências | Arquivos |
|---|---|---|
| `*-zinc-NNN` em `className` | **1.627** | 135 |
| `bg-white` / `text-white` / `bg-black` / `text-black` | **181** | ~95 |
| Qualquer outra família da paleta Tailwind (`slate`, `gray`, `neutral`, `stone`, `red`, `blue`, `emerald`, `amber`, `indigo`, `teal`, …) | **0** | — |

A disciplina de token eliminou **completamente** as 20 outras famílias de cor do Tailwind, e
sobrou um monolito de `zinc` + `white`: 1.808 valores que não reagem a tema nenhum. `zinc` é
exceção **deliberada e documentada** ("cinza de UI neutro, ainda não tokenizado") e o lint de cor
não o barra.

**O mecanismo de tema que existe** (e que um tema escuro teria de respeitar): `ThemeProvider`
(`src/components/layout/theme-provider.tsx`) é um componente cliente sem render (`return null`)
que, num `useEffect` disparado a cada mudança de `pathname`, escreve
`document.documentElement.setAttribute('data-theme', …)`. O mapeamento é por prefixo de rota
(`theme-provider.tsx:12-17`):

| Prefixo de rota | Tema | `--brand` |
|---|---|---|
| `/performance/weddings` | `weddings` | `#BD965C` (dourado) |
| `/performance/trips` | `trips` | `#0091B3` (Pantone 632 C) |
| `/performance/corporativo` | `corporativo` | `#0D5257` (Pantone 7476 C) |
| todo o resto | `group` | `#75777B` (Cool Gray 9) |

Só **três** variáveis mudam por tema. Como o atributo é escrito num efeito de cliente, existe uma
janela pré-hidratação — resolvida fazendo o default do `:root` ser idêntico ao tema `group`, e é
por isso que as telas de plataforma (login, admin, solicitações) usam os tokens dedicados
`--action-*` em vez de `var(--brand)`.

## 1.4 Fonte

**Avenir LT Std**, fonte oficial do grupo, auto-hospedada em `/fonts/avenir/*.otf` e declarada em
cinco `@font-face` em `src/app/globals.css:7-45`:

| Arquivo | `font-weight` mapeado |
|---|---|
| `Avenir LT Std 35 Light.otf` | 300 |
| `Avenir LT Std 45 Book.otf` | 400 |
| `Avenir LT Std 55 Roman.otf` | 500 |
| `Avenir LT Std 65 Medium.otf` | 600 |
| `Avenir LT Std 85 Heavy.otf` | 800 |

Todos com `font-display: swap`. Formato **OTF** (não WOFF2). A stack aplicada é `'Avenir LT Std',
'Avenir Next', 'Inter', Arial, sans-serif`, declarada duas vezes: como `--font-sans` no `@theme`
(`globals.css:57`) e diretamente no `body` (`globals.css:164`).

Uma segunda fonte entra por `next/font/google`: **Geist Mono**, carregada em
`src/app/layout.tsx:14-17` e exposta como `--font-geist-mono`, que o `@theme` mapeia para
`--font-mono` (`globals.css:58`).

**Restrição de licença ou hospedagem: nenhuma está registrada no repositório.** Os `.otf` são
servidos do próprio `public/`, sem CDN e sem `next/font/local`. Não determinado se existe licença
que restrinja redistribuição — isso não está escrito em nenhum ponto do código, dos ADRs ou das
skills consultadas. **Para uma replicação fora deste grupo, esse é um item a resolver antes de
copiar os arquivos de fonte.**

## 1.5 Cor fora do sistema de tokens

### Hex literal — 121 ocorrências fora dos dois arquivos de definição

| Arquivo | Ocorr. | Natureza |
|---|---|---|
| `src/app/admin/design-system/page.tsx` | 49 | **Duplicação da paleta** para desenhar as amostras da própria página de documentação. Se um token mudar em `tokens.css` e ninguém atualizar esta página, ela passa a mentir. |
| `src/lib/email/template.ts` | 26 | **Isento por config** (`eslint.config.mjs` desliga o lint de cor em `src/lib/email/**`) — hex inline é obrigatório em e-mail para o Outlook. |
| `src/data/changelog-diretoria.ts` | 21 | **Falso-positivo**: referências de PR (`#271`, `#273`) que casam com hex de 3 dígitos. |
| `src/app/admin/design-system/plataforma-showcase.tsx` | 5 | Mesma duplicação de paleta da página de doc. |
| `src/styles/tokens.test.ts` | 4 | Asserção contra o valor canônico — é a sonda, não drift. |
| `src/components/shared/kpi-detail-drawer.tsx` | 3 | **Violação real.** `stroke="#f1f5f9"` (linha 138) e `fill: '#a1a1aa'` (linhas 141 e 148). Equivalem a `--chart-grid` e `--chart-axis-tick`, que já existem. |
| `src/components/charts/chart-theme.ts` | 3 | Em comentário (cita os hex substituídos). |
| `src/components/ui/tabs.tsx` | 1 | **Violação real.** `color: '#fff'` em `style` inline (linha 36), no ramo `corAtiva`. |
| 6 arquivos restantes | 1 cada | Comentário em prosa (`sidebar.tsx`, `sumario-subsetor.tsx`, `weddings-kpis-section.tsx`, `welcome-janus-modal.tsx`, `solicitacoes/format.ts`, `email/logo.ts`). |

Por família, considerando só cor viva: cinza/neutro domina (`#f1f5f9`, `#a1a1aa`, `#fff`); o resto
é a paleta replicada pela página de documentação — dourado/âmbar, azul/turquesa, verde/teal,
vermelho. Roxo/índigo só aparece como `--chart-info` na doc.

**As 4 violações reais compartilham uma causa:** todas estão em `style={{…}}` ou em prop de
componente, e o lint `wt/no-cor-hardcoded` **só enxerga `className`**.

### `rgb()` / `rgba()` / `hsl()` / `oklch()` — 36 ocorrências em 28 arquivos

Todas `rgba`; zero `hsl`, zero `oklch`. Três grupos:

- **Fundo de overlay** de modal e drawer — `rgba(0,0,0,0.4…0.5)` em 7 arquivos.
- **Sombra do balão de tooltip** — `rgba(45,42,38,0.08)`, o **mesmo valor copiado em 4 arquivos**
  (`charts/custom-tooltip.tsx:31`, `shared/meta-progress-bar.tsx:84`,
  `financeiro/repasse-mensal.tsx:46`, `financeiro/horizonte-previsto.tsx:54`).
- **Cursor do Recharts** — `rgba(0,0,0,0.03…0.04)` em 6 arquivos; e um gradiente de heatmap
  calculado em `weddings/carteira-matrix-card.tsx:37-38`.

Maior concentração: `financeiro/calendario-liquidez.tsx` (7).

Nota: `color-mix(in srgb, var(--token) N%, transparent)` — usado em `globals.css` (2×) e
`sidebar.tsx` (1×) — **não é cor fora do sistema**: é token derivado com alfa.

### Classes de paleta crua do Tailwind

Já quantificado em 1.3. Maiores concentrações de `zinc`: `admin/design-system/page.tsx` (101),
`financeiro/faturamento-corp.tsx` (63), `weddings/lista-operacoes.tsx` (45),
`metas/cadastro-grade.tsx` (41), `admin/api-externa/documentacao-content.tsx` (29),
`admin/uploads/page.tsx` (29), `weddings/drilldown-drawer.tsx` (28),
`financeiro/revisar-envio-modal.tsx` (28), `performance/prejuizos-table.tsx` (28),
`financeiro/calendario-liquidez.tsx` (25).

Split por diretório: `src/components/**` concentra ~86% do `zinc`; `src/app/**` concentra o hex
literal, e quase todo ele está dentro da própria página de documentação.

## 1.6 O que segura o sistema no lugar (enforcement)

Quatro mecanismos. O que cada um **não** cobre importa tanto quanto o que cobre:

| Mecanismo | Onde | Detecta | NÃO detecta |
|---|---|---|---|
| `wt/no-cor-hardcoded` | `eslint.config.mjs:44-70` | Classe de cor crua do Tailwind em 6 famílias (`emerald\|amber\|red\|green\|blue\|yellow`) e hex arbitrário `-[#RRGGBB]`, ambos só depois de um de 9 prefixos (`bg text border ring fill stroke from to via`) | `zinc`, `slate`, `gray`, `neutral`, `stone` e 11 outras famílias; `white`/`black`; prefixos `shadow-`, `divide-`, `outline-`, `accent-`, `caret-`, `decoration-`; e **qualquer cor fora de `className`** (`style`, props). Desligado em `src/lib/email/**`. |
| `wt/no-tailwind-var-shorthand` | `eslint.config.mjs:10-31` | O atalho inválido `-[--token]` em literal e template string | A forma correta `[var(--token)]` (passa, como deve); a mesma sintaxe montada por concatenação dinâmica |
| `src/styles/tokens.test.ts` | sonda | Remoção/renomeação de **57 tokens-âncora**; existência dos 4 blocos `[data-theme]`; exposição de 10 utilitárias-chave no `@theme`; valor exato de `--text-primary`; não-reintrodução do `--primary` azul legado | **7 tokens ficam fora da lista de âncoras** e podem ser removidos sem a sonda reclamar: `--band`, `--band-soft`, `--warning-deep`, `--teorico`, `--teorico-soft`, `--tooltip-bg`, `--focus-ring` |
| `src/styles/cabecalho-pagina.test.ts` | sonda | Varre o fonte (sem DOM) e reprova `<h1>` com classe `zinc-*`, `<p>` de subtítulo com `zinc-400`/`text-text-secondary`/`text-text-muted`, e cor de cabeçalho via `style={{ color… }}` | Cabeçalho fora do par `<h1>`+`<p>` no topo da tela; qualquer outro elemento |

Existe ainda um hook do harness (`gate-stop`) que varre `console.log` e o shorthand `-[--token]`
em `.ts/.tsx` de `src/` a cada resposta do agente — enforcement de sessão, não de build.

O cabeçalho de página é, portanto, **convenção com sonda, não componente**: a classe canônica é
`text-xl font-semibold text-text-primary`, presente em 18 dos 26 arquivos com `<h1>`; as 8
restantes usam variantes (`text-base`, `text-lg`, `pr-40`, um caso `uppercase tracking`).

---

# 2. Primitivos e composições

## 2.0 Panorama

**Nenhuma biblioteca de componentes de terceiros.** Não há shadcn/ui (sem `components.json`), nem
Radix, nem Headless UI, nem `clsx`, nem `class-variance-authority`, nem `tailwind-merge`, nem
biblioteca de toast, nem de tabela, nem de máscara, nem de animação. Verificado por inspeção do
`package.json` e do `node_modules`. As únicas dependências de UI de terceiros são:

- **`lucide-react` 1.14.0** — ícones (SVG como componente React), usado em toda a UI;
- **`recharts` 3.8.1** — gráficos (seção 3);
- **`date-fns` 4.1.0** — aritmética de data.

Tudo o mais é próprio da casa. A composição de classes é **concatenação de string** — declarado
explicitamente em `src/components/ui/button.tsx:6-9` ("sem clsx/tailwind-merge, que não existem no
projeto"). Isso tem uma consequência de contrato: **não há resolução de conflito de classe**. Se
o call-site passa `className="px-2"` para um componente cuja variante já traz `px-4`, quem vence é
a ordem do CSS gerado, não a ordem do argumento. O idioma adotado para forçar sobreposição é o
`!` do Tailwind (ex.: `!whitespace-normal`, `!left-auto` em `GatilhoAjuda`).

Distribuição dos 165 componentes `.tsx`: `financeiro/` 32 · `shared/` 26 · `gestao-pessoas/` 16 ·
`metas/` 16 · `admin/` 15 · `weddings/` 14 · `performance/` 11 · `ui/` 8 · `layout/` 7 ·
`solicitacoes/` 7 · `executiva/` 6 · `charts/` 5 · `auth/` 1 · `onboarding/` 1. 136 dos 165 são
`'use client'`.

A separação `ui/` × `shared/` não é por "primitivo × composição" — é histórica: `ui/` é a leva
extraída na consolidação de v4.26 (8 arquivos, nenhum com estado de servidor), `shared/` é tudo
que foi extraído antes e depois (26 arquivos, incluindo drawers e filtros com lógica de rota).

---

## 2.1 `src/components/ui/` — os primitivos canônicos

### `Button` · `src/components/ui/button.tsx` · 14 call-sites

**O que resolve:** o único botão do sistema; centraliza os clusters de botão que existiam
espalhados. As variantes reproduzem **byte-a-byte** as classes que já existiam — a migração foi
refator, não redesenho.

- **Variantes (6):**
  - `solido` — CTA escuro de plataforma (`bg-action-primary text-action-primary-fg`,
    `rounded-lg`, `text-sm font-semibold`, `hover:opacity-90`). É o "Entrar".
  - `contorno` — secundário outline (`border-zinc-300 text-zinc-700 hover:bg-zinc-50`).
    Cancelar / Sair.
  - `ghost` — texto sem fundo (`text-xs text-zinc-400 hover:text-zinc-600`). Ver mais / Redefinir.
  - `icone` — botão-ícone **sem** borda (`rounded p-1.5`), para fechar drawer/modal e ações de
    linha.
  - `icone-borda` — botão-ícone **com** borda (`rounded-md border p-1.5`), para ações de tabela.
  - `livre` — sem classe de variante; passthrough total do `className`. É a válvula de escape para
    um caso fora dos clusters, e o resultado é a classe idêntica ao que se escreveria à mão.
- **Tons (2):** `neutro` | `perigo`. Aplicam-se **só** a `icone` e `icone-borda`. `perigo` troca o
  hover para `hover:bg-danger-bg hover:text-danger` (sem borda) ou usa `border-danger text-danger`
  (com borda).
- **Tamanhos (2):** `md` (default, `py-2.5`) | `sm` (`py-2`). Aplicam-se **só** a `solido` e
  `contorno`.
- **Estados:** `disabled` é uniforme em todas as variantes —
  `disabled:opacity-50 disabled:cursor-not-allowed`. Não há estado de carregamento embutido (quem
  precisa troca o texto e passa `disabled`, como faz o `ConfirmModal`).
- **Props em conceito:** estende todas as props nativas de `<button>`; `type` tem default
  `"button"` (evita submit acidental dentro de `<form>`); `className` é **apendado** à variante.
- **Acessibilidade:** toda variante carrega `foco-neutro` — a classe global que desliga o outline
  do browser em `:focus` e desenha um anel institucional cinza (`box-shadow: 0 0 0 3px
  var(--focus-ring)` + `border-color: var(--text-secondary)`) **só em `:focus-visible`**. O efeito
  deliberado: clicar com o mouse não deixa sombreado; navegar por teclado deixa
  (`src/app/globals.css:231-245`).
- **Casos de borda tratados:** `type="button"` por default; `livre` produz string vazia de base
  (sem espaço espúrio no `className`).

### `Input` / `Select` / `Textarea` · `src/components/ui/field.tsx` · 21 / 9 / 8 call-sites

**O que resolve:** os três campos de formulário, envolvendo as classes canônicas `CAMPO` e
`CAMPO_COMPACTO` de `src/lib/ui/campos.ts`. Existem porque a classe de input estava **duplicada
idêntica em 3 arquivos** e a de select **divergia** (`border-zinc-300` vs `border-zinc-200`) em
outros 2.

- **Variantes (2):** `padrao` — `w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm` ·
  `compacto` — sem `w-full`, `px-2 py-1.5`, `bg-white text-zinc-700`,
  `disabled:opacity-50`. O compacto é para uso inline dentro de célula de tabela.
- **Estados:** foco via `foco-neutro` (mesmo anel institucional do Button). `disabled` só está na
  variante compacta.
- **Props:** encaminham **todas** as props nativas do elemento correspondente. `className` é
  apendado, para extras (`pl-9` quando há ícone de busca, `resize-none`, `w-24`, `tabular-nums`).
- **Acessibilidade:** os componentes **não** geram `<label>` nem `id` — isso fica a cargo do
  call-site. Não há `aria-invalid`, mensagem de erro nem `aria-describedby` embutidos; onde há
  validação, o erro é renderizado pelo call-site (padrão visto nos filtros de período).

### `Badge` · `src/components/ui/badge.tsx` · 13 call-sites

**O que resolve:** etiqueta semântica de status. Forma canônica: `rounded-full` + borda + `px-2
py-0.5` + micro-texto `text-2xs font-medium whitespace-nowrap`.

- **Variantes (7):** `success` · `danger` · `warning` · `brand` · `gestao` · `neutro` (default) ·
  `count`.
  - As cinco primeiras usam o trio `border-X bg-X-bg text-X` do token correspondente; `brand` e
    `gestao` usam a forma `[var(--token)]` porque não têm utilitária completa.
  - `neutro` usa `border-zinc-200 bg-zinc-100 text-zinc-500` (cor crua, exceção `zinc`).
  - **`count` é outra forma inteira**, não uma variação de cor: círculo sólido `bg-danger`,
    `min-w-[18px]`, `rounded-full`, `text-3xs font-semibold text-white`. É o badge de notificação
    da sidebar.
- **Estados:** nenhum (é estático).
- **Acessibilidade:** nenhuma afordância própria — não tem `role`, não tem `aria-label`. O
  significado depende do texto interno. No uso `count` da sidebar isso importa: o número aparece
  sem rótulo acessível.
- **Nota de fronteira registrada no código:** `statusBadge()` / `acaoBadge()` em
  `src/lib/solicitacoes/format.ts` continuam existindo como **provedores de classe** para layouts
  que aplicam a classe direto; `<Badge>` é o primitivo go-forward. São dois caminhos vivos para a
  mesma aparência.

### `Card` · `src/components/ui/card.tsx` · 9 call-sites

**O que resolve:** o contêiner branco de conteúdo.

- **Variantes por prop:** `size` (`default` → `rounded-xl px-5 py-4` | `sm` → `rounded-lg px-3
  py-3.5`) e `featured` (booleano: troca `shadow-sm` por `border-2 border-[var(--brand)]`).
- **Cabeçalho opcional:** `title` renderiza `<h2 class="text-base font-semibold text-text-primary
  leading-snug">`; `subtitle` renderiza `<p class="mt-0.5 text-[13px] text-text-subtle">`. O bloco
  inteiro só aparece se um dos dois existir.
- **Casos de borda:** `bg-white` é fixo (cor crua, não token — ver seção 6).
- **Acessibilidade:** o título é `<h2>` fixo, não parametrizável — um card dentro de uma seção que
  já tem `<h2>` produz hierarquia de cabeçalho repetida.

### `Checkbox` · `src/components/ui/checkbox.tsx` · 4 call-sites

**O que resolve:** caixa de seleção estilizada **sem dependência nova** (não há Radix no projeto).

- **Técnica:** `<input type="checkbox" class="peer sr-only">` dentro de um `<label>`, com um
  `<span aria-hidden>` desenhando a caixa (`h-4 w-4 rounded-[4px] border border-zinc-300
  bg-white`). O ícone `Check` do lucide (12px, branco) alterna só `opacity`, nunca desmonta — o
  que evita salto de layout.
- **Estados:** `peer-checked` pinta o fundo com `--action-primary`; `peer-disabled:opacity-50`;
  `peer-focus-visible` desenha o anel institucional (`shadow-[0_0_0_3px_var(--focus-ring)]`).
- **Props:** `checked`, `onChange(boolean)`, `id`, `disabled`, `aria-label`.
- **Acessibilidade — a receita inteira está aqui:** o input real fica no DOM (`sr-only`, não
  `display:none`), então continua no tab-order, continua anunciado pelo leitor de tela e continua
  operável por barra de espaço. O anel de foco acompanha o input via `peer-focus-visible`, não via
  foco no `<span>`. O `aria-label` é a única forma de nomear (não há prop de label visível).
- **Caso de borda:** o `<label>` inteiro é clicável e troca o cursor conforme `disabled`.

### `Tooltip` · `src/components/ui/tooltip.tsx` · 1 call-site (só `GatilhoAjuda`)

**O que resolve:** balão de dica CSS-puro, sem dependência e sem JS.

- **Técnica:** wrapper `<span class="relative inline-flex group/tip">` com o gatilho e um
  `<span role="tooltip">` absoluto, `invisible` por default, revelado por
  `group-hover/tip:visible` **e** `group-focus-within/tip:visible`.
- **Variantes:** `posicao` — `baixo` (default, `top-5`) | `cima` (`bottom-5`).
- **Aparência:** `bg-[var(--tooltip-bg)]`, `text-2xs text-white`, `rounded`, `px-2 py-1`,
  `shadow-lg`, `whitespace-nowrap`, `z-20`, `pointer-events-none`.
- **Acessibilidade — decisão registrada:** abrir **também no foco** (`focus-within`) foi um achado
  ALTO de revisão. Antes era hover-only, e "quem navega por teclado nunca via a dica — em
  cabeçalho de coluna a dica costuma ser a única explicação de uma definição de métrica"
  (`tooltip.tsx:10-16`). O `focus-within` cobre qualquer gatilho focável dentro do wrapper; **o
  gatilho é quem precisa ser focável** — um `<span>` não entra no tab-order nem é nomeável, então
  metade do mecanismo não serve.
- **Caso de borda:** o balão nasce com `whitespace-nowrap`; texto longo vira uma linha invisível
  gigante que transborda em barra horizontal. Quem precisa de quebra tem de forçar
  `!whitespace-normal`.
- **Não confundir** com o `CustomTooltip` de Recharts (seção 3) — são dois componentes diferentes
  com o mesmo nome coloquial.

### `GatilhoAjuda` · `src/components/ui/gatilho-ajuda.tsx` · 13 call-sites

**O que resolve:** a afordância "?" que explica um rótulo ou cabeçalho. É o exemplo mais claro do
projeto de **primitivo criado para tirar uma decisão das mãos do call-site**.

Existe porque a receita foi copiada em 10 lugares — **7 delas em `<span>`, inacessíveis por
teclado** — e o `<span>` voltou **duas vezes** depois de a convenção já estar escrita na skill de
design system. Convenção em prosa não segurou; o primitivo + uma sonda de teste seguraram.

- **Forma:** `<button type="button">` circular de `h-3 w-3`, `rounded-full`, `border
  border-wt-border-strong`, `text-[8px] font-semibold text-text-subtle`, envolvido pelo
  `<Tooltip>`.
- **Props:** `rotulo` e `texto` (ambos entram no `aria-label` como `"{rotulo}: {texto}"`),
  `conteudo` (conteúdo rico opcional do balão, default = `texto`), `posicao`, `classNameBalao`,
  `ancoraDireita`, `pararPropagacao`, `className`.
- **Quatro casos de borda resolvidos por construção**, cada um já tendo custado um achado de
  revisão:
  1. É `<button type="button">`, nunca `<span>` — tab-order e nome acessível.
  2. `!whitespace-normal` no balão (com o `!`), senão o texto longo vira linha invisível
     transbordando.
  3. `ancoraDireita` aplica `!left-auto right-0` — perto da borda direita da tela ou da tabela, o
     `absolute left-0` abriria para fora.
  4. `pararPropagacao` aplica `stopPropagation` no clique — dentro de um `<th>` ordenável, clicar
     no "?" não pode reordenar a tabela.
- **Default do balão:** `z-30 w-64 !whitespace-normal font-normal normal-case tracking-normal
  leading-snug` — o `normal-case`/`tracking-normal` desfazem a herança de um cabeçalho em caixa
  alta.
- **`'use client'` é necessário** porque o botão pode receber `onClick`, e não dá para deduzir
  caso a caso se quem importa é Server ou Client Component.
- **Sonda:** `src/components/ui/gatilho-ajuda.test.ts` reprova qualquer `>?</span>` e qualquer
  `>?</button>` fora deste arquivo em `src/`.

### `Tabs` · `src/components/ui/tabs.tsx` · 2 call-sites

**O que resolve:** navegação por abas no idioma "pill como tab", unificando o padrão que era
montado à mão em duas telas.

- **Forma:** `<div role="tablist" aria-label>` com `flex flex-wrap gap-2`; cada aba é um
  `<button id="tab-{id}" role="tab" aria-selected>` usando `PILL` + (`PILL_PRIMARIA` |
  `PILL_NEUTRO`).
- **Props:** `items` (`{id, label, count?}`), `ativo`, `onChange`, `ariaLabel`, `className`,
  `corAtiva`.
- **`corAtiva` é opt-in:** quando dada, a pill ativa fica sólida nessa cor com texto branco (para
  cor de identidade de setor); sem ela, o ativo é o bege neutro de plataforma (`--action-soft`).
- **Estados:** controlado (`ativo` + `onChange`). Não guarda estado próprio.
- **Acessibilidade — limite explícito:** o componente entrega `role="tablist"`, `role="tab"`,
  `aria-selected` e `id="tab-{id}"`. **Os painéis ficam por conta do chamador** — se o call-site
  não renderizar `role="tabpanel" aria-labelledby={"tab-"+id}`, o ARIA fica pela metade. Também
  **não implementa navegação por setas** (←/→), que é o comportamento esperado de um tablist;
  hoje cada aba é um tab-stop independente.
- **Caso de borda tratado:** `whitespace-nowrap` por aba; `count` renderiza ao lado do rótulo se
  não for `null`.
- **Violação de cor conhecida:** o ramo `corAtiva` usa `color: '#fff'` literal (linha 36).

---

## 2.2 `src/components/shared/` — composições e utilitários de tela

### Sobreposições (modal e drawer)

Três componentes compartilham uma mecânica comum e uma pilha global.

**`ModalCentral` · `src/components/shared/modal-central.tsx` · 20 call-sites** — o mais usado de
todos os overlays.

- **O que resolve:** modal centrado sobre fundo escurecido, rolável, que fecha no X, no Esc e no
  clique fora.
- **Larguras (4):** `lg` (default) · `2xl` · `4xl` · `5xl` (este para tabela densa).
- **Props de forma:** `titulo`, `tituloAcessorio` (inline ao lado do título — ex.: badge de modo),
  `subtitulo`, `rodape` (rodapé **fixo**, fora do scroll, com `border-t`), `corpoFlex` (o corpo
  vira `flex-col` **sem** scroll próprio, para o chamador controlar scroll interno de tabela com
  sub-cabeçalho fixo), `alturaFixa` (`h-[85vh]` em vez de `max-h-[85vh]`, para o modal não "pular"
  de tamanho conforme o número de linhas).
- **Animação:** entrada por `setTimeout(…,10)` que liga `visible`; opacidade 0→1 e
  `scale(0.97)→scale(1)` em 200 ms. O fechamento inverte e chama `onClose` **depois** de 200 ms.
- **Acessibilidade implementada:** `role="dialog"`, `aria-modal="true"`, `aria-label={titulo}`;
  `tabIndex={-1}` no painel; **foco inicial** no primeiro elemento focável que **não** seja o
  botão Fechar (`'input, textarea, select, button:not([aria-label="Fechar"])'`), com fallback no
  painel; **restauração do foco anterior** no unmount; trava de scroll do `<body>`.
  **Não há focus trap** — Tab pode sair do modal para o conteúdo atrás.
- **Caso de borda de empilhamento:** renderiza em `createPortal(…, document.body)` porque o modal
  é invocado de dentro da sidebar, cujo contexto de empilhamento ficaria **abaixo** do conteúdo
  principal — sem o portal o `z-50` não vence e o modal abre atrás dos cards.
- **Escape:** usa a pilha global (abaixo), não um listener próprio.

**`ListDrawer` · `src/components/shared/list-drawer.tsx` · 12 call-sites** — painel lateral que
desliza da direita.

- **Forma:** `fixed inset-y-0 right-0`, `w-full md:w-[60vw] max-w-2xl`, `bg-white shadow-2xl`.
- **Animação:** `translateX(100%)→0` em 280 ms com `cubic-bezier(0.4,0,0.2,1)`.
- **Props:** `titulo`, `subtitulo`, `onClose`, `children`. Sem variantes de largura.
- **Acessibilidade:** igual ao modal (`role="dialog"`, `aria-modal`, `aria-label`, foco inicial no
  painel, restauração do foco, trava de scroll do body). Também **sem focus trap**.
- **Caso de borda:** o portal existe aqui por um motivo diferente do modal — o overlay e o painel
  são `position: fixed` e precisam se referenciar à **viewport**; renderizados fundo numa árvore
  com `grid 0fr/1fr + overflow-hidden + min-h-0` (o `TopSection`), o `fixed` se comportava mal e o
  painel "vazava" no rodapé.

**`ConfirmModal` · `src/components/shared/confirm-modal.tsx` · 9 call-sites** — confirmação
destrutiva no lugar de `window.confirm`.

- **Props:** `titulo`, `mensagem` (ReactNode), `confirmarLabel` (default "Confirmar"),
  `cancelarLabel` (default "Cancelar"), `perigo` (default **true**), `onConfirmar` (pode ser
  async), `onFechar`.
- **Estado:** guarda `processando` internamente; enquanto a promessa de `onConfirmar` não resolve,
  os dois botões ficam `disabled` e o de confirmar mostra "Processando…". Fecha sozinho ao
  concluir. O `finally` devolve `processando` a `false` mesmo em erro.
- **Cor:** o botão de confirmar usa `PILL_PERIGO` quando `perigo`, senão `PILL_NEUTRO`.

**`overlay-stack` · `src/lib/ui/overlay-stack.ts`** — a peça que faz as três acima conviverem.

- Pilha global de funções de fechar. `pushOverlay(close)` devolve um id; `popOverlay(id)` remove
  (idempotente). Um **único** listener de `keydown` no `document` é anexado na primeira inserção e
  removido quando a pilha esvazia.
- **O caso de borda que justifica a existência:** Esc fecha **apenas o overlay do topo**. Antes,
  cada overlay registrava seu próprio listener, e um modal aberto sobre um drawer fechava os dois
  com um Esc.

### Rolagem

**`ScrollAutoHide` · `src/components/shared/scroll-auto-hide.tsx` · 33 call-sites** — o segundo
componente mais usado de todo o sistema.

- **O que resolve:** toda barra de rolagem interna do produto. A nativa é escondida
  (`.scrollbar-none`, largura 0 → não reserva espaço, não desloca conteúdo) e um **thumb absoluto
  flutua em overlay**, aparecendo ao rolar ou ao passar o mouse e sumindo sozinho após ~1,2 s.
- **Variantes:** `eixo` — `y` (default) | `x` | `both` (tabela densa).
- **Props:** `className` vai no **viewport** (o elemento que rola; não incluir `overflow`/
  `scrollbar` nela); `contentClassName` vai no wrapper interno, para classes de layout dos filhos
  (`space-y-*`, `flex flex-col gap-*`) — a separação existe porque padding e altura precisam ficar
  no viewport para o cálculo do sticky não quebrar; `onScroll` é repassado ao viewport (usado, por
  exemplo, para acender a sombra de um cabeçalho sticky).
- **Implementação:** tudo **imperativo** — mutação de `style` por ref em efeitos e handlers, zero
  `useState`. Isso evita re-render a cada scroll e satisfaz o ruleset do React Compiler (sem
  `setState` em efeito, sem leitura de ref no render). A matemática vive num módulo puro e
  testado, `src/lib/ui/scrollbar-math.ts`.
- **Interação:** o thumb é **arrastável** (pointer capture); mouse-scroll, arraste e teclado
  funcionam. `motion-reduce` desliga o fade.
- **Casos de borda tratados:**
  - `THUMB_MIN = 28` px — o thumb nunca fica menor que isso, por mais longo que seja o conteúdo.
  - `THUMB_FOLGA = 8` px em **cada ponta** do trilho, e a mesma folga tem de ser passada às duas
    funções (geometria e arraste) para a proporção bater.
  - `THUMB_CRUZ = 12` px — quando **os dois eixos** rolam, cada trilho encurta no fim pela
    espessura do outro; sem isso os dois thumbs se encontram no canto inferior direito e formam um
    "L" colado.
  - `ResizeObserver` observa **viewport e conteúdo** (itens/subabas mudando de altura), não só a
    janela.
- **Débito registrado no próprio arquivo:** a sidebar mantém uma implementação embutida da mesma
  mecânica (migração incremental).

### Estados de tela

**`EmptyState` · `empty-state.tsx` · 9 call-sites** — ícone lucide (32 px, `strokeWidth 1.2`, em
`--text-subtle`) sobre uma mensagem em `--text-muted`, centrados com `py-10 px-4`. Props: `icon`
(componente `LucideIcon`) e `message`. Sem `role`, sem ação embutida.

**`ErroCarregamento` · `erro-carregamento.tsx` · 1 call-site** — estado de erro **discreto**, que
distingue "não foi possível carregar" (falha de RPC) do vazio legítimo. `role="status"`, ícone
`AlertCircle` 15 px em `--text-subtle`, texto `text-[13px]` em `--text-muted`. Mensagem default:
"Não foi possível carregar — recarregue a página." A decisão registrada é "sóbrio, sem alarme:
nada de telas vermelhas". **Com um único consumidor** (`performance/performance-content.tsx`), o
resto das telas trata erro com string inline própria.

**`FaixaMensagem` · `faixa-mensagem.tsx` · 23 call-sites** — a única faixa de feedback do sistema,
no lugar de uma biblioteca de toast. Variantes: `sucesso` (`border-success bg-success-bg
text-success`) | `erro` (`border-danger bg-danger-bg text-danger`). `role="alert"` para erro e
`role="status"` para sucesso. Botão de fechar opcional com `aria-label="Fechar mensagem"`. Fica no
topo da aba ou painel, `mb-4`.

**`skeletons.tsx` · 8 exports** — silhueta aproximada por tipo de página, em tom neutro (`zinc` +
`animate-pulse`), com **alturas e larguras fixas em px/rem para não haver CLS** na troca
skeleton→conteúdo. São **server components puros de markup, zero JS**, e **nunca incluem a
sidebar**: vivem só dentro do `<main>`, via `loading.tsx`.

| Export | O que desenha | Call-sites |
|---|---|---|
| `SkeletonPagina` | Envelope com `aria-hidden="true"`; `container` só para extras de layout, nunca `px`/`max-w` | 17 |
| `SkeletonHeader` | Título (`h-6 w-56`) + subtítulo (`h-4 w-80`) | 11 |
| `SkeletonTabela` | Card com título opcional + N linhas (`linhas` default 8) | 11 |
| `SkeletonFiltros` | Fileira de N pills (`n` default 5) | 7 |
| `SkeletonDashboard` | Header + filtros + KPIs + 2 gráficos; `header={false}` quando o header real vive no layout persistente do segmento, senão desenharia um título-fantasma duplicado | 3 |
| `SkeletonPaginaTabela` | Header + linha busca/ação + tabela | 2 |
| `SkeletonGrafico` | Card com título + área (`altura` default `h-64`) | 2 |
| `SkeletonKpis` | Grade `grid-cols-2 lg:grid-cols-4` de N cards | 1 |

**Cobertura real:** 19 `loading.tsx` existem; 18 deles usam esses templates (o de `/metas/tv` não
usa nenhum). A distribuição por rota está mapeada na seção 4.

**`EmConstrucao` · `em-construcao.tsx` · 2 call-sites** — aviso de seção em construção com ícone
`HardHat`, mais um botão "Ver preview". O gate de servidor é `?preview=1` na URL. **Caso de borda
tratado:** a URL persiste (refresh, bookmark, restauração de aba), então o preview ficaria visível
"para sempre"; `PreviewSessionGuard` exige que o preview tenha sido acionado **nesta sessão**
(token em `sessionStorage` gravado pelo botão) e, se não houver token, derruba o parâmetro e o
servidor re-renderiza o aviso. **Contaminação:** o componente lista três links de destino
cravados (`/metas`, `/performance/weddings`, `/financeiro/fluxo-caixa`).

### Cards e indicadores

**`KpiCard` · `kpi-card.tsx` · 1 call-site** (mais `KpiCardSkeleton`, no mesmo arquivo).

- **O que resolve:** o card de indicador com valor grande, fórmula em dica, e até três linhas de
  comparação.
- **Anatomia com alturas fixas — a decisão central:** rótulo em caixa `h-8` (acomoda 2 linhas sem
  vazar sobre o valor); valor em `min-h-16`; nota de período proporcional em `h-4` **sempre
  renderizada** mesmo vazia; bloco de comparações em `min-h-12`. O efeito é que cards lado a lado
  ficam alinhados independentemente de quantas comparações cada um tem.
- **Valor:** `font-extrabold tabular-nums leading-none whitespace-nowrap` com
  `fontSize: clamp(16px, 1.8vw, 26px)` — escala com a viewport sem quebrar.
- **Formatos (3):** `brl` (abreviado via `fmtMi`) · `pct` (1 casa) · `numero`. A dica mostra o
  valor **exato** (2 casas) enquanto o corpo mostra o abreviado.
- **Comparações:** `variacao_anterior`, `variacao_yoy` e, quando há `benchmarkAlvo`, uma linha "vs
  alvo" em pontos percentuais. O componente `Variacao` interno aplica uma regra de borda
  explícita: **variação com módulo < 0,5 é neutra** — sem seta, sem sinal, em `text-zinc-400`.
  Acima disso, `↑`/`↓` em `text-success`/`text-danger`.
- **Rótulo de período:** `fmtPeriodoLabel` mostra `dd/MM–dd/MM` quando o período é do ano corrente
  e `mmm/aa–mmm/aa` quando não é — a decisão de mostrar o ano depende de comparar com `anoAtual`.
- **`null` → `—`** em todos os formatos.
- **Acessibilidade:** a dica de fórmula é `group-hover` **apenas** — não abre no foco, e o rótulo
  é um `<p class="cursor-default">`, não focável. Isto é, **é o padrão que o `Tooltip`/
  `GatilhoAjuda` corrigiram, ainda presente aqui.**

**`KpiColuna` · `kpi-coluna.tsx` · 2 call-sites** — coluna de KPI do card principal (rótulo em
caixa alta, valor grande em `var(--brand)`, YoY abaixo). Formatos `brl` | `pct`. Prop `padded`
adiciona `pl-4`.

**`KpiDrawerTrigger` · `kpi-drawer-trigger.tsx` · 1 call-site** — envolve um card e o torna
clicável, com chevron no canto inferior direito que acende no hover. Usa a convenção
`.card-clicavel` (ver abaixo). Prop `drawer`: `detalhe` (drawer simples) | `rico` (drawer
parametrizado por setor).

**`CardTabela` · `card-tabela.tsx` · 11 call-sites** (+ `CARD_TABELA_TH`, 12) — o "chrome" comum
dos cards cuja essência é uma tabela.

- **Estrutura:** título único (`text-base font-semibold`, com `truncate`), mais **ou**
  `periodoLabel` (texto na cor da aba, só onde o filtro de período se aplica) **ou** `headerRight`
  (ReactNode, ex.: badge de contagem); corpo `flex-1 min-h-0`; rodapé com divisória e "Ver mais"
  quando `temMais && onVerMais`, **ou um espaçador de mesma altura** quando não há — o card não
  muda de altura por causa do rodapé.
- **`CARD_TABELA_TH`** é a classe de cabeçalho de coluna exportada junto: `py-2 px-3 text-2xs
  font-medium text-[var(--text-muted)] whitespace-nowrap` — **caixa normal, sem negrito**, e o
  alinhamento (`text-left`/`text-right`) fica com o call-site.
- **Contrato registrado no comentário:** o corpo da tabela deve usar `table-fixed` + `<colgroup>`.

**`ValorContabil` · `valor-contabil.tsx` · 9 call-sites** — formato contábil de moeda: `"R$"`
ancorado à **esquerda** da célula e o número à **direita**, em `tabular-nums`, via `flex
justify-between`. O `"R$"` é sempre `--text-subtle`; o `className` colore **só o número** (ex.:
resultado negativo em `--danger`). Delega a formatação a `numBRL2`.

**`MetaProgressBar` · `meta-progress-bar.tsx` · 2 call-sites** — barra de progresso com trilha
neutra, preenchimento colorido, **seta estática** na posição do "esperado até hoje" e um balão que
nasce da seta.

- **Props em conceito:** `pctMeta` (preenchimento; `null` → vazio; largura clampa em 100),
  `pctEsperado` (posição do tick, 0–100), `cor` (token, "nunca hex"), `altura` (px, default 10),
  `pctDecorrido`, `esperado`, `realizado`, `mostrarTooltip` (default true), `setaEscala`,
  `corSeta` (default `var(--border)`).
- **Caso de borda central — clamp ao viewport:** o balão mede a barra e a si mesmo em
  `useLayoutEffect` e desliza para dentro da tela perto das bordas, com a seta deslizando **dentro
  dele** para continuar apontando o tick. A lógica é pura e testada
  (`src/lib/metas/tooltip-clamp.ts`); `transform-origin` acompanha a seta para a animação
  "crescer da seta" funcionar em qualquer posição.
- **Fallback sem medida:** antes de medir (SSR, pré-hidratação, ou `mostrarTooltip=false`), cai
  num posicionamento CSS puro (`left: calc(tick% - 6.75rem)`).
- **Modo TV:** `mostrarTooltip={false}` remove o balão inteiro — não mede, não escuta `resize`.

**`AnelKpi` · `src/components/charts/anel-kpi.tsx` · 1 call-site** — círculo de contorno com valor
centrado e selo de rótulo abaixo. **Não é indicador de progresso** (não recebe %). SVG puro; o
texto é HTML sobreposto, não `<text>` do SVG, então fica selecionável e não duplica para leitor de
tela: o wrapper leva `role="img"` com `aria-label` combinando rótulo e valor, e o SVG é
`aria-hidden`. Espessura = 10% do raio; fonte do valor = `tamanho/7`.

### Filtros

**Quatro variantes do mesmo filtro de período** coexistem, cada uma com exatamente **1
call-site**:

| Componente | Forma | Estado | Consumidor |
|---|---|---|---|
| `PeriodoFilter` | pills + popover | **Contexto React** (`usePeriodoFilter`) | `performance/weddings-content.tsx` |
| `PeriodoFilterUrl` | `<select>` | URL (`?preset&from&to`) + `localStorage` | `app/executiva/` |
| `PeriodoPillsUrl` | pills | URL + `localStorage` | `performance/performance-content.tsx` |
| `PeriodoFilterPillsUrl` | pills + popover de intervalo | URL + `localStorage` | `app/financeiro/fluxo-caixa/` |

Os seis presets são os mesmos em todos (`este-ano` YTD, `este-mes`, `mes-passado`,
`ultimos-3-meses`, `ultimos-6-meses`, `personalizado`), definidos como tipo em
`src/lib/periodo.ts`. As três variantes de URL compartilham a **mesma chave de `localStorage`**
(`'wt-periodo-filter'`), então o preset escolhido numa tela é restaurado em outra. O default
diverge: `este-ano` numa, `mes-passado` nas outras duas.

**Casos de borda comuns às variantes de URL:** `router.push(…, { scroll: false })` dentro de
`startTransition` — sem isso o App Router rola ao topo em toda navegação, e trocar o período no
meio da página produzia um "pulo"; popover fecha em clique fora via listener de `mousedown`;
escrita no `localStorage` só quando há parâmetros na URL, e leitura só quando não há.

**`SetorFilter` · `setor-filter.tsx` · 2 call-sites** — `<select>` com quatro opções cravadas
(`todos`, `Lazer`→"Trips", `Weddings`, `Corporativo`). Sincroniza `?setor=` na URL, com
`aria-busy` e `opacity-60 pointer-events-none` durante a transição.

### Controles

**`InputMoeda` · `input-moeda.tsx` · 2 call-sites** — input controlado com máscara pt-BR em tempo
real. O estado interno são os **dígitos crus** interpretados como centavos e reformatados a cada
tecla (`122829,13` → `R$ 122.829,13`); colar funciona porque todo não-dígito cai. `inputMode="numeric"`
para o teclado mobile. Um `-` em qualquer posição torna o valor negativo. Guarda de precisão: 15
dígitos (`NUMERIC(15,2)`). **Não decide salvar nem comparar** — reporta o número parseado em
`onCommit` (Enter e blur) e `onCancel` (Escape); a célula chamadora mantém o estado de edição.
`permiteVazio` distingue "campo vazio → `null`" de "campo vazio → 0".

**`SliderHorizonte` · `slider-horizonte.tsx` · 2 call-sites** — `<input type="range">` com régua de
marcações abaixo (riscos finos + maiores com rótulo numérico).

- **Duas escolhas não estéticas, registradas no código:**
  1. O trilho é **neutro por default** (`--text-secondary`), não na cor da aba — "slider é
     controle de leitura, não realce de marca". Quem quiser a cor da aba passa `corTrilho`.
  2. `posTick(f)` compensa a **meia-largura do thumb** (~7 px): o centro do thumb nunca alcança as
     bordas do trilho, então um risco em `left: f%` puro fica progressivamente fora de fase com o
     valor, e a régua "mente" nos extremos. A fórmula é
     `calc(7px + (f*100)% - (f*14)px)`.
- **`espelhado`** vira o eixo (`dir="rtl"`): o zero fica à direita e arrastar para a esquerda
  aumenta o valor — usado no lado "passado" de uma janela temporal, para o gesto acompanhar o
  tempo.
- **Acessibilidade:** `aria-label` obrigatório, `aria-valuetext` opcional; a régua é `aria-hidden`
  porque o valor já é anunciado pelo input.
- **Nota:** a função `posTick` está exportada, mas a mesma fórmula aparece **duplicada
  localmente** em dois arquivos que precedem a extração (`app/admin/design-system/page.tsx` e
  `financeiro/posicao-projetado.tsx`) — não são imports do símbolo.

### Barra de seção

**`TopSection` · `top-section.tsx` · 7 call-sites** — barra horizontal recolhível com
"linha-cortina".

- **Mecânica:** a **barra nunca muda de altura**; o conteúdo sai por baixo dela, revelado de cima
  para baixo animando `grid-template-rows` de `0fr` para `1fr`. O conteúdo fica ancorado no topo
  do clip — o efeito é de cortina desenrolando, não de bloco empurrado. A linha separadora fica
  presa à borda inferior da janela de revelação (`absolute bottom-0`), então desce à frente do
  conteúdo ao abrir e sobe à frente ao fechar. Curva `cubic-bezier(.32,.72,0,1)`, 450 ms,
  desligada por `motion-reduce`.
- **Props:** `titulo`, `subtitulo`, `defaultAberto` (default **true**), `children`.
- **Estado:** só em memória, sem persistência — nasce aberto a cada carregamento.
- **Acessibilidade — o caso de borda que custou um achado ALTO:** o conteúdo **permanece montado**
  quando fechado (como no `<details>` que este componente substituiu). Com o grid em `0fr` ele
  ficaria invisível mas **ainda focável e lido por leitor de tela**; o atributo `inert` (React 19)
  o remove da árvore de acessibilidade sem desmontar. A barra é `<button aria-expanded
  aria-controls={id}>` com `useId`.
- **Segundo caso de borda:** `overflow-hidden` é o clip vertical da cortina, mas clipa **também**
  na horizontal, cortando a sombra dos cards encostados nas bordas (o hover de `.card-clicavel`
  sangra ~10 px). O idioma adotado: estender o clip 16 px para cada lado (`-mx-4`) e
  re-padronizar o conteúdo de volta (`px-4`) — o conteúdo segue alinhado à barra, mas o
  padding-box do clip acomoda a sombra.

### Cabeçalho institucional

**`AuthHeader` · `src/components/auth/auth-header.tsx` · 6 call-sites** — o cabeçalho das telas
públicas e de autenticação (login, solicitar acesso, trocar senha, sem acesso). É o único
componente relevante de fundação que vive fora de `ui/`, `shared/`, `charts/` e `layout/`, e a
própria página de documentação o lista entre os compartilhados.

- **Forma:** lockup duplo horizontal `[JANUS] | [WELCOME GROUP]` — logo Janus com 36 px de altura
  (147 px de largura), uma barra vertical fina de 1 px (`h-10 bg-zinc-300`, `aria-hidden`) e o
  logo Welcome Group levemente menor (32 px de altura, 165 px de largura), separados por `gap-4`.
  Sem wordmark textual.
- **Props:** só `className`, com default `'flex flex-col items-center'` — o call-site controla
  centragem e margem do **container**; o lockup horizontal é um filho interno, e foi assim que o
  contrato dos call-sites foi preservado quando o componente mudou de forma.
- **Cor:** os SVGs têm o cinza-neutro *baked* na arte — telas de plataforma não usam
  `var(--brand)`. O componente não aplica cor nenhuma.
- **Caso de borda:** `priority` no logo Janus (é conteúdo acima da dobra da tela de login);
  `Image fill` exige o wrapper `relative` com dimensão declarada.

### Constantes de classe compartilhadas

**`src/components/shared/botoes.ts`** — não é componente, é o vocabulário de pill do sistema, e é
o módulo com **mais call-sites de todos** (`PILL`: 34).

Duas famílias distintas, que não devem ser confundidas:

| Família | Constantes | Ativo | Call-sites |
|---|---|---|---|
| **Pill de ação** | `PILL` (base: `rounded-full border px-3 py-1 text-xs font-medium`, `foco-neutro`, `disabled:opacity-50`) · `PILL_NEUTRO` · `PILL_PERIGO` · `PILL_PRIMARIA` + `PILL_PRIMARIA_STYLE` · `PILL_GESTAO` + `PILL_GESTAO_STYLE` | Bege **neutro de plataforma** (`--action-soft`) ou âmbar de gestão (`--gestao-soft`) — **nunca** `var(--brand)` | 34 / 27 / 9 / 24 / 8 |
| **Pill de filtro/período** | `PILL_FILTRO` · `PILL_FILTRO_SM` (`px-2.5 py-0.5 text-2xs`) · `PILL_FILTRO_INATIVO` · `PILL_FILTRO_ATIVO_STYLE` | **Cor da aba** (`--brand-soft`/`--brand`/`--brand-deep`, herdada por `[data-theme]`) | 4 / 3 / 7 / 6 |

As variantes "primária" e "gestão" vêm em **par classe + objeto de `style`** porque a cor vai por
`var()` inline; a classe sozinha só traz `hover:brightness-95`.

**`src/lib/ui/campos.ts`** — `CAMPO` e `CAMPO_COMPACTO`, as classes por trás do `field.tsx`.
Existe porque `INPUT_CLASSES` idêntico estava duplicado em 3 arquivos e `SELECT_CLASSES` divergia
entre outros 2.

### Convenções globais em CSS (`src/app/globals.css:167-245`)

Quatro classes que funcionam como componentes sem componente:

- **`.card-clicavel`** — card que abre drawer ou navega. Em repouso é um card `shadow-sm`; no
  `:hover` **e no `:focus-visible`** a borda e a sombra assumem `var(--brand)`, com
  `color-mix(… 35%, transparent)`. Keyed em `var(--brand)`: cada aba herda sua cor via
  `[data-theme]`, sem duplicar regra por setor. A classe irmã `.card-clicavel-cta` faz a CTA "Ver
  mais" acompanhar.
- **`.card-clicavel-neutra`** — a mesma afordância em token neutro, para telas de plataforma (onde
  `var(--brand)` daria flash dourado). Usa `--action-soft-border`, não `--action-primary`, porque
  o charcoal "lia como borda preta crua no hover".
- **`.scrollbar-none`** — largura 0 nas três sintaxes (Firefox, IE legado, WebKit). Não reserva
  espaço no layout.
- **`.foco-neutro`** — o anel de foco institucional, já descrito em `Button`. A distinção
  `:focus` (sem anel) × `:focus-visible` (com anel) é o ponto: clicar com o mouse num botão, pill
  ou aba não deixa sombreado; inputs de texto ainda mostram o anel ao clique porque o browser os
  trata como `focus-visible`.

## 2.3 O que **não** existe como componente

Itens que a pergunta original prevê e que **não têm primitivo** neste sistema:

| Item | Situação real |
|---|---|
| **Tabela densa** | **Não existe componente.** É uma **receita** replicada em 12 arquivos + a página de doc, documentada in-code no maior arquivo do projeto (`src/components/financeiro/dre/tabela-dre.tsx`, 2.806 linhas, comentário nas linhas 194–212). A receita: `border-separate border-spacing-0` (obrigatório para `sticky` funcionar), fundo **opaco na célula** (em `border-separate` o fundo vive na célula; célula fixa translúcida deixa a coluna rolante passar por baixo), bordas por célula, largura como fonte única alimentando a largura declarada **e** o `right` cumulativo das colunas fixas, e uma escala de z-index de quatro níveis (corpo normal `auto` → corpo fixo `z-10` → `thead` sticky `z-20` → `th` fixa `z-30`). |
| **Paginação** | **Não existe componente.** Uma única implementação ad hoc, em `src/components/weddings/lista-operacoes.tsx:770-820`. |
| **Campo de busca** | Não existe componente. Padrão `<Input>` + `placeholder="Buscar…"` + ícone posicionado, repetido em ~10 telas. |
| **Toast / notificação transitória** | Não existe biblioteca nem componente. `FaixaMensagem` é o substituto, e não some sozinha. |
| **Cabeçalho de página** | Convenção + sonda, não componente (seção 1.6). |
| **`error.tsx` / `not-found.tsx`** | **Zero** em todo o `src/app` (seção 4). |
| **Focus trap** | Não implementado em nenhum overlay. |
| **Navegação por setas em `Tabs`** | Não implementada. |
| **Formulário com validação** | Não há abstração. Cada tela monta o seu; `zod` existe no projeto, mas para validar **contrato de RPC**, não formulário de UI. |

---

# 3. Gráficos

## 3.1 Biblioteca e adaptador

**Recharts 3.8.1** (`recharts` em `dependencies`). O adaptador da casa é o diretório
`src/components/charts/`, com 5 componentes + 2 módulos de dado/tema + um barrel:

| Arquivo | Papel |
|---|---|
| `index.ts` | Barrel — ponto de importação único (`@/components/charts`) |
| `chart-theme.ts` | Tema central: cores, margens, tamanhos de fonte, dasharrays, espessuras, raios de barra, larguras de barra |
| `chart-primitives.tsx` | **Factories** de eixo, grade e linha do zero |
| `custom-tooltip.tsx` | Balão de tooltip da plataforma |
| `chart-legend.tsx` | Legenda HTML (substitui a `<Legend>` nativa) |
| `fill-months.ts` | Preenchimento de meses faltantes numa série temporal |
| `cascata.tsx` | Waterfall — o único gráfico **completo** que é primitivo |
| `anel-kpi.tsx` | Anel de destaque (SVG puro, sem série de dados) |

**A decisão de arquitetura mais importante do adaptador:** os helpers de eixo e grade são
**funções que retornam elementos Recharts**, não componentes wrapper. O motivo está escrito em
`chart-primitives.tsx:10-21`: **o Recharts inspeciona a identidade dos filhos diretos** de um
chart (`XAxis`, `YAxis`, `CartesianGrid`, `ReferenceLine`). Um wrapper `<ChartGrid/>` seria um
componente desconhecido e o Recharts o ignoraria. Por isso a chamada é `{ChartGrid()}` e não
`<ChartGrid/>`. A legenda é a exceção: é um componente React normal, renderizado **fora** do
`ResponsiveContainer`.

## 3.2 O tema (`chart-theme.ts`)

- **`chartColors`** (estrutura): `axisTick` → `--chart-axis-tick` · `grid` → `--chart-grid` ·
  `zeroLine` → `--border-strong` (sólida e mais forte que a grade).
- **`chartSeries`** (status genérico): `success` `warning` `danger` `neutral` `info` → os cinco
  `--chart-*`.
- **`fluxoColors`** (semântica de cash-flow, **idêntica em toda a plataforma, não herda a cor da
  aba**): `entrada` → `--positive` · `saida` → `--negative` · `resultado` → `--text-primary` ·
  `resultadoNegativo` → `--danger`.
- **`FUTURE_OPACITY = 0.35`** — opacidade das séries de projeção/previsto em barras.
- **`chartMargins`** (3 formas): `default` `{8,16,0,0}` · `withRightLabel` `{8,80,0,0}` (quando há
  `ReferenceLine` com rótulo à direita) · `horizontal` `{0,64,0,0}` (barra horizontal com rótulo
  de valor à direita).
- **`tickFontSize`**: `x: 10`, `y: 11`.
- **`dashArrays`**: `grid: '3 4'` · `reference: '5 4'`.
- **`strokeWidths`**: `line: 2` · `lineDashed: 1.5` · `zeroLine: 1.5`.
- **`barSizes`**: `fluxo: 5` (séries finas lado a lado) · `column: 14` · `horizontal: 28`.
- **`barRadius`** — o item com a decisão menos óbvia do tema:
  - **`top: [2,2,0,0]` é o raio padrão de qualquer coluna vertical, para cima OU para baixo.** O
    Recharts passa `y` = pixel do valor e `height = base − valor` (assinado, **negativo** na barra
    que desce), então o `ySign` do `getRectanglePath` inverte e os índices `[0,1]` do array
    **sempre** grudam na ponta do valor (a livre). Ou seja, `top` arredonda a ponta livre nos dois
    sentidos — inclusive em saídas que descem e em gráficos com botão "inverter".
  - `bottom: [0,0,2,2]` arredonda a ponta **encostada no eixo**, que quase nunca é o que se quer.
    Mantido só por simetria.
  - `right: [0,4,4,0]` (barra horizontal) · `none: [0,0,0,0]` (segmento interno de stack).

**Convenção de traço, regra geral da plataforma:** **sólido = dado real/efetivo · tracejado =
referência (ano anterior) ou projeção (futuro)**. E `opacidade < 1` sinaliza "previsto".

## 3.3 As formas de gráfico existentes

Descritas pelo que a forma faz, não pelo domínio. **19 arquivos** renderizam gráfico fora do
diretório `charts/`.

### A. Colunas temporais com linha sobreposta (`ComposedChart`)
A forma mais frequente do produto. Duas ou quatro séries de coluna (entrada/saída, cada uma
podendo ter par efetivado/previsto em opacidade reduzida) mais uma `Line` de resultado por cima,
com ponto destacado onde o resultado é negativo.
**Contrato de entrada:** uma linha por mês (`yyyy-MM`) com um campo por série, mais um marcador de
"este mês é futuro". **Onde:** `weddings/fluxo-caixa-card.tsx` (altura 260),
`financeiro/fluxo-mensal-chart.tsx` (260), `financeiro/fluxo-acumulado-chart.tsx` (280).

### B. Colunas empilhadas por categoria (`BarChart` com `stackId`)
Composição de um total em fatias, ao longo do tempo. `LabelList` com `content` custom põe o total
no topo da pilha.
**Onde:** `performance/kpi-principal-drawer.tsx` (2 gráficos, altura 180),
`executiva/historico-12m-chart.tsx` (180), showcase.

### C. Linha temporal com trecho real e trecho projetado
Uma série cuja parte passada é sólida e a futura é tracejada, com `ReferenceLine` marcando "hoje".
**Caso de borda central:** é preciso um **ponto-junção** no mês corrente, presente nas duas
séries, senão a linha sólida e a tracejada aparecem desconectadas.
**Onde:** `weddings/drilldown-drawer.tsx` (200), `financeiro/runway-semanal.tsx` (220),
`performance/tendencia-margem-chart.tsx` (224), `shared/kpi-detail-drawer.tsx` (220).

### D. Linha comparativa ano a ano
Duas séries da mesma métrica em anos diferentes: a corrente sólida, a anterior tracejada.
**Onde:** `financeiro/repasse-mensal.tsx` (200).

### E. Barras horizontais de composição (`layout="vertical"`)
Categoria no eixo Y, valor no X, `LabelList position="right"` com o valor ou o percentual, uma cor
por categoria via `Cell`.
**Decisão registrada:** a ordem recebida é renderizada como está — o Recharts posiciona o índice 0
**no topo** em layout vertical.
**Onde:** `metas/comparativo-barras.tsx` (altura 100%, vem do pai),
`executiva/mix-setor-chart.tsx` (180), showcase.

### F. Cascata / waterfall (`cascata.tsx`, primitivo)
Duas âncoras e os degraus que levam de uma à outra. **É o único gráfico completo que é primitivo
compartilhado.**
**Contrato de entrada:** `{inicial: {rotulo, valor, nota?}, degraus: [{rotulo, delta, narrativa,
residual?}], final: {…}, fecha: boolean}` — valores em centavos; **nenhuma soma acontece no
componente**, o acumulado vem pronto de um módulo puro.
Quatro decisões explicadas no código:
1. **Horizontal**, porque são até 18 barras com rótulos longos; deitado, cada rótulo ocupa uma
   linha de texto legível e o eixo de valor fica contínuo.
2. **Barra de faixa** (`dataKey` apontando para `[início, fim]`) em vez do truque clássico da
   barra transparente empilhada embaixo — o truque **quebra com valores negativos**, porque o
   Recharts empilha negativos para o outro lado, e as âncoras desta figura cruzam o zero na vida
   real.
3. **Âncoras neutras** (`--text-secondary`) de propósito: não são um movimento, são o ponto de
   partida e de chegada; pintá-las de verde ou vermelho sugeriria que o resultado em si é bom ou
   ruim, que é leitura do usuário. Degraus seguem `fluxoColors` (melhora/piora); resíduo é neutro
   esmaecido, porque não é fato econômico.
4. **Sem arredondamento de ponta** (`radius={0}`): numa cascata a barra é um **segmento** entre
   dois pontos do eixo, e a ponta redonda sugeriria um fim de valor que não existe — o degrau
   seguinte começa exatamente onde este termina.
**Altura:** `alturaCascata(n) = max(260, n*26 + 48)`. **Largura do eixo de rótulos:**
`min(48 + maiorRotulo*6.4, 280)`.

### G. Small multiples numa grade
Oito mini-gráficos de linha de mesma forma, lado a lado.
**Duas decisões que só existem por serem grade:** `domain` **comum** aos oito (senão cada um
estica a própria série até preencher o card, e duas séries com amplitudes 28× diferentes desenham
a mesma inclinação) e `interval: 0` no eixo X (o default `preserveStartEnd` esconderia o ponto do
meio quando há três pontos). Eixo Y **invertido** porque a série é negativa por natureza.
**Onde:** `financeiro/dre/grade-proporcao.tsx`, altura constante 150.

### H. Colunas de comparação Previsto × Realizado
Duas categorias, `Cell` por categoria, `LabelList` com `content` custom.
**Onde:** `metas/comparativo-colunas.tsx` (260).

### I. Colunas com cor por sinal e domínio assimétrico
16 categorias (12 meses + separador + 2 anos), cor derivada do sinal do valor.
**Caso de borda:** a cor por barra é feita com `shape` + `<Rectangle>`, **não** com `<Cell>`,
porque `Cell` não aceita `radius` na tipagem do Recharts. O domínio Y é assimétrico de propósito,
com mais espaço para baixo "onde os déficits dominam".
**Onde:** `financeiro/horizonte-previsto.tsx` (260).

### J. Área de faixa entre duas curvas
Uma `Area` cujo `dataKey` é um par `[real, virtual]`, com duas linhas (sólida e tracejada) por
cima — o preenchimento entre elas é o valor teórico.
**Onde:** `weddings/fluxo-caixa-card.tsx`, terceiro gráfico (240).

### K. Área + linha acumulada com marcadores de referência
`Area` + `Line` do realizado acumulado, linha tracejada da meta pró-rata, `ReferenceLine` e
`ReferenceDot` de "hoje/esperado".
**Onde:** `metas/ritmo-chart.tsx` (100%, num wrapper `h-72`).

### L. Anel de destaque (SVG puro)
Ver `AnelKpi`, seção 2.2. Único radial em produção.

### M. Rosca / donut (`PieChart` + `Pie` com `innerRadius`)
**Existe só na página de showcase**, com dado fictício
(`app/admin/design-system/chart-showcase.tsx`). **Não é usado em produção.** O mesmo vale para
`RadialBarChart`, `ScatterChart` e `Treemap`: zero usos em `src/` fora do showcase.

## 3.4 Como cada forma trata paleta, tooltip, eixos, rótulos, legenda e formatação

| Aspecto | Padrão |
|---|---|
| **Paleta** | Sempre token, via `chart-theme` ou `var(--…)` direto. A paleta padrão do Recharts **não é usada em lugar nenhum**. Duas exceções documentadas: os cards de cash-flow de Weddings usam a identidade Welcome (`--chart-fluxo-entrada/saida`, turquesa/mostarda) em vez da semântica `--positive/--negative`; e `kpi-detail-drawer.tsx` usa dois hex literais (violação, seção 1.5). |
| **Tooltip** | `CustomTooltip` — fundo `--surface`, borda `0.5px solid var(--border)`, raio 8, `padding 12px 16px`, sombra `rgba(45,42,38,0.08)`, `minWidth 140`. Rótulo em `--text-muted` 13px; valor em `--text-primary` 14px `font-weight 500` `tabular-nums`. Props: `labelFormatter`, `formatter` (devolve `[valor, nome]`), `showColorDot` (bolinha 8×8 `rounded-2px` com a cor lida do payload). Retorna `null` quando inativo ou com payload vazio. |
| **Eixos** | Nunca `axisLine`, nunca `tickLine` — em nenhum dos sete factories. Ticks em `--chart-axis-tick`, 10px no X e 11px no Y. Largura default: 72 px (`ChartYAxisBRL`), 44 px (`ChartYAxisPct`), 80 px (`ChartYAxisCategoria`). |
| **Grade** | Horizontal tracejada `3 4`, sem verticais — `ChartGrid()`. `ChartGrid({eixo:'vertical'})` inverte, para barra horizontal, onde linhas horizontais só separariam categorias. **Exceção deliberada na cascata:** ali a grade volta a ser horizontal, porque cada categoria é um degrau e é a linha horizontal que liga o rótulo à barra dele ao longo de uma faixa larga; quem dá a régua de valor é a linha do zero. |
| **Linha do zero** | `ChartZeroLine()` (ancora em `y=0`) e `ChartZeroLineX()` (ancora em `x=0`). **A segunda existe porque a primeira, num `layout="vertical"`, desenha a linha no eixo errado em silêncio** — o Recharts aceita `y={0}` num eixo de categorias e o resultado é uma régua atravessando a primeira categoria. |
| **Rótulos de valor** | `LabelList`. Quando o rótulo precisa acompanhar a **cor** da barra, o idioma é **um `LabelList` por cor**, filtrando por `dataKey` (valor `null` faz o Recharts pular o rótulo) — não um só com `content` custom, que obrigaria a recalcular a posição, jogando fora o posicionamento nativo que já está certo (o rótulo cai do lado para onde a barra cresce, inclusive nas que crescem para a esquerda). |
| **Legenda** | `ChartLegend`, HTML fora do `ResponsiveContainer`. A `<Legend>` nativa do Recharts deve ser ocultada (`content={() => null}`). Três marcadores: `rect` (quadrado arredondado, para barras), `line` (segmento SVG 20×10, com `dashed` opcional) e `dot` (círculo r=4). `opacity < 1` sinaliza previsto. |
| **Formatação de número e moeda** | Sempre via `src/lib/fmt.ts`. Eixo monetário: `fmtAxisBRL` — `"R$ 1,8 Mi"` (1 casa), `"R$ 600 k"` (0 casas, arredondado), `"R$ 0"` exato no zero. Tooltip e totais: `fmtMi` — 2 casas em Mi, 1 casa em k. Operação individual: `fmtBRL2` (2 casas). Eixo percentual: `fmtAxisPct(v, casas=0)`. Eixo temporal: `fmtAxisMes` — `'yyyy-MM'` → `'jan/26'` (mês minúsculo, ano em 2 dígitos). |
| **Responsivo** | `ResponsiveContainer` em todos. Altura: **valor fixo em px na maioria** (140 a 280), `"100%"` em quatro casos onde a altura vem do wrapper pai, e calculada na cascata. |
| **Densidade** | `ChartXAxisMes` tem `interval` default 2 (mostra 1 tick a cada 3 meses); `ChartXAxisCategoria` usa `preserveStartEnd`. |

## 3.5 Casos de borda já resolvidos no código

**Valor negativo** — quatro tratamentos distintos:
- O domínio default de um eixo **numérico** no Recharts é `[0, 'auto']`: ele **ancora em zero e
  corta valores negativos**. Para barras que só crescem para a direita isso é o desejado; para uma
  cascata que cruza o zero na vida real é um gráfico silenciosamente errado — barras negativas
  invisíveis, e **nenhum gate vê**. Quem precisa dos dois lados passa `['dataMin','dataMax']` ou
  um par de números (`chart-primitives.tsx:228-247`).
- `ChartYAxisBRL` tem `abs` (default `true`) para mostrar o módulo quando saídas vão para baixo.
- `ChartYAxisPct({invertido: true})` vira o eixo **mantendo os rótulos com sinal** — serve à série
  que é sempre negativa por natureza (a proporção de uma despesa sobre a receita): com o eixo
  normal, uma despesa que passa a pesar mais desenha uma curva **descendo**, o oposto do que o
  olho lê. É **diferente de plotar o módulo**, onde o rótulo passaria a dizer `5,2%` para uma
  despesa e a mesma grandeza apareceria com dois sinais em telas vizinhas.
- `barRadius.top` funciona nos dois sentidos por causa da inversão do `ySign` (ver 3.2).

**Série vazia** — **não há componente compartilhado.** Cada card tem sua própria mensagem: "Sem
dados para o ano", "Sem lançamentos no período.", "Dados não disponíveis.", "Sem dados para o
período", "Sem dados", "Sem dados para a seleção." Um caso devolve `null` e o card inteiro
desaparece (`grade-proporcao.tsx:198`).

**Categoria ausente ≠ barra zero** — `comparativo-colunas.tsx:39-40` só empurra a categoria para o
array de dados se o valor não for `null`, "nunca renderizada como barra zero, que mentiria
visualmente". E `grade-proporcao.tsx:100-101`: ponto sem base válida não é plotado (o Recharts
corta a linha em `null`) e **nunca vira zero** — "zero diria 'não consumiu nada'".

**Recorte parcial / período proporcional** — quatro tratamentos: forward-fill do efetivo até o
último mês não-futuro com ponto-junção no mês atual (`drilldown-drawer.tsx:210-232`); rótulo com
asterisco `${ano}*` e a contagem de meses cobertos no tooltip (`grade-proporcao.tsx:107-112`);
opacidade reduzida (0,4/0,6) no mês corrente parcial (`historico-12m-chart.tsx`); e meses
"rolados" do ano seguinte pintados de cinza-neutro independentemente do sinal
(`horizonte-previsto.tsx:110-121`).

**Eixo temporal com buracos** — `fillMonths(rows, getMes, makeEmpty, range?)`: padrão da
plataforma é que gráfico temporal **sempre mostre todos os meses do intervalo**, mesmo os sem
dado; buracos viram zero/placeholder, não somem. Guarda de segurança de 720 iterações (60 anos)
contra intervalo absurdo. **1 call-site** (`weddings/drilldown-drawer.tsx`).

**Agrupamento de item irrelevante num resíduo** — **não existe em lógica real.** A cascata tem um
tipo `residual` (pintado de neutro esmaecido) mas o resíduo vem pronto do módulo puro; não há
agregação de cauda em nenhum dos 19 call-sites. O único `"Outros"` do repositório é dado fictício
no showcase.

**Ordenação** — decisão explícita em `comparativo-barras.tsx:15-17` (ordem recebida é renderizada
como está, índice 0 no topo); ordenação por mês/ano antes de montar os dados em
`horizonte-previsto.tsx`; busca por **chave** e não por posição em `grade-proporcao.tsx:200-202`.

**Arredondamento** — `passoRedondo(v)` em `src/lib/escala-grafico.ts`: devolve o menor passo
"redondo" ≥ `v`, escolhendo entre as mantissas `[1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]` — todas
produzem meio-passo legível, o que importa porque as réguas costumam ter poucos passos. `v ≤ 0`
devolve 1 em vez de estourar, porque um domínio degenerado (série constante) é caso real e
`Math.log10(0)` viraria `-Infinity` contaminando o eixo.

**Parte × total** — `financeiro/dre/cascata-card.tsx:45-52`: a identidade fecha **por
construção**; se um payload torto quebrar a premissa, o card **diz isso** num banner de aviso em
vez de desenhar um waterfall que não soma.

## 3.6 Armadilhas do Recharts registradas no código

Todas com evidência in-code. São o material mais difícil de redescobrir numa replicação.

1. **`ResponsiveContainer` com `min-height` some sem erro.** "O `ResponsiveContainer` é um filho
   com `height: 100%`; com `min-height` o filho mede 0 e o gráfico some sem erro nenhum." Altura
   explícita, nunca `minHeight` (`dre/cascata-card.tsx:54-58`, reiterado em
   `dre/grade-proporcao.tsx:46-49`).
2. **Domínio explícito desliga o algoritmo de ticks "bonitos".** Com `domain` fixo o Recharts
   divide o intervalo cru e produz marcas como `-471 k · 79 k · 629 k` — e, num gráfico simétrico,
   **sem o zero entre elas**, que era exatamente o ponto de ser simétrico. `ticks` explícitos
   andam junto com `domain` (`chart-primitives.tsx:238-243`, `escala-grafico.ts:6-9`,
   `grade-proporcao.tsx:150-154`).
3. **`ChartZeroLine()` num `layout="vertical"` desenha no eixo errado em silêncio**
   (`chart-primitives.tsx:75-83`).
4. **O domínio default de eixo numérico é `[0,'auto']` e corta negativos**
   (`chart-primitives.tsx:228-237`).
5. **`Cell` não aceita `radius` na tipagem**; `shape` + `<Rectangle>` é o caminho suportado
   (`horizonte-previsto.tsx:92-93`).
6. **O `ySign` inverte na barra negativa** — registrado de forma independente em dois arquivos
   (`horizonte-previsto.tsx:85-87` e `fluxo-mensal-chart.tsx:183-184`), sem um referenciar o
   outro: conhecimento duplicado, não compartilhado.
7. **`tooltipType='none'` numa `<Area>` não basta** nesta versão — "testado na tela". O comentário
   que acompanha: "Passou por tsc, lint, build e 744 testes — só apareceu ao passar o mouse sobre
   o gráfico de verdade" (`weddings/fluxo-caixa-card.tsx:352-353` e `:390-394`).
8. **`LabelList` padrão quebra o texto na largura da barra** — visto só na verificação visual
   (`metas/comparativo-colunas.tsx:67-69`).
9. **`ReferenceDot`/`ReferenceLine` com valor fora do domínio produz marcador solto** ("glitch do
   Recharts") — `metas/ritmo-chart.tsx:82-84`.
10. **`interval` default `preserveStartEnd` esconde o ponto do meio** quando há três pontos
    (`grade-proporcao.tsx:135-137`).

## 3.7 Adoção do adaptador (dado, não julgamento)

Dos 19 arquivos com gráfico, **6 não usam os primitivos de eixo/grade/legenda** e montam tudo com
Recharts cru, importando no máximo o `CustomTooltip` direto: `shared/kpi-detail-drawer.tsx`,
`financeiro/fluxo-mensal-chart.tsx`, `financeiro/fluxo-acumulado-chart.tsx`,
`executiva/mix-setor-chart.tsx`, `executiva/historico-12m-chart.tsx`,
`performance/tendencia-margem-chart.tsx`. Nenhum dos seis carrega comentário assumindo a
divergência. Os dois de `financeiro/` reimplementam tooltip e legenda à mão, enquanto o
equivalente conceitual em `weddings/fluxo-caixa-card.tsx` usa os primitivos por inteiro.

Nenhum consumidor importa `chart-primitives.tsx` diretamente — todos passam pelo barrel.
`isAnimationActive={false}` aparece em cerca de metade dos call-sites; a outra metade fica com a
animação padrão ligada.

---

# 4. Casca da aplicação

## 4.1 Estrutura de rotas

**34 `page.tsx` · 5 `layout.tsx` · 19 `loading.tsx` · 22 `route.ts` · 0 `error.tsx` · 0
`not-found.tsx`.**

**33 dos 34 `page.tsx` são Server Component.** O único com `'use client'` no topo é
`src/app/admin/uploads/page.tsx`. O padrão é: a página é servidor, busca os dados, e delega a
interatividade a um componente `…-content.tsx` cliente.

Os 5 layouts: raiz, `admin/`, `admin/uploads/`, `financeiro/`, `performance/`. Os dois últimos
existem para montar o `PeriodoFilterProvider` do segmento.

Rotas de página: `/`, `/executiva`, `/login`, `/trocar-senha`, `/sem-acesso`, `/solicitar-acesso`,
`/solicitacoes`, `/metas` (+ `/cadastro`, `/tv`, `/comparacao`), `/financeiro` (+ `/dre`,
`/dre/estrutura`, `/dre/estrutura-competencia`, `/fluxo-caixa`, `/fluxo-caixa/gerencial`,
`/acervo`, `/calculadora-rateio`, `/faturamento-corp`), `/performance` (+ `/trips`, `/weddings`,
`/corporativo`), `/gestao-pessoas/inventario`, `/gestao-pessoas/estante`, `/admin` (+ `/uploads`,
`/uploads/financeiro`, `/acessos`, `/solicitacoes`, `/solicitacoes/movimentacoes`, `/api-externa`,
`/api-externa/documentacao`, `/design-system`), `/auth/confirm`.

## 4.2 Estrutura de layout

`src/app/layout.tsx` (Server Component `async`) faz, nesta ordem:

1. `await getSessao()` — sessão e permissões resolvidas **no servidor, uma vez por request**
   (via `React.cache`).
2. Dispara **três promessas sem `await`**, que fluem para os componentes e são consumidas com
   `Suspense` + `use()`:
   - contagem de solicitações pendentes,
   - contagem de acessos pendentes (**gated no TypeScript antes da chamada**, porque a RPC
     *lançaria* para quem não tem a área — ela nega, não devolve zero),
   - flag de onboarding já visto.
   Antes, o `await` dessas contagens era um hop serial que atrasava o primeiro byte. Cada uma tem
   `.catch()` que transforma a falha em valor inofensivo (badge some, onboarding não aparece, o
   app segue).
3. Renderiza `<html lang="pt-BR">` com `<ThemeProvider/>` e, **se e só se** `sessao.logado &&
   !sessao.precisaTrocarSenha`, o `<AppShell>` com o `children` dentro. Caso contrário renderiza
   `children` **sem chrome nenhum** — é assim que login, solicitar-acesso e a troca obrigatória de
   senha ficam em tela cheia.
4. `<SpeedInsights/>` da Vercel no fim do `<body>`.

`AppShell` (`'use client'`) monta: sidebar desktop (largura animada `w-64` ↔ `w-0`, 200 ms),
botão de reabrir quando fechada, `MobileHeader`, e o `<main>`.

**O `<main>` é a fonte única do respiro:** `flex-1 overflow-auto px-8 py-8
[scrollbar-gutter:stable]`. O `scrollbar-gutter: stable` reserva a goteira da barra **sempre**,
para a largura do conteúdo não mudar quando a barra some ao recolher uma seção ou trocar de
página.

**Curto-circuito de rota sem chrome:** `/metas/tv` (modo TV, tela cheia) é tratado por comparação
direta de `pathname` dentro do `AppShell` — "o jeito mínimo e não-invasivo de não ter AppShell
nessa rota, sem tocar o proxy/auth nem a Sidebar".

## 4.3 Modelo de navegação — e onde exatamente a visibilidade é decidida

**Esta é a costura com o módulo de permissões, e ela é explícita.**

O modelo vive em `src/components/layout/nav-model.ts` — **dados e regras puras, sem render**. Foi
extraído de dentro da sidebar precisamente para poder ser varrido por teste: enquanto morava num
componente `'use client'` que importa `next/image` e `next/link`, nenhum teste do ambiente `node`
conseguia lê-lo. A varredura resultante é `nav-model.test.ts` (276 linhas).

### A forma do modelo

```
NavItem     = { href, label, Icon, area: Area | null, sempre?, areasAny?, emConstrucao? }
NavSubItem  = { href, label, icon, area: Area,        areasAny?, emConstrucao? }
NAV_ITEMS   : NavItem[]                    // 9 itens de 1º nível, na ordem da sidebar
NAV_GROUPS  : Record<string, NavSubItem[]> // chave = href do item-pai
```

`NAV_GROUPS` tem 4 chaves: `/performance` (4 subabas), `/financeiro` (6), `/metas` (2),
`/gestao-pessoas` (2). O comentário no código registra que **este é o único ponto que precisa
saber "isto é um grupo"** — todo o resto do render e do filtro é genérico.

### Onde a visibilidade é decidida

Em **três predicados puros**, todos em `nav-model.ts:116-151`:

```
subVisivel(sub, permissoes)   = sub.areasAny ? sub.areasAny.some(a => permissoes.includes(a))
                                             : permissoes.includes(sub.area)

itensVisiveis(permissoes)     = NAV_ITEMS.filter(item =>
                                  item.sempre                    ? true
                                : item.areasAny                  ? item.areasAny.some(…)
                                : NAV_GROUPS[item.href]          ? grupo.some(s => subVisivel(s, …))
                                : item.area !== null && permissoes.includes(item.area))

hrefAtivoDoGrupo(subs, path)  = subs.filter(s => path === s.href || path.startsWith(s.href + '/'))
                                    .sort((a,b) => b.href.length - a.href.length)[0]?.href ?? null
```

A precedência é, nesta ordem: **`sempre` > `areasAny` (OR) > grupo com alguma subaba visível >
`area` (igualdade exata)**. Um item com `area: null` e sem grupo **nunca aparece**.

O filtro é aplicado em dois lugares distintos:

- `sidebar.tsx:138` — `itensVisiveis(usuario.permissoes)` decide os itens de 1º nível;
- `nav-group.tsx:38` — `subs.filter(s => s.areasAny ? s.areasAny.some(pode) : pode(s.area))`
  decide as subabas, e **`if (visible.length === 0) return null`** faz o grupo inteiro
  desaparecer.

`pode` é uma closure criada em `sidebar.tsx:137`: `const pode = (area: Area) =>
usuario.permissoes.includes(area)`.

### O acoplamento atual, com precisão

Três fios ligam a navegação ao domínio de permissões:

1. **Acoplamento de tipo.** `nav-model.ts`, `nav-group.tsx` e `sidebar.tsx` importam
   `type { Area } from '@/lib/auth/areas'`. `Area` é uma **união fechada de 22 strings literais**
   (`'executiva' | 'performance' | 'performance/trips' | … | 'gestao-pessoas/estante/gestao'`),
   declarada como `const AREAS = [...] as const`. Cada `NavItem` e cada `NavSubItem` carrega um
   campo `area` desse tipo. **Não dá para declarar um item de navegação cuja área não exista no
   catálogo** — o `tsc` reprova.
2. **Acoplamento de valor com o banco.** O comentário em `areas.ts:1-3` é explícito: o catálogo é
   "espelho de `app.rbac_areas` no banco", e a paridade é garantida por teste de contrato
   (`rpc-contrato.test.ts`). O mesmo arquivo carrega `AREA_INFO`, um `Record<Area, {rotulo,
   grupo, ordem}>` que é **fallback** — o rótulo vivo vem do banco.
3. **Acoplamento de dado por request.** As permissões chegam ao componente como `string[]` dentro
   de `UsuarioSidebar`, montado em `src/app/layout.tsx:64-76` a partir de `getSessao()`. A
   sidebar nunca consulta permissão por conta própria; ela **recebe a lista pronta**.

A superfície é, portanto, pequena e bem delimitada: **um tipo importado, um array de strings
recebido por prop, e três funções puras**. A sidebar não conhece RBAC, não conhece o banco e não
faz I/O. O que ela conhece é o *nome* de cada área — e é esse nome que amarra o modelo de
navegação ao domínio do produto atual (ver seção 6).

### Um quarto fio, menor: os badges

`UsuarioSidebar.badgesPorHref` é um `Partial<Record<string, Promise<number|null>>>` chaveado pelo
`href` do item. Nasceu cravado só para `/solicitacoes` e foi generalizado para um mapa. Os valores
são **promessas**, resolvidas fora do caminho bloqueante e consumidas por `Suspense` + `use()`
dentro de um componente de módulo (`ContagemPendencias`) — nunca um componente definido no render.
Valor `null` ou `≤ 0` não renderiza nada.

## 4.4 Comportamento da sidebar

- **Colapso desktop:** o `AppShell` guarda `sidebarOpen` e anima a **largura do contêiner** (`w-64`
  ↔ `w-0`, `transition-[width] duration-200`). Quando fechada, um botão de 6×8 px encostado na
  borda esquerda (`rounded-r-md`, `aria-label="Abrir sidebar"`) reabre.
- **Mobile:** abaixo de `lg`, a sidebar some e aparece o `MobileHeader` (altura 12, botão de menu,
  wordmark "JANUS"). O menu abre um drawer `fixed inset-0 z-50` com overlay `bg-black/50`;
  clicar num item fecha o drawer (`onNav`).
- **Item ativo:** fundo `--brand-soft`, texto e ícone em `--brand`, `font-semibold`, e uma barra
  vertical de 4×24 px colada na borda esquerda (`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6
  rounded-r-full`) na cor `--brand`. Inativo: `text-zinc-500`, ícone `text-zinc-400`,
  `hover:bg-zinc-100`.
- **Agrupamento:** grupos nascem **recolhidos a cada carregamento** do site — estado só em
  memória (um único mapa `href → boolean`), sobrevive à navegação client-side mas volta a recolher
  num refresh. **Fechado, o grupo mostra apenas a subaba ativa**; aberto, mostra todas as
  visíveis. Subabas ficam indentadas com uma guia vertical (`ml-4 pl-3 border-l border-zinc-200`).
- **Ativo dentro de grupo:** pelo prefixo **mais específico** (maior `href` primeiro) — cobre o
  caso de uma sub-rota ser prefixo de outra (`/financeiro/fluxo-caixa` × `/…/gerencial`, `/metas`
  × `/metas/cadastro`) sem acender as duas juntas.
- **Truncagem:** rótulos de 1º e 2º nível usam `min-w-0 truncate` com `title`. O motivo
  registrado: o estado ativo troca o peso para `font-semibold`, que alarga o texto o bastante para
  estourar a largura — "bug de quem só olha o estado inativo".
- **Ícones:** todos do lucide, 16 px no 1º nível e 14 px (`strokeWidth 1.8`) no 2º. O ícone de
  "Gestão de Pessoas" é `IdCard` (crachá) e **não** `Users`, porque `Users` já é "Usuários e
  Acessos" e as variantes redondas são quase indistinguíveis a 16 px. Rota em construção ganha um
  `TriangleAlert` em `--warning` com `aria-label="Em construção"`.
- **Logo:** o wordmark Janus é aplicado por **máscara CSS** (`mask-image` do SVG +
  `backgroundColor: var(--brand)`) numa caixa fixa de 168×48 — o asset nunca é editado, a cor vive
  no código e herda o tema da aba. Como `mask-image` não expõe `onError`, uma **sonda** (`new
  window.Image()` num efeito, mesma URL, mesmo cache) detecta falha de carga e ativa um fallback
  textual "Janus".
- **Rolagem da nav:** implementação embutida da mesma mecânica do `ScrollAutoHide` (thumb
  flutuante arrastável, nativa escondida), compartilhando o módulo puro `scrollbar-math`. Um
  `ResizeObserver` observa viewport e conteúdo; um efeito re-mede quando expandir/recolher um
  grupo, navegar, ou mudar o número de itens visíveis.
- **Rodapé:** selo Welcome Group (46×46, `p-1`, `rounded-xl`, fundo branco, com borda), nome e
  e-mail do usuário (com `title` no e-mail), a role em `text-2xs`, e um botão de sair que é um
  `<form action="/auth/signout" method="post">` — **não** um link.

## 4.5 Cabeçalho de página

Não existe componente. Existem **duas coisas diferentes** com esse nome:

1. **O título da tela** — convenção `<h1 class="text-xl font-semibold text-text-primary">` seguida
   de um `<p class="text-text-subtle">`, presente em 26 arquivos, com a sonda descrita em 1.6. 18
   dos 26 usam a classe canônica exata.
2. **`TopSection`** (7 call-sites) — a barra de seção recolhível descrita em 2.2, que é um
   agrupador **dentro** da página, não o cabeçalho dela.

`MobileHeader` é o terceiro, e só existe abaixo de `lg`.

## 4.6 Páginas de erro, 404, carregamento e vazio

| Estado | Existe como primeira classe? |
|---|---|
| **Carregamento** | **Sim.** 19 `loading.tsx`, 18 deles montados sobre os 8 templates de `skeletons.tsx`. Único fora do padrão: `/metas/tv`. |
| **Vazio** | **Meio.** `EmptyState` existe e tem 9 consumidores, todos em telas de tabela (Weddings, Inventário, Estante). Os cards de **gráfico** não o usam — cada um tem sua própria string ("Sem dados para o período", "Sem dados", "Sem dados para a seleção."). |
| **Erro de carregamento dentro da tela** | **Quase não.** `ErroCarregamento` existe, é sóbrio e bem desenhado, e tem **1 consumidor**. |
| **Erro de rota (error boundary)** | **Não existe.** **Zero `error.tsx`** em todo o `src/app`, e zero `global-error.tsx`. Uma exceção não capturada num Server Component cai no tratamento padrão do Next.js. |
| **404** | **Não existe.** **Zero `not-found.tsx`**. A tela de 404 é a padrão do Next.js, sem o chrome do produto. |

Para uma replicação, este é um dos pontos mais relevantes: **a casca cobre bem o "carregando" e
mal o "quebrou"**.

## 4.7 Helpers de formatação

Todos em **`src/lib/fmt.ts`** (216 linhas), que é a casa canônica.

**Moeda e número** — quatro formatadores com propósitos separados, e a separação é intencional:

| Função | Saída | Quando |
|---|---|---|
| `fmtBRL(v)` | `R$ 1.235` (0 casas) | agregado grosseiro |
| `fmtBRL2(v)` | `R$ 344.444,44` (2 casas) | **contexto de operação individual** (lista de operações, drawer) |
| `numBRL2(v)` | `344.444,44` (sem símbolo) | formato contábil, onde o `R$` é um elemento separado |
| `fmtMi(v)` | `R$ 1,80 Mi` / `R$ 600,0 k` / cai em `fmtBRL` | agregado e tooltip |
| `fmtAxisBRL(v)` | `R$ 1,8 Mi` / `R$ 600 k` / `R$ 0` | **tick de eixo** — 1 casa em Mi, 0 em k, para o rótulo ficar curto |
| `fmtAxisPct(v, casas=0)` | `14%` / `-3,5%` | tick de eixo percentual |
| `fmtMeses(dias)` | `3,7 meses` | duração (30,44 dias/mês) |

**Arredondamento:** não há uma convenção única. Cada formatador fixa as suas casas via
`Intl.NumberFormat` com `minimumFractionDigits === maximumFractionDigits`. O único
`Math.round` está em `fmtAxisBRL` na faixa dos milhares. Valores monetários trafegam em **centavos
como inteiro** em partes do domínio (a cascata divide por 100 na entrada) e em reais em outras —
isso não é uniforme.

**Data** — dois regimes, e confundi-los é o erro que os comentários alertam:

- **Data pura `'yyyy-MM-dd'`** (sem fuso): `fmtDate` → `dd/mm/aaaa` · `fmtDateCompact` →
  `21 mai 2026` · `fmtDateLong` → `07 de novembro de 2026` · `fmtDateMid` → `17 de jun de 2026` ·
  `fmtAxisMes` → `jan/26`. Todos por **split de string**, sem construir `Date`.
- **`timestamptz` UTC vindo do banco**: `fmtDataSP`, `fmtDataHoraSP`, `fmtDataHoraLongoSP` — todos
  por `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'`, com os formatadores **cacheados
  em módulo**. A regra escrita: "exibir por split de string mostra a hora UTC e **pode errar o
  dia** perto da meia-noite".
- `fmtDataHora(iso)` detecta qual dos dois por regex (`/[zZ]$|[+-]\d{2}:?\d{2}$/`) e trata cada um
  do seu jeito.
- **`parseLocalDate(iso)`** existe porque `new Date('yyyy-MM-dd')` interpreta data-only como
  **UTC** (meia-noite UTC = 21 h do dia anterior em −03), deslocando o dia em comparações. Parseia
  por componentes.
- **`hojeSP()`** devolve `'YYYY-MM-DD'` em São Paulo via `Intl` com locale `en-CA` (que formata em
  ISO).
- **`diasDesde(data)`** compara como calendário puro (`Date.UTC` dos dois lados), nunca
  `new Date(iso)` direto.

**Duplicação conhecida e registrada:** o comentário de `hojeSP` diz que este é o "home canônico" e
que **há cópias locais espalhadas** (solicitações, actions do Fluxo, páginas) cuja consolidação é
dívida conhecida. Fora isso, `fmt.ts` é fonte única; a única reimplementação encontrada é
`fmtCurto` em `shared/kpi-detail-drawer.tsx:29-33`, uma abreviação `M`/`k` própria e diferente de
`fmtAxisBRL`.

**Outros helpers com cara de formatação, mas que carregam regra:** `rotuloStaleness(dias)` em
`fmt.ts:192-201` devolve texto + classe de cor + badge conforme a idade de um saldo (neutro até 3
dias, `--warning` de 4 a 7, `--danger` acima de 7) — e `null` significa "sem staleness nenhum",
decisão registrada como "nulo = nada". `mascaraMoeda(raw)` é a máscara de digitação ao vivo
(distinta da coerção de planilha, que vive em `@/lib/carga/coercao`). `margemColor(v, alvo,
atencao)` em `src/lib/config.ts` devolve a classe Tailwind da coloração condicional de margem.

---

# 5. Infraestrutura

## 5.1 Versões (resolvidas no `node_modules`, não só declaradas)

| Peça | Versão instalada |
|---|---|
| Next.js | **16.3.4** (pinado, sem `^`) |
| React / React DOM | **19.2.4** (pinados) |
| TypeScript | 5.9.3 |
| Tailwind CSS | 4.2.4 (sem arquivo de config) |
| Recharts | 3.8.1 |
| lucide-react | 1.14.0 |
| zod | 4.6.1 |
| date-fns | 4.1.0 |
| `@supabase/supabase-js` / `@supabase/ssr` | 2.116.0 / 0.10.3 |
| nodemailer | 10.x |
| `@vercel/speed-insights` | 2.x |
| ESLint / `eslint-config-next` | 9.39.4 / 16.3.4 |
| Vitest | 5.0.0 |
| Node local (`.nvmrc`) | **24** |
| `engines.node` declarado | **`>=20.9.0`** |

O descompasso entre `.nvmrc` (24) e `engines` (≥20.9) é **deliberado e documentado num campo
`"//engines"` do próprio `package.json`**: o piso vale para o **runtime de produção** (Next 16
exige ≥20.9; a Vercel escolhe o LTS dela). O Vitest 5 exige Node ≥22.12 para **rodar a suíte**, e
`engines` do npm é único para o pacote inteiro — subir o piso trocaria o runtime de produção para
resolver uma necessidade de ferramenta de teste.

Outras dependências de produção: `@e965/xlsx` (planilhas), `server-only`. De desenvolvimento: `pg`
e `pg-copy-streams` (scripts de banco), `tsx`, `dotenv`, `depcheck`, `knip`.

## 5.2 Arquivos de configuração — o que cada um decide

| Arquivo | Decide |
|---|---|
| `next.config.ts` | 5 cabeçalhos de segurança aplicados a `/:path*` (HSTS, `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy`, `X-DNS-Prefetch-Control`). **Sem CSP**, com comentário explicando que Recharts e scripts inline exigiriam nonce e refactor amplo. `serverActions.bodySizeLimit: '25mb'`. |
| `tsconfig.json` | `strict: true`, `target: ES2017`, `moduleResolution: bundler`, alias `@/*` → `./src/*`. Inclui `.next/types` **e** `.next/dev/types` — fonte de um problema conhecido: rodar `next dev` e `next build` na mesma árvore deixa tipos de dev que quebram o `tsc`. |
| `postcss.config.mjs` | Só `@tailwindcss/postcss`. |
| `eslint.config.mjs` | Compõe `eslint-config-next/core-web-vitals` + `/typescript` com o plugin próprio `wt` (3 regras). `globalIgnores` inclui `.worktrees/**` — sem isso o lint da raiz varreria o `.next` das worktrees. |
| `vercel.json` | **Só um cron**: `/api/monde/ingest` às `0 9 * * *`. Sem `regions`, sem `functions`, sem `headers` (esses vêm do `next.config.ts`). |
| `vitest.config.ts` | Ambiente `node`, alias `@`, inclui `src/**/*.test.ts` **e** `scripts/**/*.test.mjs`, `testTimeout: 15_000` (testes de contrato REST são lentos). |
| `vitest.setup.ts` | Só carrega `.env.local` via dotenv. Testes de contrato usam `describe.skipIf` e se auto-pulam sem credenciais — o gate fica verde offline. |
| `knip.json` | 4 ignores documentados (hooks chamados por config, script chamado por `execFileSync`, dois mantidos por decisão humana) + `ignoreDependencies` para `tailwindcss` e `@tailwindcss/postcss`, que entram via PostCSS e `@import` e são invisíveis ao grafo ESM. |
| `supabase/config.toml` | Só desenvolvimento local: API 54321, DB 54322, Postgres major 17, `enable_signup = false` (plataforma por convite), storage com limite de 50 MiB. |
| `.nvmrc` | `24`. **Não existe `.npmrc`.** |

### As três regras de lint próprias

1. **`wt/no-tailwind-var-shorthand`** — detecta `-[--token]` em `Literal` e `TemplateElement`.
   Não pega a forma correta `[var(--token)]` (deve passar) nem a sintaxe montada por concatenação
   dinâmica.
2. **`wt/no-cor-hardcoded`** — detalhada em 1.6.
3. **`wt/no-coercao-reimpl`** (`eslint-rules/no-coercao-reimpl.mjs`) — regra **AST, não regex**,
   com três sinais: `parseFloat(...)`; `.replace(<separador>)` **só quando na direção número**
   (alimenta `Number()`/`parseFloat()`, ou está dentro de função com retorno `: number`, subindo a
   árvore de pais); e função ou const cujo nome case
   `/^(to|para|parse).*(num|valor|money|reais|float|decimal)/i` excluindo `/brl|format/i`. **Não**
   pega `parseInt(x, 10)` (índice/contagem), unário `+` (datas), nem `Number()` por nome direto
   (inputs `type=number` legítimos). Isenta a implementação canônica `coercao.ts` e `**/*.test.ts`.

Overrides: `src/lib/email/**` é isento de `no-cor-hardcoded` **e** de `no-coercao-reimpl`.

## 5.3 Variáveis de ambiente

**21 documentadas em `.env.example`; 22 nomes lidos pelo código.** A diferença, verificada nos
dois sentidos, é **uma só: `HOME`** — variável de sistema lida por um script de incidente pontual
(`supabase/patches/RESTORE-incidente-varredura-rest.mjs`), não do app.

**Diferença real: zero.** Toda variável lida está documentada, e toda documentada é lida por
alguém. (O gap havia sido fechado numa auditoria anterior, cujo registro está no próprio
`.env.example`.)

| Grupo | Variáveis | Lidas em |
|---|---|---|
| Supabase — público | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase/{server,client}.ts`, `src/proxy.ts` |
| Supabase — privilegiado | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/admin.ts`, scripts |
| Supabase — conexão direta | `SUPABASE_DB_URL` | `scripts/db-gate/lib.mjs`, testes de contrato |
| E-mail | `EMAIL_MODO`, `EMAIL_TESTE_DESTINO`, `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | `src/lib/email/config.ts` |
| URL base | `APP_BASE_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | `src/lib/email/config.ts` |
| Cobrança | `ASAAS_API_KEY`, `ASAAS_BASE_URL` | `src/lib/asaas/client.ts` |
| Integração externa | `MONDE_API_URL`, `MONDE_API_KEY` | `src/lib/monde/client.ts` |
| Cron | `CRON_SECRET` | `src/app/api/monde/ingest/route.ts`, `src/app/api/cdi/ingest/route.ts` |
| Teste | `REQUIRE_CONTRACT` | testes de contrato |

O harness usa mais três (`WT_DESLIGAR_HOOKS`, `WT_PERMITIR_ADD_TUDO`, `WT_PERMITIR_CONFIG`), mas
elas vivem em `.claude/hooks/` e não no app.

## 5.4 Clientes de banco — quatro, com credenciais distintas

| Construtor | Arquivo | Credencial | Contexto |
|---|---|---|---|
| `getServerClient()` | `src/lib/supabase/server.ts` | anon key + **cookies de sessão** (`createServerClient` do `@supabase/ssr`) | Server Component e Server Action. O `setAll` engole erro, porque cookie é read-only num RSC. |
| `getBrowserClient()` | `src/lib/supabase/client.ts` | anon key, sessão pelo cookie compartilhado | Client Component. **Singleton lazy** (uma instância por aba). |
| `getAdminClient()` | `src/lib/supabase/admin.ts` | **`SUPABASE_SERVICE_ROLE_KEY`** | Scripts e Route Handlers privilegiados. Protegido por `import 'server-only'` na primeira linha — **falha o build** se alguém o importar num client component. ~17 consumidores em `src/`, 8 em `supabase/`. |
| `createServerClient` inline | `src/proxy.ts:56` | anon key + cookies | **Middleware global.** Único lugar que regrava o cookie de sessão a cada navegação; chama `getUser()` para validar o JWT no servidor de auth. Não é parametrizado por `Database`. |

Todos os três primeiros são tipados por `Database` de `src/types/database.ts`.

O middleware (`src/proxy.ts`) também define as isenções de autenticação própria: as rotas
`/api/monde/ingest` e `/api/cdi/ingest` (que se autenticam por `CRON_SECRET`) e todo o prefixo
`/api/externo/` (que se autentica por `x-api-key`).

## 5.5 Esteira de migration

Comandos: `npm run db:migrate -- --aditiva [--fora-de-ordem]` e `npm run db:migrate --
--destrutiva`; `npm run db:gate` roda só o gate. O CLI do Supabase **não** é global — sempre
`npx supabase …`.

Fluxo de `scripts/db-gate/migrate.mjs`:

1. Lista as migrations pendentes (`migration list --linked`) e **classifica o nível** por um
   tokenizer puro (`classificar.mjs`): `aditiva` / `warn` / `destrutiva`.
2. **Destrutiva sem TTY aborta antes até do gate** — em stdin não-TTY ou EOF, o wrapper para. O
   agente não consegue aplicar destrutiva, por construção.
3. Roda o gate (`gate.mjs`): backup do dia + teste de restauração comparando produção × restaurado,
   gravando um `gate-report.json`. **Gate vermelho aborta sem tocar produção.**
4. Gate verde + aditiva → `db push` autônomo. Gate verde + destrutiva → prompt interativo exigindo
   confirmação digitada, e só então `db push`.

O gate é **rede de recuperação, não autorização**.

**Estado no commit de referência:** 256 arquivos em `supabase/migrations/`, do `0001` ao
**`0272_estante_rpcs.sql`** (as duas últimas, `0271` e `0272`, são da v5.11.0). 154 arquivos em
`docs/adr/`, o maior sendo **`0174-estante-welcome-razao-de-emprestimos.md`**.

**Tipos do banco:** `src/types/database.ts` é **gerado**, nunca escrito à mão, por
`npx supabase gen types typescript --linked > src/types/database.ts`. **Não há script npm para
isso** — é passo manual do ritual de fechamento de versão.

## 5.6 Deploy

- Plataforma **Vercel**, deploy automático no merge para `main`. Não há staging: **produção é
  direta**.
- `vercel.json` declara **apenas** o cron `/api/monde/ingest` às 09:00. Sem regiões, sem
  configuração de funções.
- Duas rotas de ingestão autenticam por `Authorization: Bearer $CRON_SECRET` no próprio handler,
  com fallback para sessão administrativa.
- **Produção × preview: o código não distingue.** Busca por `VERCEL_ENV`, `process.env.VERCEL` e
  `NODE_ENV` em `src/` → **zero resultados**. A única distinção de ambiente é por **presença ou
  valor de variável de domínio**: `ASAAS_BASE_URL` ausente significa sandbox; `EMAIL_MODO !==
  'real'` significa modo teste (fail-closed). `VERCEL_PROJECT_PRODUCTION_URL` é usada só como
  fallback de URL em e-mail, não como flag de ambiente.

## 5.7 Scripts de `package.json`

| Script | O que faz |
|---|---|
| `dev` / `build` / `start` | `next dev` / `next build` / `next start` |
| `lint` | `eslint` (usa `eslint.config.mjs`) |
| `test` / `test:watch` | `vitest run` / `vitest` |
| `seed` | `tsx supabase/seed/seed.ts` — trunca, parseia `.xlsx`, insere em lote no schema cru, carrega metas, roda o transform para analytics, carrega lançamentos por CSV e atualiza as materialized views. Exige `.env.local` com a service_role. |
| `db:migrate` | `scripts/db-gate/migrate.mjs` (5.5) |
| `db:gate` | `scripts/db-gate/gate.mjs` — só o gate, sem aplicar |

**`npx tsc --noEmit` não é script npm** — não existe entrada `typecheck`.

---

# 6. Contaminação de domínio

Critério aplicado: **um componente está limpo se consegue renderizar com dado fictício sem
importar nada do domínio.** A verificação foi feita por varredura de imports (`grep` por
`from '@/…'` em `ui/`, `shared/`, `charts/` e `layout/`, excluindo imports entre esses mesmos
diretórios e `@/lib/fmt` e `@/lib/ui`), mais varredura de rótulos e entidades de negócio no texto
dos mesmos arquivos.

## 6.1 Contaminação por IMPORT (verificada, não julgada)

Resultado completo da varredura — **18 imports de domínio** em 14 arquivos:

| Arquivo | Import | O que a contaminação é |
|---|---|---|
| `layout/nav-model.ts:19` | `type Area` de `@/lib/auth/areas` | **A costura principal.** Cada item de navegação carrega uma área do catálogo fechado de 22 permissões do produto. |
| `layout/nav-group.tsx:6` | `type Area` | Idem — o predicado `pode: (area: Area) => boolean`. |
| `layout/sidebar.tsx:8` | `type Area` | Idem. |
| `layout/nav-model.test.ts:7` | `AREAS`, `areasDaRota`, `type Area` | A sonda cruza o modelo de navegação com o catálogo real. |
| `layout/version-history.tsx:5,9` | `APP_VERSION` de `@/lib/version`; `CHANGELOG_DIRETORIA` de `@/data/changelog-diretoria` | O modal de histórico lê o changelog **do produto**, com três tipos de entrada (`novidade`/`correcao`/`melhoria`) e agrupamento por major. |
| `layout/period-filter-provider.tsx:4` | `resolverPeriodoCompleto`, `PresetPeriodo`, `PeriodoCompleto` de `@/lib/periodo` | O contexto de período depende do vocabulário de período do produto. |
| `shared/periodo-filter.tsx:6`, `periodo-filter-url.tsx:5`, `periodo-filter-pills-url.tsx:6`, `periodo-pills-url.tsx:5` | `PresetPeriodo` | Os quatro filtros conhecem os seis presets. |
| `shared/kpi-card.tsx:1,3` | `KpiMetrica`, `PeriodoRef` de `@/types/api`; `margemColor` de `@/lib/config` | **Contaminação forte.** O card recebe um objeto do contrato de API do produto (`{valor, variacao_anterior, variacao_yoy, is_pp}`) e colore o valor com a régua de **margem** do negócio. |
| `shared/kpi-coluna.tsx:2` | `KpiMetrica` | Idem, mais leve. |
| `shared/kpi-drawer-trigger.tsx:6` | `KpiPrincipalDrawer` de `@/components/performance/kpi-principal-drawer-lazy` | **Contaminação forte e invertida:** um componente "compartilhado" importa um componente de **domínio** (`performance/`). Também tipa `metrica: 'faturamento' \| 'receita'` e recebe `setor: string`. |
| `shared/meta-progress-bar.tsx:5` | `clampTooltip` de `@/lib/metas/tooltip-clamp` | A lógica pura de clamp mora no módulo de **Metas**, embora seja geometria genérica. |
| `charts/cascata.tsx:9,10` | `type Cascata` de `@/lib/dre/cascata`; `passoRedondo` de `@/lib/escala-grafico` | **Contaminação forte.** O único gráfico completo do adaptador tem o **tipo de entrada definido pelo módulo da DRE**. (O `passoRedondo` é genérico e limpo.) |

**Limpos por import — nenhuma dependência de domínio:** todos os 8 de `src/components/ui/`
(`badge`, `button`, `card`, `checkbox`, `field`, `gatilho-ajuda`, `tabs`, `tooltip`); em
`shared/`: `botoes.ts`, `card-tabela`, `confirm-modal`, `empty-state`, `erro-carregamento`,
`faixa-mensagem`, `input-moeda`, `list-drawer`, `modal-central`, `preview-button`,
`preview-session-guard`, `scroll-auto-hide`, `skeletons`, `slider-horizonte`, `top-section`,
`valor-contabil`; em `charts/`: `chart-theme`, `chart-primitives`, `chart-legend`,
`custom-tooltip`, `fill-months`, `anel-kpi`, `index`; em `layout/`: `app-shell`, `mobile-header`,
`theme-provider`.

## 6.2 Contaminação por RÓTULO, ROTA ou VOCABULÁRIO

Casos em que não há import, mas há nome do produto atual cravado no componente:

| Arquivo | Contaminação |
|---|---|
| `layout/nav-model.ts` | **O modelo inteiro.** 9 rótulos ("Executiva", "Performance", "Metas", "Financeiro", "Gestão de Pessoas", "Solicitações", "Upload de Arquivos", "Usuários e Acessos", "Design System"), 14 subabas, 23 rotas e 22 nomes de área — todos do produto atual. É **dado de configuração**, não lógica: os três predicados de visibilidade são genéricos e sobreviveriam a qualquer troca de conteúdo. |
| `layout/theme-provider.tsx:12-17` | Três prefixos de rota cravados (`/performance/weddings`, `/performance/trips`, `/performance/corporativo`) mapeando para três temas com nome de unidade de negócio. |
| `layout/app-shell.tsx:18` | `ROTA_SEM_CHROME = '/metas/tv'`. |
| `layout/mobile-header.tsx:22` | Wordmark `"JANUS"` em texto. |
| `layout/sidebar.tsx:55,336` | Caminhos de asset: `/logos/logo-janus.svg` e `/logos/welcome-group-vert.svg`; o fallback textual é `"Janus"`. |
| `shared/setor-filter.tsx:6-11` | Lista cravada de quatro setores, com o mapeamento `'Lazer'` → rótulo **"Trips"** (o valor interno difere do rótulo exibido). |
| `shared/em-construcao.tsx:32-52` | Três links de destino cravados (`/metas`, `/performance/weddings`, `/financeiro/fluxo-caixa`). |
| `shared/kpi-detail-drawer.tsx:82,88-90,113` | Faz `fetch` de uma rota de API do produto (`/api/dashboard/kpi-historico?metrica=…&setor=…`) e capitaliza o nome do setor para o subtítulo "Setor: X · Últimos 24 meses". |
| `shared/valor-contabil.tsx:13` | `"R$"` literal — o componente é monomoeda por construção. |
| `shared/input-moeda.tsx` | `"R$"` literal e guarda de 15 dígitos alinhada a `NUMERIC(15,2)`. |
| `charts/chart-primitives.tsx` | `ChartYAxisBRL` e `ChartXAxisBRL` são **monomoeda no nome e no formatador**. |
| `charts/chart-theme.ts:35,41,121` | Comentários citam Weddings, Trips e "mix por setor/subsetor", mas os **valores** são todos token. |
| `styles/tokens.css` | 5 tokens `--subsetor-*` e 3+3 tokens `--setor-*`/`--marca-*` são **nomes de unidade de negócio** virados variável CSS. |

## 6.3 Síntese: o que precisa mudar numa replicação

**Nível 1 — trocar dado, código intocado.** `nav-model.ts` (listas e rótulos), `theme-provider.tsx`
(mapa rota→tema), `setor-filter.tsx`, `em-construcao.tsx`, os assets de logo, o wordmark, e os
tokens `--setor-*`/`--subsetor-*`/`--marca-*`.

**Nível 2 — parametrizar um tipo.** `Area` precisa virar um parâmetro genérico (ou `string`) para
`nav-model`, `nav-group` e `sidebar` deixarem de depender do catálogo. Os três predicados de
visibilidade já são genéricos. `PresetPeriodo` idem, para os quatro filtros e o provider.

**Nível 3 — redesenhar a interface do componente.** `KpiCard` e `KpiColuna` (dependem do formato
`KpiMetrica` e da régua `margemColor`), `KpiDrawerTrigger` (importa componente de domínio e tipa a
métrica como união literal), `KpiDetailDrawer` (faz `fetch` de rota do produto), `GraficoCascata`
(tipo de entrada vem da DRE), `VersionHistory` (lê o changelog do produto), e a monomoeda
embutida em `ValorContabil`, `InputMoeda`, `ChartYAxisBRL`, `ChartXAxisBRL`, `fmtBRL*`, `fmtMi`,
`fmtAxisBRL`.

**Limpo e reutilizável como está:** os 8 primitivos de `ui/`, as pills de `botoes.ts`, os campos
de `campos.ts`, `ScrollAutoHide` + `scrollbar-math`, `overlay-stack`, `ModalCentral`,
`ListDrawer`, `ConfirmModal`, `CardTabela`, `FaixaMensagem`, `EmptyState`, `ErroCarregamento`,
`skeletons.tsx`, `TopSection`, `SliderHorizonte`, `AnelKpi`, `ChartGrid`, `ChartZeroLine(X)`,
`ChartXAxisCategoria`, `ChartYAxisCategoria`, `ChartYAxisPct`, `ChartLegend`, `CustomTooltip`,
`fillMonths`, `chart-theme` (os valores), `passoRedondo`, e as quatro classes globais de
`globals.css`.

---

# 7. Divergências encontradas

| Fonte | O que a documentação diz | O que o código faz | Evidência |
|---|---|---|---|
| **`docs/design-system.md`** | — | **O arquivo não existe.** Foi aposentado em favor da página viva `/admin/design-system`; a skill `ui-design-system` registra a migração. Não há afirmação a conferir. | Busca em `docs/**/*design*system*` retorna só `docs/adr/0095-padrao-graficos-design-system.md` |
| **`CLAUDE.md`, seção "Stack"** | "Next.js 16 · React 19 · TypeScript estrito · Tailwind 4 · **shadcn/ui** · Recharts · Supabase · Vercel" | **Não há shadcn/ui.** Sem `components.json`, sem Radix, sem `clsx`, sem `class-variance-authority`, sem `tailwind-merge`. As únicas dependências de UI de terceiros são `lucide-react` e `recharts`. O próprio `button.tsx:6-9` diz "sem clsx/tailwind-merge, que não existem no projeto". | `package.json`; ausência de `components.json`; `src/components/ui/button.tsx:6-9` |
| **ADR-0040 (tokens CSS semânticos), "Camada 3"** | `[data-theme="corporativo"] → --brand: #75777B (cinza)` | `--brand: #0D5257` (Pantone 7476 C, azul-teal) | `docs/adr/0040-tokens-css-semanticos.md:36-38` × `src/styles/tokens.css:161-165`. O ADR-0058 documenta a mudança (partindo de `#4B4F54`, nem sequer do valor que o 0040 registrou), mas o **0040 segue com status "Aceito", sem nota de superseded**. |
| **ADR-0090 (tokens de gráfico), "Exceções"** | Cinco cores "mantidas como hardcoded por serem identitárias de domínio": `#0091B3`, `#D9A23F`, `#2D2A26`, `#378ADD`, `#0F6E56`. E: "Cores de setor identitário ficam como pendência futura" | **Todas as cinco são tokens hoje**: `--chart-fluxo-entrada`, `--chart-fluxo-saida`, `--text-primary`, `--setor-lazer`, `--setor-corporativo` | `docs/adr/0090-tokens-grafico.md:22-33` × `src/styles/tokens.css:131-137`. Superado pelo ADR-0103, mas o **0090 segue "Aceito"**. Quem ler só o 0090 conclui algo hoje falso. |
| **Página `/admin/design-system`** — valores de token | 30+ hex de token (`--text-primary`, brand, setor, subsetor, plataforma, dessaturada, gráfico) | **Confere** — todos batem com `tokens.css`, inclusive Corporativo `#0D5257`, que a página acerta onde o ADR-0040 erra | `src/app/admin/design-system/page.tsx:44-84,88-98,106-112,429-447` |
| **Página `/admin/design-system`** — cobertura | A página tem 12 seções; a de nº 10, "Componentes Compartilhados", cataloga **20 itens** com nome, caminho e descrição | **Sete componentes vivos não aparecem em nenhuma das 12 seções** (contagem de ocorrência do nome no arquivo inteiro = 0): `ScrollAutoHide` (33 call-sites — o 2º componente mais usado do sistema e o primitivo obrigatório de qualquer rolável interno), `skeletons.tsx`/`loading.tsx` (padrão obrigatório de toda rota pesada), `EmptyState` (9), `ErroCarregamento`, `ConfirmModal` (9), `InputMoeda`, `MetaProgressBar`, `AnelKpi` e `KpiCard`. Quem só consulta a página viva não descobre nenhum deles. | `src/app/admin/design-system/page.tsx:484-514` (a lista dos 20) × `grep -c` dos nomes ausentes no mesmo arquivo |
| **Página `/admin/design-system`** — método | — | A página **duplica manualmente 49 hex** de `tokens.css` para desenhar as amostras. Não lê os tokens; replica os valores. Um token que mude sem atualização da página faz a documentação mentir, sem nenhum gate detectar. | `src/app/admin/design-system/page.tsx` (49 hex literais) |
| **Skill `ui-design-system`** — exceções do lint | Duas exceções: `zinc-*` permitido; `src/lib/email/**` isento | **Confere** | `eslint.config.mjs:44-46` e `:93-98` |
| **Skill `ui-design-system`** — primitivos canônicos | Button, Input/Select/Textarea, Badge, Tabs, Tooltip, Card, Checkbox, mais GatilhoAjuda | **Confere exatamente** — `src/components/ui/` tem esses 8 arquivos e nenhum outro | `ls src/components/ui/` |
| **Skill `ui-design-system`** — `GatilhoAjuda` | É `<button type="button">`, nunca `<span>`; tem `ancoraDireita` e `pararPropagacao`; a sonda reprova `>?</span>` | **Confere** | `src/components/ui/gatilho-ajuda.tsx:38-39,51-52,55,58-65`; `gatilho-ajuda.test.ts` existe |
| **Skill `tabela-densa`** — exemplos vivos | Cita `cadastro-clientes.tsx` e `base-dados-tab.tsx` como exemplos da receita sticky | **Confere** — ambos usam `border-separate` | `src/components/financeiro/cadastro-clientes.tsx`, `src/components/financeiro/gerencial/base-dados-tab.tsx` |
| **ADR-0144 / skill `react-padroes`** — skeletons | Módulo expõe `SkeletonHeader/Filtros/Kpis/Grafico/Tabela` + `SkeletonDashboard`/`SkeletonPaginaTabela` (+ `SkeletonPagina`) | **Confere** — exatamente 8 exports | `src/components/shared/skeletons.tsx` |
| **`src/styles/tokens.test.ts`** — cobertura da sonda | Lista de "tokens-âncora consumidos pelo app" | **7 tokens vivos ficam de fora** e podem ser removidos sem a sonda reclamar: `--band`, `--band-soft`, `--warning-deep`, `--teorico`, `--teorico-soft`, `--tooltip-bg`, `--focus-ring` | `src/styles/tokens.test.ts:14-31` × `src/styles/tokens.css` |
| **Nenhuma fonte** | — | **Nenhuma documentação menciona tema escuro**, e o bloco `@media (prefers-color-scheme: dark)` em `globals.css:152-159` está ativo e afeta três variáveis consumidas em produção. É comportamento não documentado, não decisão registrada. | `src/app/globals.css:152-159` |

**Nada prometido pela documentação está ausente do código.** Todo componente citado por nome e
caminho nas skills e na página existe no caminho declarado. As divergências são de **valor**
(ADR-0040, ADR-0090), de **cobertura** (a página viva não cataloga dois padrões obrigatórios) e de
**premissa** (o `CLAUDE.md` afirma uma biblioteca que não existe).

---

# Reconstruível

Descrito com densidade suficiente para virar spec sem consultar o repositório:

1. **O sistema de cor inteiro** — 64 tokens com valor, família, propósito e as decisões não óbvias
   (contraste do âmbar, separação teórico × atenção, default neutro do brand).
2. **O mecanismo de tema por aba** — `[data-theme]` escrito por efeito de cliente, três variáveis
   por tema, o problema da janela pré-hidratação e a solução (default do `:root` = tema `group`,
   tokens `--action-*` dedicados para telas neutras).
3. **A ausência de tema escuro**, com a lista exata dos obstáculos quantificados (1.627 `zinc` +
   181 `white`/`black`) e o defeito ativo do bloco residual.
4. **Os 8 primitivos de `ui/`** — variantes, tons, tamanhos, estados, props em conceito, receita de
   acessibilidade e casos de borda tratados, incluindo os quatro do `GatilhoAjuda` e a razão de
   cada um.
5. **As sobreposições** (`ModalCentral`, `ListDrawer`, `ConfirmModal`) e a pilha global de Esc —
   incluindo o que **não** têm (focus trap).
6. **`ScrollAutoHide`** — a mecânica completa, as três constantes de geometria e o porquê de cada
   uma, e a razão de ser imperativo.
7. **`TopSection`** — a mecânica da cortina, os dois casos de borda (`inert` e o clip da sombra).
8. **O vocabulário de pill** — as duas famílias, quando o ativo é neutro e quando é da aba.
9. **As quatro classes globais de CSS** (`.card-clicavel`, `.card-clicavel-neutra`,
   `.scrollbar-none`, `.foco-neutro`) e a distinção `:focus` × `:focus-visible`.
10. **O adaptador de gráficos completo** — por que os primitivos são factories, o tema inteiro com
    valores, as 13 formas de gráfico existentes, o tratamento de paleta/tooltip/eixo/legenda/
    número, os casos de borda e as 10 armadilhas do Recharts.
11. **A casca** — estrutura de layout, o `<main>` como fonte única de respiro, o comportamento
    completo da sidebar, e o estado real das páginas de erro (ausentes).
12. **O modelo de navegação e a costura com permissões** — a forma do modelo, os três predicados
    com a precedência exata, e os quatro fios de acoplamento.
13. **Os helpers de formatação** — os dois regimes de data, os seis formatadores de moeda e por que
    são separados.
14. **A infraestrutura** — versões resolvidas, o que cada config decide, as três regras de lint
    próprias com o que não pegam, as 21 variáveis de ambiente, os quatro clientes de banco, a
    esteira de migration e o deploy.
15. **O mapa de contaminação de domínio**, em três níveis de esforço de remoção.

# Faltando

O que precisaria de uma segunda passada, e a pergunta exata a fazer:

1. **Licença da fonte Avenir LT Std.** Nada no repositório registra os termos. *Pergunta: existe
   licença que permita usar e redistribuir os `.otf` num produto fora do Welcome Group? Se não,
   qual é a fonte substituta e como a escala de pesos 300/400/500/600/800 se remapeia?*
2. **O que as seções 5 a 9 e 12 da página `/admin/design-system` demonstram.** As 12 seções são:
   1. Paleta Brand Welcome · 2. Paleta Dessaturada — Fluxo de Caixa · 3. Cores de Subsetores
   Weddings · 4. Tipografia · 5. Cards — Variantes · 6. Pills e Botões de Filtro · 7. Tabelas e
   Listas · 8. Gráficos — Padrão (tom discreto) · 9. Drawers — Padrão Estrutural · 10. Componentes
   Compartilhados · 11. Plataforma (auth/admin) · 12. Layout de Página. As seções 1–4, 10 e 11
   foram conferidas contra o código neste levantamento; as demais não. *Pergunta: as seções 5, 6,
   7, 8, 9 e 12 afirmam alguma regra que o código não cumpre? (A 7 é a mais provável, porque a
   receita de tabela densa não tem componente que a force.)*
3. **Comportamento visual em execução.** Nada foi aberto em navegador. Três afirmações deste
   documento são inferência de código e mereceriam confirmação ao vivo: (a) o defeito de contraste
   da sidebar em modo escuro do sistema operacional; (b) o `Tabs` sem navegação por setas; (c) a
   ausência de focus trap nos overlays. *Pergunta: confirmar os três num navegador com leitor de
   tela e com o SO em dark mode.*
4. **A receita de tabela densa em forma reconstruível.** Este documento tem a regra (z-index,
   `border-separate`, fundo opaco na célula, largura como fonte única), mas não o código completo
   de um exemplo. Ele está disperso em 2.806 linhas de `tabela-dre.tsx`. *Pergunta: extrair um
   exemplo mínimo e completo de tabela com cabeçalho sticky de duas linhas e coluna fixa à
   esquerda e à direita — ou decidir que a replicação usa uma biblioteca de tabela.*
5. **Contrato de entrada dos gráficos, por forma.** Cada forma foi descrita pelo que faz e pelas
   armadilhas; os formatos exatos de `data` (nomes de campo, unidade — reais ou centavos, presença
   de marcador de futuro) só foram levantados para a cascata. *Pergunta: para cada uma das 13
   formas, qual o shape exato do array de dados?*
6. **Se as 4 variantes de filtro de período e os 4 estados de erro dispersos são decisão ou
   dívida.** Não há comentário assumindo nem registro em ADR. *Pergunta: a replicação deve
   convergir para uma variante de filtro de período e um componente de estado de erro, ou a
   divergência serve a algo?*
7. **`--surface-soft` e `--surface-strong`.** Estão declarados e expostos como utilitárias, mas
   este levantamento não mediu onde são consumidos. *Pergunta: quantos call-sites cada um tem, e
   o `bg-white` cravado em `Card`/`CardTabela`/`ModalCentral` deveria ser `--surface`?*
8. **Cobertura de acessibilidade em ferramenta.** Nada foi rodado. Este documento descreve o que
   **está implementado**, não o que **passa**. *Pergunta: rodar axe ou Lighthouse nas telas-chave
   e registrar o veredito, em vez de inferir do código.*
