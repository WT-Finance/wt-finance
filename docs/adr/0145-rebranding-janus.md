# ADR-0145 — Identidade Janus: fronteira Welcome/cliente, semântica do `--brand` e a técnica da máscara

**Status:** Aceito · **Data:** 2026-07-07 · **Versão:** v4.40.0
**Relaciona:** ADR-0103 (paleta por contexto semântico — reafirmado e SANEADO aqui), teste `test/rebrand-janus-sidebar` (PR #166, fechado sem merge — esta versão o absorve), **migration 0174** (aditiva — flag do onboarding). *(O briefing citava "migration 0171", mas 0171–0173 já existiam; a numeração real é 0174.)*

## Contexto

A plataforma interna do time Financeiro deixou de ser "um dashboard do WT" e virou um produto com nome próprio: **Janus** (o deus bifronte — olhar para trás/dados históricos e para frente/projeções). O teste exploratório da sidebar (`test/rebrand-janus-sidebar`, 11 commits, aprovado pelo Yan em produção-preview) consolidou as receitas visuais; esta versão as absorve com o rito completo e estende a identidade ao restante da plataforma.

## Decisões

### 1. Fronteira Janus (interno) × Welcome (cliente) — a decisão de marca
- **Janus é o nome INTERNO da plataforma**: sidebar, headers, telas de auth, title, textos de produto, e-mails internos (senha provisória, notificação de solicitação), modal de boas-vindas.
- **O cliente externo NUNCA vê "Janus"**: o e-mail de **fatura** permanece 100% Welcome Trips (template, logo, remetente) — provado por diff (nem `templateFaturaEmail`, nem `fatura.ts`, nem `fatura.test.ts` mudaram; `APP_NOME='WT Finance'` congelado para a fatura, os internos usam `APP_NOME_INTERNO='Janus'`).
- **E-mails internos = lockup duplo `[JANUS] | [WELCOME GROUP]`** (tabela Outlook-safe, divisor 1px em célula, alturas ópticas casadas a 36px; 2 CIDs no bundle). O repo/`package.json` NÃO foi renomeado (decisão do Yan — nome público é o que aparece na tela).

### 2. Saneamento do `--brand`: o dourado é SÓ de Weddings (ADR-0103, agora de fato)
O default do `:root` (`--brand:#BD965C` dourado) era um **resquício** de quando Weddings era a única aba. Passou a ser o trio **neutro do Grupo** (`#75777B`/`#EAE6DD`/`#4B4F54` — os mesmos do tema `group`). Consequências:
- O **repouso** da plataforma (primeiro paint, pré-`data-theme`) é neutro — o antigo *flash dourado* pré-hidratação desapareceu nas telas group (a maioria).
- Os **overrides setoriais permanecem** (`[data-theme=weddings]` #BD965C, `trips` #0091B3, `corporativo` #0D5257) — **nada em Weddings muda de cor** pós-hidratação.
- **Trade-off registrado:** em cold-load direto numa aba de Weddings, o flash pré-hidratação agora é cinza→dourado (antes o default coincidia). Inerente a qualquer default ≠ dourado; aceito.
- Inventário completo de `var(--brand)`/`#BD965C` no out-briefing. Achados anexos: docs vivas corrigidas (design-system §11, comentário de `acaoBadge`); paridade do badge "Abertura" UI (neutro, tema group — já era assim) × e-mail (dourado hardcoded, isento por convenção Outlook) registrada como pendência de produto.

### 3. Tokens, não baked — regra única do logo
As cores por variante do teste (hex baked dos SVGs antigos: `#807f7e`/`#c29864`/`#1e91b2`) **migram para os tokens**: o logo usa **`var(--brand)`** — no repouso é neutro; nas abas setoriais herda o override via `[data-theme]`. Um só ponto de verdade de cor; abas futuras herdam de graça.

### 4. A técnica da máscara permanece (asset nunca editado)
O logo renderiza por **máscara CSS** (`mask-image` do SVG monocromático + `backgroundColor`) — a cor vive no componente, o asset nunca é editado. Vale para os dois logos Janus (horizontal na sidebar; vertical/quadrado no pipeline de favicon). Como a máscara não expõe `onError`, o fallback textual ("Janus") usa uma **sonda** `Image()` em efeito (mesma URL → mesmo cache). O ramo legado do `WelcomeGroupLogo` (Image, h-10 à esquerda) foi removido; os SVGs antigos permanecem em `public/logos` (histórico).

### 5. Onboarding "Welcome to Janus" — 1× por usuário, no BANCO
- **Migration 0174 (aditiva):** `app.rbac_usuarios.onboarding_visto_em timestamptz` + RPCs inline `onboarding_visto`/`marcar_onboarding_visto` (guard `app.exigir_acesso()` de autenticado ativo — dado do próprio usuário; molde de `solic_minhas_pendencias`).
- **Nunca `localStorage`** (multi-dispositivo). Texto **VERBATIM** do Yan (título serif "Welcome to Janus" — stack Georgia; quando a Trajan Pro entrar no repo, a troca é a linha `fontFamily` do componente); botão "Começar" grava (idempotente); **sem** "by WELCOME", **sem** microcopy de rever, **sem** lar permanente.
- **Fail-safe absoluto:** a consulta flui **fora do caminho bloqueante** do layout (promise + Suspense/`use`, técnica do badge v4.39); falha → conta como visto → **não exibe** (o onboarding jamais trava o app); a marcação falha em silêncio (o modal fecha localmente).

### 6. Favicon com gate de legibilidade (M0)
Do `logo-janus-vert.svg`: tamanhos grandes (180/192/512) usam o **lockup completo**; 16/32 usam o **corte do símbolo bifronte** sem wordmark, com **traço engrossado** (stroke 12 adicionado só aos paths preenchidos do SVG derivado — os `fill:none` continuam invisíveis) e **tile branco**. Régua comparativa 16/32/48/180 **apresentada ao Yan para aprovação — nada se aplica antes do ok** (gate). `title`: **"Janus · Welcome Group"**. Texto nunca entra no favicon pequeno.

### 7. Histórico de versões: colapsar, nunca apagar
`VersionHistory` agrupa por **major derivado do dado + `APP_VERSION`** (sem hardcode): majors anteriores colapsados ("Versões N.x — N versões"); major atual mostra as ~5 recentes + expansor. Quando a v5.0.0 chegar, a v4 inteira dobra sozinha. Dado íntegro.

## Consequências
- Identidade unificada com UMA regra de cor (token) e UMA técnica (máscara) — abas futuras herdam.
- A fronteira interno/cliente vira invariante executável (testes da fatura passam sem alteração).
- O flash dourado histórico morreu; nasce um flash menor e raro (cold-load direto em Weddings).
- Depois desta versão, **a v4 está fechada** — restam a virada do Faturamento e a v5.
