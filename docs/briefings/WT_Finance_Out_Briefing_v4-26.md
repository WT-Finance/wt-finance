# WT Finance — Out-Briefing v4.26.0

**Data:** 2026-06-23 · **Branch:** `feat/v4-26-design-system-base` (base `main` @ v4.25.1) · **Versão:** 4.25.1 → **4.26.0** (MINOR)
**Tema:** Base do Design System — consolidação, guard-rails e biblioteca de primitivos. **SEM migration** (frontend/tooling). **ADR-0129** (operacionaliza o 0103). **Empreitada contínua única com CHECKPOINT interno** (Fase A → aval do Yan → Fase B). **Merge e deploy ficam com o usuário.**

## Invariante central
**Consolidar a referência, NÃO mudar o pixel.** Nenhuma cor renderizada muda por consolidação. Mudanças visuais **intencionais** (correções de divergência, não regressão): (1) auth `#1A1814→#2D2A26`; (2) cores off-palette do Tailwind → tokens do DS (emerald→success etc.); (3) `--primary` azul `#2563eb` → `--brand-deep`/`--brand`.

---

## FASE A — base anti-regressão (3 commits) — validada no CHECKPOINT, aval dado

### A1 — Consolidação de tokens (`978e32e`)
- **Cor de setor 4→1:** `tokens.css --setor-*` = fonte única. `historico-12m-chart`, `RitmoDiarioChart`, `HistoricoMensalChart`, `mix-setor-chart`, `mix-setor-table` agora usam `SETOR_COLORS` (`@/lib/config`). DB `dim_setor_macro.cor_hex` **não renderiza mais** (valores idênticos `#378ADD`/`#BA7517`/`#0F6E56` → pixel intacto; sem migration — **reportado** como item de dado a aposentar no futuro).
- **`@theme inline`** passou a expor positive/negative/neutral, action-*, gestao*, setor-*, subsetor-*, chart-* como utilitárias (aditivo).
- **Micro-texto** `--text-2xs` (11px) / `--text-3xs` (10px) — em **px** (byte-equivalente a `text-[11px]`/`[10px]`).
- **Removido `--primary` azul legado** (`#2563eb`): `historico-12m` emphasis → `--brand-deep`; `kpi-detail-drawer` linha → `--brand`.

### A2 — ~126 cores cruas → tokens (`56317b2`, 36 arquivos)
emerald/green→success, red→danger, amber/yellow→warning, blue de plataforma→action-*/`focus-ring` (ADR-0103). Auth `#1A1814`→`var(--text-primary)` (correção consciente), `#75777B`→`var(--text-muted)` (idêntico). composicao: endpoints da paleta → `var(--positive*/--negative*)`. **ZINC intocado.** calendário: rgba de alpha dinâmico/gradiente mantidos (não idênticos ao token sólido).

### A3 — Guard-rails (`d31d4af`)
- Lint **`wt/no-cor-hardcoded`** (irmã da `no-tailwind-var-shorthand`): cor crua do Tailwind + hex em classe = **error**. ZINC permitido; `src/lib/email/**` isento (`files:` override). **Provado** com sonda (dispara em `text-emerald-500`/`bg-[#hex]`/`hover:bg-amber-50`; zinc não).
- **`src/styles/tokens.test.ts`**: falha se token-âncora sumir de `tokens.css`, se um tema parar de redefinir `--brand`, se `--text-primary ≠ #2D2A26`, ou se `--primary` azul voltar.
- **ADR-0129** (estende o 0103). Reforço no CLAUDE.md.

---

## FASE B — biblioteca de primitivos (após o aval; "focado e seguro")

Decisão de profundidade confirmada pelo Yan no checkpoint: **focado e seguro** — criar todos os primitivos + dedups zero-risco + migrar só os clusters de **exato-casamento** (byte-equivalente, verificável); one-offs heterogêneos ficam (go-forward usa os primitivos). Motivo: byte-equivalência de ~175 botões/~43 inputs heterogêneos **não é verificável visualmente daqui** sem navegador.

### Primitivos criados — `src/components/ui/`
`button.tsx` (`Button`: sólido/contorno/ghost/ícone/ícone-borda/livre), `field.tsx` (`Input`/`Select`/`Textarea`, envolvem `CAMPO`/`CAMPO_COMPACTO`), `badge.tsx` (`Badge`: success/danger/warning/brand/gestao/neutro/count), `tabs.tsx` (`Tabs`, ARIA tablist), `tooltip.tsx` (`Tooltip`). Cores via token; foco `.foco-neutro`.

