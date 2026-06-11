# WT Finance — Out-Briefing v4.14.2

**Data:** 2026-06-11 · **Branch:** `fix/v4-14-1-acessos-ds` · **Versão:** 4.14.1 → **4.14.2** (PATCH)
**Tema:** Continuação dos refinamentos de plataforma da 4.14.1 — Design System no menu, nomenclatura mais clara na administração e botões da página de acessos alinhados às pills de período do Financeiro. ADR-0103 (extensão, já registrada na 4.14.1). **Merge e deploy permanecem com o usuário.**

> Contexto: estes ajustes foram pedidos "para fechar a 4.14.1", mas o PR #105 (4.14.1) já havia sido mergeado antes deles. Por isso foram para um PR separado (**#106**) e, a pedido, fecham como **4.14.2**.

---

## Missões / commits

| Commit | Conteúdo |
|--------|----------|
| `a7c0917` | **Design System como aba na sidebar** (`/admin/design-system`, ícone Palette), gated pela permissão `admin/design-system`. Só front-end: a área já existia e o Administrador já a tinha; faltava o item no menu. |
| `9ce34a3` | **Renomes:** "Usuários & Acessos" → "Usuários e Acessos"; aba/termos "Roles" → "Permissões" (app) + **migration 0126** (rótulo no banco). |
| `07af77c` | **Botões da página de acessos no formato pill** + renomes role→permissão nos componentes. |
| `4139e98` | **Correção de cor:** pill primária e aba ativa no **bege suave** (`--action-soft`), não no preenchido escuro `--action-primary`; **Design System reordenado** para depois de "Usuários e Acessos". |
| (foco) | **Anel de foco só em `:focus-visible`** (`.foco-neutro`): clique de mouse não deixa "sombreado". |
| (versão) | 4.14.2 + CHANGELOG + CHANGELOG_DIRETORIA + CLAUDE.md + out-briefing. |

## Migration (aplicada em produção, com confirmação)
- **0126** `rotulo_usuarios_e_acessos`: `UPDATE app.rbac_areas SET rotulo='Usuários e Acessos' WHERE area='admin/acessos'`. Cosmética (o modal de Permissões e os chips leem o rótulo do banco via `admin_listar_areas`); idempotente; não altera chaves, permissões nem guards. Verificada via `db query`.

## Decisões de design
- **Pill de plataforma = bege suave do tema group**, via tokens neutros DEDICADOS (`--action-soft` #EAE6DD / `--action-soft-border` #75777B / `--action-soft-fg` #4B4F54) — espelham o ativo das pills de período (que no Financeiro, tema group, são bege), **sem usar `var(--brand)`** (evita flash dourado pré-hidratação). Hierarquia: primária/aba ativa = bege; secundária = cinza contornada; destrutiva = perigo. Centralizado em `src/components/admin/acessos/botoes.ts`. (Escopo confirmado por AskUserQuestion: "Todos, com hierarquia".)
- **`--action-primary` (#3F4144 escuro)** permanece para CTA sólido das telas públicas (ex.: botão Entrar do login) — não foi alterado.
- **Foco só em `:focus-visible`**: padrão acessível (teclado mostra o anel; mouse não deixa sombreado; inputs de texto seguem com anel ao clicar).

## Gates
`tsc` 0 · `npm test` 87 · `lint` 13 (baseline) · `build` limpo.

## Smoke no preview (sessão admin de teste descartável; 0 resíduo em produção)
- Addendum (deploy da branch): 11/12 (o 1 é a página Design System exibir `#BD965C` — esperado, é o swatch documentado da paleta).
- Cor/ordem: **5/5** — pill no bege `--action-soft`, sem fundo escuro de botão, aba ativa bege, sem dourado servido, Design System após "Usuários e Acessos" na sidebar.

## Arquivos (principais)
- **Tokens/CSS:** `src/styles/tokens.css` (`--action-soft*`), `src/app/globals.css` (`.foco-neutro` → `:focus-visible`).
- **Sidebar/áreas:** `src/components/layout/sidebar.tsx` (item Design System + ordem + rótulo), `src/lib/auth/areas.ts` (rótulo).
- **Acessos:** `src/components/admin/acessos/{botoes.ts (novo),acessos-content,aba-usuarios,aba-roles,aba-solicitacoes,modal-role,modal-convidar}.tsx`.
- **Banco:** `supabase/migrations/0126_rotulo_usuarios_e_acessos.sql`.
- **Versão/docs:** `package.json` (4.14.2), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `CLAUDE.md`, este out-briefing.

## Pendências / follow-up
- Nenhuma nova. (SMTP próprio segue como pendência herdada da v4.14 — entrega de senha/links continua manual até configurar.)

---

**PR:** [#106](https://github.com/WT-Finance/wt-finance/pull/106) — `fix/v4-14-1-acessos-ds` → `main`. Merge e deploy ficam com o usuário.
