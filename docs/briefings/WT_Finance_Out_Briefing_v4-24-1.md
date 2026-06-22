# WT Finance — Out-Briefing v4.24.1

**Data:** 2026-06-22 · **Branch:** `feat/v4-24-1-refinos-visuais` (base `main` @ v4.24.0) · **Versão:** 4.24.0 → **4.24.1** (PATCH)
**Tema:** Leva de refinos visuais (cosmético/reversível): e-mail de senha (logo + link), cores de valor da projeção, arredondamento da barra de seção, verdes/hover à identidade. **Sem migration. Sem ADR** (nenhuma decisão arquitetural nova). **Merge e deploy ficam com o usuário.**

---

## Missões implementadas (M1–M5)

### M1 — E-mail: link de acesso + logo embutido — commit `f996f59`
- **Logo Welcome Group no topo**, embutido via **CID** (`cid:welcome-logo`) + **alt text** (`"WT Finance — Welcome Group"`); **substitui** o título tipográfico "WT FINANCE" (o logo já contém o nome). Exibido a 160px, centralizado.
- **Achado (auto-auditoria vs briefing):** o arquivo do briefing era `welcome-grupo.png`, mas o real no repo é **`welcome-group.png`** (inglês), em `public/logos/`. Usei o **PNG** (1171×228), não o `.svg` (SVG não renderiza em e-mail).
- **Como foi embutido (decisão técnica):** os BYTES do PNG vão num módulo `src/lib/email/logo.ts` (base64 numa const) e são anexados como **attachment MIME** (`Buffer.from(...,'base64')`, `cid: 'welcome-logo'`) na `enviarSenhaProvisoria`. É **CID, não data-URI** no `<img>` (data-URI falha no Outlook). Base64-no-bundle (não `path` de `public/`) porque **`public/` não é legível por `fs` em runtime serverless na Vercel** — assim os bytes vão garantidos no bundle da função.
- **Botão "Acessar a plataforma":** URL de `getAppBaseUrl()` (novo, em `config.ts`): `APP_BASE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` (a URL que a Vercel conhece) → `null` (botão **omitido**, e-mail segue válido). URL **da config, nunca hardcoded** (mesma filosofia do remetente). `APP_BASE_URL` adicionada ao `.env.example` (só a chave).
- Teste `email.test.ts`: +5 casos (logo CID/alt, botão com/sem link, `getAppBaseUrl` ×3).