### Dedups + migrações byte-equivalentes
- `PILL_BASE` local (4 de 5 arquivos) → `PILL_FILTRO`/`PILL_FILTRO_SM`/`_INATIVO`/`_ATIVO_STYLE` em `shared/botoes`. (`gerencial-section` ficou local: o PILL_BASE de lá não tem `whitespace-nowrap` → import quebraria a byte-equivalência.)
- `ICON_BTN`/`ICON_NEUTRO`/`ICON_PERIGO` (aba-usuarios, tipos-content) → `<Button variant="icone-borda" tone=...>`.
- Badge de contagem (sidebar, solicitacoes-content) → `<Badge variant="count">`.
- Campos `CAMPO`/`CAMPO_COMPACTO` → `<Input>`/`<Select>`/`<Textarea>` (auth + modais).
- Micro-texto `text-[11px]`→`text-2xs`, `text-[10px]`→`text-3xs` (px, byte-equivalente; 41+21 arquivos).

### Cheiros
`FaixaMensagem` e `botoes.ts` movidos `admin/acessos/` → `shared/` (imports atualizados, incl. relativos). Página `/admin/design-system` ressincronizada (`--text-primary #2D2A26`; path do `botoes`; primitivos novos na tabela). `docs/design-system.md` corrigido (temas Trips/Corp, version, nota v4.26 + lint).

### Não migrado (one-offs / não exato-casamento — go-forward)
CTA sólido de auth (variância py-2/2.5, foco), botões-ícone ghost (variância p-1/p-1.5/p-2 + foco), célula-botão do calendário (style dinâmico), aba reabrir-sidebar, `card-tabela-vermais` (classe CSS), hover via JS imperativo no `periodo-filter`, tabs do gerencial (tema dourado, sem ARIA), tooltip do `kpi-card` (wrapper `flex-1`). `Tabs`/`Tooltip` criados como go-forward (consumidor atual estrutural ≠ exato). `acaoBadge`→`format.ts` deixado como follow-up (helper de 1 consumidor).

---

## Gates
`tsc --noEmit` **0** · `npm test` **180** (+6 do `tokens.test`) · `next build` **limpo (exit 0)** · `lint` **regras v4.26 VERDE** (0 violações de `no-cor-hardcoded`/`no-tailwind-var-shorthand`); restam **10 erros `react-hooks` de baseline** (pré-existentes, fora de escopo). Greps de sanidade: 0 cor crua, 0 `text-[11px]/[10px]`, `PILL_BASE`/`ICON_BTN` só onde documentado.

## ⚠️ Conferência visual (o gate automático não vê "ficou igual")
A empreitada é visual. Conferir no preview do PR, em especial: gráficos cross-setor (cores de setor inalteradas), marcador "mês atual" do historico-12m (agora `--brand-deep`), badges de status, telas de auth (texto `#2D2A26`), campos migrados a `<Input>`, pills de filtro.

## Decisão de design sinalizada (confirmar)
`--primary` azul → `--brand-deep` no "mês atual" (historico-12m): na Executiva (tema *group*) é cinza-escuro, ênfase passa a vir do **negrito**. Alternativas se quiser mais contraste: `--text-primary`/`--neutral`.

## Migrations / ADRs
- **SEM migration.** ADR **0129** (enforcement de token; estende 0103).

## Pendências / follow-ups
- `acaoBadge` → `format.ts` (co-locação; 1 consumidor).
- `gerencial-section` PILL_BASE local (whitespace-nowrap) — unificar com uma variante sem-nowrap se desejado.
- One-offs heterogêneos de botão/campo (migração incremental quando tocados).
- **FORA (decisão à parte):** ~1.162 `zinc` (tokenizar) → depois paleta fechada `@theme … initial` (guard-rail definitivo); decisão de produto da v5.0 (assimetria Weddings × Trips/Corp).

## Arquivos (resumo)
Tokens/CSS: `globals.css`, `tokens.css` (via teste). Primitivos: `src/components/ui/{button,field,badge,tabs,tooltip}.tsx`. Consts: `shared/botoes.ts` (+`PILL_FILTRO*`). Lint/teste: `eslint.config.mjs`, `src/styles/tokens.test.ts`. Docs: `docs/adr/0129-*.md`, `docs/design-system.md`, `admin/design-system/page.tsx`, `CLAUDE.md`. + ~90 arquivos de componentes/telas (cores→token, micro-texto, migrações). Release: `package.json`, `CHANGELOG.md`, `changelog-diretoria.ts`.
