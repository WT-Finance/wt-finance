# WT Finance — Out-Briefing · Teste de Rebranding "Janus" (sidebar)

**Data:** 2026-07-04
**Branch:** `test/rebrand-janus-sidebar` (base: `main` @ v4.35.0)
**Commits:** 11
**TypeScript:** limpo (`npx tsc --noEmit`)
**Build:** limpo (`npx next build`)
**Lint:** limpo (`npm run lint`)
**Migrations:** nenhuma · **ADRs:** nenhum · **Versão:** sem bump (deliberado)
**PR:** #166 (draft)

---

## Natureza deste trabalho — LER ANTES DE MERGEAR

Este é um **teste exploratório de rebranding**, restrito à **sidebar**, para o Yan avaliar
a nova identidade "Janus" em produção-preview. **Deliberadamente NÃO segue o workflow de
versão**: sem bump de versão, sem ADR, sem entrada no `CHANGELOG.md`/`CHANGELOG_DIRETORIA`,
sem atualização do Design System doc. A implementação definitiva do rebranding será uma
**versão própria** (briefing + prompt), usando este documento como consolidação do que já
foi decidido e validado. O merge deste PR como está é decisão de produto do Yan; o caminho
"canônico" é a versão definitiva reimplementar/absorver isto com o rito completo.

---

## Estado final da sidebar (o que o teste entrega)

### 1) Header — logo Janus em TODAS as variantes
- **Asset:** `public/logos/logo-janus.svg` (viewBox `1835.22×450.47`, proporção ~4,07:1;
  arte com fills `#76787c`/`#77787c` + paths `fill="none"`). Fornecido pelo Yan (2ª versão,
  redimensionada por ele após a 1ª rodada).
- **Render:** técnica de **máscara CSS** (SVG como `mask-image` + `backgroundColor`) — a
  mesma já usada pelo Corporativo pré-teste — via prop `recolorTo` do `WelcomeGroupLogo`
  (renomeada de `recolor: boolean`, agora aceita cor arbitrária).
- **Layout (prop `principal`):** caixa fixa **168×48px centralizada** (`h-12 w-[168px]
  max-w-full`; o pai `items-center` centraliza), arte em `contain` centrada ⇒ **168×41px**
  (+23% de altura vs o logo antigo, que rendia ~173×34px). Respiro lateral ~12px por lado
  no desktop (16px até o ícone do chevron de recolher). Sem o downscale `scale-[0.9]` do
  layout antigo.
- **Cores por página** — critério: *a mesma cor que o logo Welcome antigo EXIBIA em cada
  aba* (hex "baked" dos SVGs antigos, NÃO os tokens `--brand`):

  | Contexto (pathname)          | Cor aplicada    | Origem do critério                          |
  |------------------------------|-----------------|---------------------------------------------|
  | default (fora de Performance)| `#807f7e`       | fill baked do `welcome-group.svg`           |
  | `/performance/weddings`      | `#c29864`       | fill baked do `welcome-weddings.svg` (≠ token `#BD965C`) |
  | `/performance/trips`         | `#1e91b2`       | fill baked do `welcome-trips.svg` (≠ token `#0091B3`)    |
  | `/performance/corporativo`   | `var(--brand)`  | o logo antigo do Corp já era recolorido p/ a cor da aba (`#0D5257`) |

### 2) Byline — "by WELCOME" no lugar do wordmark "WT FINANCE"
- **Receita escolhida pelo Yan no mockup interativo:** `"by WELCOME" · negrito · reto · 12px`.
- Implementação: `text-[12px] font-[800] tracking-[1px]`, cor `var(--brand)` (inalterada),
  **casing literal** (sem classe `uppercase` — o "by" fica minúsculo). `font-[800]` = Avenir
  85 Heavy, o mesmo peso do wordmark antigo.
- `VersionHistory` ("version X.X.X") ao lado, **intocado**.
- Gap ao logo: `mt-2` no layout principal (era `mt-4` no antigo) — compensa o respiro
  interno da arte Janus (o lettering termina a ~81% da altura dela), mantendo o **gap
  óptico de ~19px** do layout antigo.

### 3) Rodapé — selo Welcome Group vertical em box
- **Asset:** `public/logos/welcome-group-vert.svg` (lockup vertical do logo antigo,
  viewBox `832.28×640.58`, fill baked `#807f7e`). Fornecido pelo Yan.
- **Receita escolhida no mockup:** `box 46px · respiro 4px · canto 12px · fundo branco ·
  com borda`.
- Implementação: tile `h-[46px] w-[46px] p-1 rounded-xl bg-white border`
  (borda `var(--sidebar-border)`), `Image fill object-contain` num wrapper interno
  (Image `fill` ignora padding do pai — wrapper `relative h-full w-full` resolve).
- Rodapé: `h-14` → **`min-h-14 py-2`** (cresce ~6px acomodando o box, espelhando o respiro
  vertical aprovado no mockup) e `gap-2` → `gap-2.5`. Nome/cargo (`truncate`) e botão sair
  inalterados. Narrativa: **Janus assume o header; a marca Welcome permanece no rodapé.**

---

## Decisões e critérios registrados (valem para a definitiva)

1. **Cor por variante = cor exibida pelo logo antigo** (baked hex), não o token da aba —
   escolhido explicitamente pelo Yan ("a mesma variante de cor do logo antigo"). Migrar
   para tokens (`--brand`) é troca de 2 strings se a definitiva preferir unificar.
