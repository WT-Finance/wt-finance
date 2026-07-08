# Out-Briefing — v4.40.0 · Rebranding Janus (o fechamento da v4)

**Tipo:** MINOR · **Migration:** 0174 (aditiva — *o briefing citava 0171, mas 0171–0173 já existiam; numeração real = 0174*) · **ADR:** 0145 · **Base:** main @ v4.39.0 · **Branch:** `feat/v4-40-0-rebranding-janus`
**Fonte das receitas:** out-briefing do teste `test/rebrand-janus-sidebar` (PR #166 — **fechado sem merge**; esta versão o absorve).

## Missões

### M0 — Favicon + title (GATE do Yan)
- Pipeline do `logo-janus-vert.svg` (449×538; wordmark no topo ~18%, símbolo bifronte abaixo): **16/32** = corte do símbolo (viewBox `18.5 131.8 423 405.6`) SEM wordmark, **traço engrossado** via stroke 12 adicionado **só aos paths preenchidos** de um SVG derivado (os `fill:none` continuam invisíveis — em 16px, 1px ≈ 26 unidades do viewBox; traços de ~6 unidades somem sem o engrosso), **tile branco**; **48** = corte sem engrosso; **180/192/512** = lockup completo com respiro ~8%.
- **Régua comparativa 16/32/48/180 gerada e enviada ao Yan** (tamanho real + ampliações de pixels). Nada aplicado antes do ok; texto nunca no favicon pequeno. `title` → "Janus · Welcome Group" (aplicado junto do commit do favicon).

### M1 — Sidebar (absorção do teste, sobre tokens)
- Header: `JanusLogo` — caixa 168×48 centralizada, máscara CSS, ritmo do teste preservado (byline `mt-2` ≈ 19px ópticos). Byline "by WELCOME" 12px/800/reto. Selo Welcome vertical no rodapé (box 46/4/12/branco/borda; rodapé `min-h-14 py-2 gap-2.5`).
- **MUDANÇA vs teste:** cores por variante (hex baked `#807f7e`/`#c29864`/`#1e91b2`) → **regra única `var(--brand)`** (o `[data-theme]` resolve o setor; com o novo default, o repouso é neutro). O mapa por pathname do logo morreu.
- Ramo legado do `WelcomeGroupLogo` (Image/h-10/scale-0.9) **removido**; fallback de erro → **"Janus"** via sonda `Image()` em efeito (máscara não expõe `onError`; mesma URL → mesmo cache). SVGs antigos permanecem em `public/logos`. PNGs @2x/@3x untracked não commitados.

### M2 — Superfícies restantes
Wordmark **JANUS** em `header.tsx`, `mobile-header.tsx`, `auth-header.tsx` (logo Welcome preservado); textos "WT Finance"→"Janus" em `/sem-acesso`, `/auth/confirm`, design-system. Repo/`package.json` NÃO renomeados (decisão do Yan). Grep final: nenhum "WT Finance" visível ao usuário (restam: comentários de código, changelog histórico — legítimos).

### M3 — Saneamento `--brand` + INVENTÁRIO
Default do `:root`: `#BD965C/#FBF1E1/#8F7E35` → **`#75777B/#EAE6DD/#4B4F54`** (trio do tema group). `tokens.test.ts` passou sem alteração.

**Inventário (auditoria completa — resumo executivo; a mecânica: o `ThemeProvider` já resolvia `group` p/ toda rota não-setorial desde a v4.10, então o default do `:root` só regia o PRÉ-hidratação):**
| Categoria | Achado | Efeito da mudança |
|---|---|---|
| Sidebar (logo/byline/nav ativo) | única superfície garantida em TODA página (SSR) | flash pré-hidratação: dourado→**neutro** (correto) |
| Primitivos cross-app (`PILL_ACTIVE`, `TopSection`, `kpi-coluna`, pills de período, `card-clicavel`…) | herdam `[data-theme]` corretamente | pós-hidratação inalterado; 1º paint neutro |
| Weddings (`src/components/weddings/*`) | tudo renderiza sob `[data-theme=weddings]`; portais herdam (montam em `body` ⊂ `html[data-theme]`) | **inalterada** ✓ |
| `#BD965C` hardcoded | só em `src/lib/email/**` (isento — Outlook) e docs/swatches | nenhum resquício em UI viva |
| `--neutral` #C99E5E ("dourado pálido") | único consumidor de produto: tag "Melhoria" do modal de changelog (deliberadamente theme-independent) | inalterado; só o comentário de origem ficou histórico |
| **Docs vivas FALSAS (corrigidas)** | design-system §11 dizia ":root tem #BD965C → flash dourado"; comentário de `acaoBadge` dizia "tela sem data-theme → #BD965C estável" (impreciso desde sempre — a rota tem tema group) | ambas corrigidas |
| **Trade-off** | cold-load direto em `/performance/weddings`: flash agora é cinza→dourado (antes coincidia) | aceito (inerente a default ≠ dourado); registrado no ADR |
| **Pendências (produto, FORA desta versão)** | (a) badge "Abertura" na UI é neutro (tema group, já era) × e-mail dourado #BD965C — paridade UI×e-mail da v4.25.1 não se sustenta; (b) `/performance?preview=1&setor=Weddings` (Geral, represado atrás de preview) pinta cards de Weddings em cinza-group; (c) `kpi-principal-drawer.tsx` mora em `weddings/` mas é genérico por setor (nomenclatura) | registradas p/ o Yan |

Smoke visual: prancha das 4 variantes (group/weddings/trips/corporativo — máscara + token) gerada e conferida; harness HTML das 4 sidebars idem. Validação in-app no checkpoint.

### M4 — E-mails internos (lockup duplo)
- `templateSenhaProvisoria` + `templateNotificacaoSolicitacao`: cabeçalho **[JANUS] | [WELCOME GROUP]** — tabela Outlook-safe (divisor 1px em célula `bgcolor`, gaps de 18px em células, alturas ópticas casadas a 36px; artes com rasters de 93px). Textos via `APP_NOME_INTERNO='Janus'`; rodapé "JANUS · WELCOME GROUP". Novo CID `janus-logo` (PNG 379×93 alpha rasterizado do SVG, bytes no bundle).
- **FATURA INTOCADA (invariante provado):** `APP_NOME='WT Finance'` congelado; `templateFaturaEmail`, `fatura.ts` e `fatura.test.ts` **sem diff** — os testes da fatura passam sem alteração.
- **Exemplos p/ o checkpoint:** `EMAIL_TESTE_DESTINO` NÃO existe no `.env.local` local → **não enviei e-mail** (sem destino confirmado); gerei **previews HTML fielmente renderizados** dos 2 e-mails (enviados ao Yan no pacote do checkpoint). Se o Yan quiser os exemplos na caixa de teste, basta informar o endereço (ou setar a env) — o envio é 1 comando.

### M5 — Modal "Welcome to Janus" (migration 0174)
- **Migration 0174 aditiva** (aplicada, backup-gate VERDE; RPCs verificadas via REST — `onboarding_visto` 200/false, `marcar_onboarding_visto` 204): `app.rbac_usuarios.onboarding_visto_em` + RPCs inline com guard `app.exigir_acesso()` (autenticado ativo; molde `solic_minhas_pendencias`). Marcação idempotente (COALESCE preserva a 1ª visualização).
- Componente: texto **VERBATIM**, lockup duplo horizontal (empilha no mobile), título serif (stack Georgia — Trajan futura = 1 linha, registrado), "Começar" em `--action-primary` (tokens neutros de plataforma). Promise **fora do caminho bloqueante** (Suspense+`use`, técnica do badge v4.39); **fail-safe duplo** (lib devolve `true` em erro + `.catch` no layout) → consulta falhou = não exibe; nunca trava o app.

### M6 — Histórico colapsado por major
`VersionHistory`: grupos derivados do dado + `APP_VERSION` (major atual = `APP_VERSION.split('.')[0]` — sem literal "4"/"5"); majors anteriores dobram ("Versões N.x — N versões", chevron, `aria-expanded`); major atual mostra 5 recentes + "Mostrar mais N versões". Hoje (só 4.x): um grupo com 5 + expansor de ~72. Na v5.0.0, o 4.x dobra sozinho. `changelog-diretoria.ts` intocado.

### M7 — Fechamento
v4.40.0 (`package.json`+lock; `version.ts` deriva), CHANGELOG, CHANGELOG_DIRETORIA (identidade em linguagem de negócio), ADR-0145, DS doc (seção "Identidade Janus": fronteira, máscara+token, lockup duplo, receita do modal), este out-briefing. **PR #166 fechado sem merge** (após o PR desta versão abrir).

## Gates
`npx tsc --noEmit` → **0** · `npx vitest run` → **355** verdes (incl. `fatura.test.ts` INALTERADO — prova do invariante; `tokens.test.ts` sem alteração) · `eslint` nos alterados → **0** · `npx next build` → exit **0** · **Migration 0174 aplicada** (backup-gate VERDE) e verificada via REST.

## Checkpoint do Yan (antes do merge)
1. **Régua do favicon** (enviada — gate M0; aplico após o ok). 2. As 4 variantes da sidebar + mobile (preview). 3. Title/auth/textos. 4. **Caça ao dourado** fora de Weddings (e ao cinza dentro). 5. Os 2 e-mails internos (previews enviados; envio real à caixa de teste sob demanda — falta `EMAIL_TESTE_DESTINO`). 6. Logar sem flag (modal, texto exato) e relogar (some). 7. Histórico colapsado.

## Fronteira
FORA: e-mails de cliente; renomear repo; Trajan Pro (troca de 1 linha futura); lógica de negócio. **Depois desta versão a v4 está FECHADA** — restam a virada do Faturamento e a v5.0.0.

---

## Adendo — Checkpoint do Yan (rodada 1, 2026-07-07/08)

**Veredito do gate M0 (favicon):** o corte do símbolo bifronte **não ficou legível em 16/32** → **os ícones ATUAIS permanecem** (decisão do Yan). A arte bifronte é detalhada demais para favicon pequeno; a receita do pipeline (crop do viewBox + stroke nos paths preenchidos + tile branco) fica registrada aqui para retomada futura com uma arte simplificada. O **`title` foi aplicado**: "Janus · Welcome Group" (+ `description` alinhada ao posicionamento).

**Ajustes pedidos e feitos:**
1. **Divisor do lockup CORTADO no Outlook real** — a célula com `height` no `<td>` + `font-size:0/line-height:0` era colapsada pelo motor Word. Fix: DIV interno com `height:40px` + `line-height:40px` + `mso-line-height-rule:exactly`. **LIÇÃO Outlook (junta-se às do email-layout-guide):** altura de divisor/spacer nunca só no `<td>` — sempre num elemento interno com height+line-height iguais.
2. **Welcome levemente menor no lockup** (harmonia óptica): 186×36 → **165×32**; Janus segue 147×36. Vale para os 2 e-mails internos e para o login.
3. **Login com lockup duplo** — `auth-header.tsx` vira `[JANUS] | [WELCOME GROUP]` (barra fina, mesmas alturas ópticas 36/32) e o wordmark textual "JANUS" **saiu**. Contrato dos 5 call-sites preservado (className externa intacta).
4. **Swatch do design-system corrigido** — a Paleta ainda exibia `--brand` como `#BD965C` dourado; agora mostra o default real `#75777B` (neutro do Grupo) com a explicação dos overrides setoriais.
5. **Dourado do e-mail de solicitação ("SOLICITAÇÃO CRIADA") — confirmado intocado:** é `#BD965C` **hardcoded no template** (isento por convenção Outlook), **não usa token** — o saneamento do `--brand` não o afeta (verificado na auditoria e no preview regenerado).

**Pendente de decisão (mockup enviado):** sidebar **sem** o "by WELCOME" com "version X.X.X" centralizado (opção B) × atual com byline (opção A). Aguardando o veredito do Yan para aplicar (ou manter A).

---

## Adendo — Checkpoint rodada 2 (2026-07-08)

**Decisões do Yan:** previews dos e-mails **APROVADOS**; mockup do login **APROVADO** (a hierarquia óptica 36/32 do e-mail já estava aplicada no `auth-header` — confirmado); **sidebar = opção B**: sem o byline "by WELCOME", com o "version X.X.X" **centralizado** sob o logo (a marca Welcome permanece no selo do rodapé). Aplicado em `JanusLogo` (sidebar.tsx) + docs (CHANGELOG/ADR §2b/DS doc) atualizados. Gates verdes.

---

## Adendo — Checkpoint rodada 3 (2026-07-08)

1. **"version X.X.X" alinhado à DIREITA da caixa do logo** (168px — a arte preenche a largura, então alinha com o "S" do wordmark). Preview enviado.
2. **Barra de rolagem auto-hide vira PADRÃO do DS:** extraído da sidebar o componente **`<ScrollAutoHide>`** (`shared/scroll-auto-hide.tsx` — nativa escondida + thumb overlay que some sozinho, mecânica imperativa) e aplicado no **Acervo de Documentos** (substitui o `overflow-y-auto` + `scrollbar-gutter`); seção "Barras de rolagem" adicionada ao DS doc (exceção: o `<main>` do AppShell mantém nativa + gutter). A sidebar mantém a implementação embutida (origem do padrão; migração incremental).
3. **Paleta do design-system ganha os destaques setoriais:** Weddings #BD965C, Trips #0091B3, Corporativo #0D5257 (overrides do `--brand` por `[data-theme]`, ADR-0103) — em ColorGrid próprio sob a Paleta Brand Welcome.