### M2 — Cores de valor na projeção — commit `ad58481`
`visualizacao-agregada-tab.tsx`: `--positive-deep`/`--negative-deep` (#3F5028/#6B2D1F, quase pretos — positivo e negativo liam-se quase iguais) → tokens **base** `--positive` (#5F7A3D)/`--negative` (#A35442) nos fluxos (A Receber/A Pagar), no Resultado do Dia e nos saldos (`corTextoSaldo`). Nitidamente verde/vermelho e legíveis sobre **branco** (fluxos/resultado) E sobre as **faixas claras** (`bg-success-bg #E8F0E4`/`bg-danger-bg #F5DDDD` dos saldos). **Só a cor muda — a matemática da projeção é idêntica.**

### M3 — Arredondamento da TopSection — commit `d080a24`
`top-section.tsx`: a barra de cabeçalho de seção (era quadrada) ganha `rounded-xl` (= raio dos cards da plataforma, ex.: aba-solicitacoes/projeção) + `overflow-hidden` (o acento lateral acompanha o canto). No **componente** → propaga a TODAS as telas (Gerencial, Weddings, etc.).

### M4 — Verdes/hover à identidade — commit `89ee7bc`
- **Hover da caixa de solicitação:** `.card-clicavel-neutra:hover` (globals.css) usa `--action-soft-border` (#75777B, cinza suave do DS) em vez de `--action-primary` (#3F4144, charcoal) — fim da "borda preta crua". Afeta `board-solicitacoes` e `minhas-solicitacoes`.
- **Bolinha de concluir** (`board-solicitacoes`): hover `emerald-500/50` → `success/success-bg`.
- **Toast de sucesso** (`FaixaMensagem`, usado em acessos e solicitações): `emerald-200/50/700` → `border-success bg-success-bg text-success` (= padrão do badge "Ativo"). Erro (vermelho Tailwind) fica fora do escopo.
- **Consistência dos verdes:** valores = `--positive`/`--negative` (cash-flow, ADR-0103); sucesso/concluir = `--success` (status). Ambos da família verde do DS, harmônicos — fim do emerald off-palette.

### M5 — Fechamento — este commit
Versão 4.24.1 (+ `package-lock` sincronizado via `npm version`), CHANGELOG, CHANGELOG_DIRETORIA (negócio), CLAUDE.md (extensão do bullet de e-mail: imagem via CID-no-bundle + URL via `getAppBaseUrl`), out-briefing. Sem ADR.

## Auto-auditoria (enxuta — visual, reversível, sem dado/segurança)
- **Cores via tokens, zero hex avulso:** M2/M3/M4 usam só tokens (`var(--positive/--negative)`, classes `success/success-bg`, `var(--action-soft-border)`) — `grep` não acha cor nova hardcoded. (O e-mail usa hex inline em constantes DS-derivadas — obrigatório em e-mail; nenhum hex novo fora disso.)
- **Verdes consistentes:** todos os pontos passam à família verde do DS (`--positive` p/ valores, `--success` p/ status), nenhum emerald restante (só num comentário).
- **Fallback do e-mail intacto:** o logo/link entram no mesmo caminho fallback-safe da v4.24 — sem config/erro, `enviarSenhaProvisoria` segue retornando `false` e a senha aparece na tela (testes verdes).
- **Projeção: só cor.** A lógica de saldo/acumulado não foi tocada (apenas classes de cor de texto).

## Gates
`tsc --noEmit` **0** · `lint` **12** (= baseline; o `acc += d.resultado` em `visualizacao-agregada:78` é pré-existente, idêntico na `main` — **zero novos**) · `npm test` **164** (+5 de `email.test.ts`) · `next build` **limpo**.

## Arquivos
**Novos:** `src/lib/email/logo.ts`, este out-briefing.
**Modificados:** `src/lib/email/{config,template,index}.ts` + `email.test.ts`, `.env.example` (APP_BASE_URL), `src/components/financeiro/gerencial/visualizacao-agregada-tab.tsx`, `src/components/shared/top-section.tsx`, `src/app/globals.css`, `src/components/solicitacoes/board-solicitacoes.tsx`, `src/components/admin/acessos/faixa-mensagem.tsx`, `package.json`/`package-lock.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `CLAUDE.md`.
**Sem migration. Sem ADR.**

## Pendências / fora de escopo (registro, não implementação)
- **Conferência visual do e-mail no Outlook:** não foi possível testar no Outlook neste ambiente. O CID é a técnica compatível com Outlook (por isso foi escolhido em vez de data-URI), mas a conferência visual final (logo renderiza, botão ok) fica para o Yan ao validar — idealmente com `APP_BASE_URL` já setada para ver o botão.
- **Configurar `APP_BASE_URL`** no `.env.local` e na **Vercel** (senão o botão cai em `VERCEL_PROJECT_PRODUCTION_URL` ou é omitido). Soma-se ao SMTP da v4.24 (runbook `v4-24-email-runbook.md`).
- **NOVA FRENTE registrada — revisão completa do design system (pré-v5.0):** mapear divergências implementação×identidade, tokens a definir/consolidar (ex.: legibilidade dos tons mutados como `text-success` sobre `bg-success-bg`), estados inconsistentes (hover/foco), **incluindo os layouts de e-mail** (botão/composição) — investigação + plano próprios, NÃO patch. (Apêndice do briefing.)
- O `acc += d.resultado` (lint `react-hooks/immutability`, pré-existente) não foi tocado — fora do escopo deste patch cosmético.