2. **Máscara CSS achata a arte numa cor só** — funciona porque o Janus é monocromático.
   O asset nunca é editado; a cor vive no componente (reversível, um só ponto).
3. **Ritmo do header restaurado ao do layout antigo** (análise dimensional): topo óptico
   ~15px, gap óptico byline ~19px, header ~100px de altura. A 1ª iteração (full-bleed
   192px, caixa h-14) colava no chevron e sobrava ar embaixo — corrigida na 2ª.
4. **Mockup interativo > comparação in-app** para decisão visual: a tentativa de empilhar
   5 variações da byline na sidebar real quebrou linha (256px) e foi revertida. Os dois
   mockups (Avenir real embutida via base64 + SVG real + réplica pixel-fiel) permitiram
   ao Yan escolher receitas exatas em uma rodada cada.
5. **Ramo legado preservado como caminho de reversão:** o branch `Image` (h-10, à esquerda,
   `scale-[0.9]`) e o fallback de erro do `WelcomeGroupLogo` continuam no componente; os
   SVGs antigos continuam em `public/logos/`. Nada foi excluído.
6. **`logo-janus.png`/`@2x/@3x` e `welcome-group-vert.png`/`@2x/@3x` NÃO foram commitados**
   (a sidebar usa só os `.svg`). Estão untracked na raiz do repo principal.

## Ferramentas de decisão (mockups publicados)

- **Byline:** https://claude.ai/code/artifact/af9d0403-104a-417d-9f50-7439412b892e
  (texto Welcome/WELCOME, negrito, itálico, tamanho ±1px; receita copiável)
- **Selo do rodapé:** https://claude.ai/code/artifact/6be75944-8832-4b5f-82fb-c9e97122bf3b
  (box, respiro, canto, fundo, borda; receita copiável)
- Ambos com réplica fiel (Avenir LT Std real do repo embutida — Book/Roman/Heavy; itálico
  sintetizado como no app; tokens/métricas exatos). Fonte dos geradores: fora do repo
  (tmp do job), receitas registradas acima.

## Iterações (histórico das 11 na branch)

`c9cce63` logo principal Janus (#807f7e, máscara) → `a2939cb` arte redimensionada pelo Yan
→ `b0bf9ff` maior+centralizado (1ª tentativa, full-bleed) → `2d2cccf` ritmo corrigido
(168×48, mt-2) → `07b9d61` byline "by WELCOME" itálico → `be64c49` "by Welcome" + Janus
nas subabas de Performance (cores por página) → `63e54c9` comparação empilhada (5 variações)
→ `2e0e761` revert (quebrava linha) → `39f3aa9` byline definitiva (WELCOME negrito reto 12px)
→ `3571005` selo vertical no rodapé (solto, 36px) → `c6340f3` selo em box (46/4/12/branco/borda).

## Arquivos modificados (vs `main`)

- `src/components/layout/sidebar.tsx` — todas as mudanças de componente (+70/−26 no total)
- `public/logos/logo-janus.svg` — novo (arte 2ª versão)
- `public/logos/welcome-group-vert.svg` — novo

## O que NÃO foi tocado (escopo em aberto para a definitiva)

Superfícies que ainda mostram a identidade antiga / "WT Finance":
- `src/components/layout/header.tsx` — wordmark "WT Finance" do topo (desktop)
- `src/components/layout/mobile-header.tsx` — "WT Finance" no header mobile
- `src/components/auth/auth-header.tsx` — logo Welcome Group + wordmark nas telas de auth
- `src/app/layout.tsx` — `title: "WT Finance"` (aba do navegador) + favicons/ícones (`icon*.png`, `apple-icon.png`)
- Fallback de erro do `WelcomeGroupLogo` — ainda escreve "Welcome Group / Finance Dashboard"
- E-mails (`src/lib/email/`) — logo/nome nos templates
- Textos de produto que citam "WT Finance" (login, /sem-acesso, /auth/confirm, design-system page)
- `docs/design-system.md` + tokens (avaliar se "Janus" ganha tokens próprios)
- Nome do repo/projeto, `package.json` name, PWA manifest se houver

## Checklist sugerido para a implementação definitiva

- [ ] Definir escopo de superfícies (tabela acima) com o Yan — produto decide onde Janus entra
- [ ] Versão MINOR própria + briefing/prompt; ADR do rebranding (decisão de identidade + técnica da máscara)
- [ ] Decidir: cores baked por página (como no teste) × tokens `--brand` unificados
- [ ] Decidir destino do ramo legado do `WelcomeGroupLogo` (limpar ou manter) e do fallback de erro
- [ ] Avaliar assets PNG @2x/@3x (hoje untracked) — necessários? onde?
- [ ] Favicon/ícones do app e `title` — nova identidade?
- [ ] `CHANGELOG.md` + `CHANGELOG_DIRETORIA` (linguagem de negócio: "nova identidade visual…")
- [ ] Smoke visual nas 4 variantes da sidebar (default/Weddings/Trips/Corp) + mobile drawer
- [ ] Conferir DS doc (§ sidebar/identidade) e atualizar

## Como reverter o teste

`main` está intacta. Fechar o PR #166 sem merge e apagar a branch encerra o teste sem
rastro no app. Os assets novos ficam untracked na raiz (decisão do Yan mantê-los ou não).
