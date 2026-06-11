# WT Finance — Out-Briefing v4.14.1

**Data:** 2026-06-11 · **Branch:** `feat/v4-14-1` · **Versão:** 4.14.0 → **4.14.1** (PATCH)
**Tema:** Refino visual e de UX das telas de **plataforma** (login, trocar-senha, solicitar-acesso, sem-acesso, admin/acessos), que nasceram fora da identidade visual na v4.13/v4.14. ADR-0103 estendido (regra setor × plataforma). Sem migration. **Merge e deploy permaneceram com o usuário** (PR #105, mergeado).

> Nota: este out-briefing foi gerado em backfill (a v4.14.1 fechou sem ele; lapso de fechamento). O addendum pedido em seguida — Design System na sidebar, renomes e botões pill — fechou separadamente como **v4.14.2** (PR #106), ver `WT_Finance_Out_Briefing_v4-14-2.md`.

---

## Regra central (ADR-0103, extensão v4.14.1)
Cada setor usa sua cor de destaque nas SUAS abas (Weddings #BD965C, Trips #0091B3, Corporativo #0D5257). **As telas de plataforma** (auth, `/sem-acesso`, `/admin/*` e demais rotas não-setoriais) usam o **tema neutro do Group**. Nenhuma cor de setor atua como cor geral. O wordmark WT FINANCE é dinâmico (cor da aba no setor, neutro no resto).

**Diagnóstico (≠ hipótese inicial):** o `theme-provider` já resolvia toda rota não-`/performance/*` para `[data-theme="group"]` (neutro). O dourado vinha de `#BD965C` **hardcoded inline** nesses componentes, não de rota mal-mapeada.

## Missões / commits

| Commit | Conteúdo |
|--------|----------|
| `e0d7691` `m1` | **Tema neutro:** tokens neutros DEDICADOS no `:root` (`--action-primary` #3F4144, `--action-primary-fg`, `--focus-ring`) + utilitária `.foco-neutro`, independentes de `[data-theme]` (o `:root` tem `--brand`=#BD965C como default → `var(--brand)` daria flash dourado pré-hidratação). |
| `6886b3a` `m2` | **Telas públicas:** componente novo `AuthHeader` (logo + wordmark único nas 4 telas); labels em caixa normal (fim do UPPERCASE); banner de erro via `--danger`; login com link **"Solicitar acesso"** e o texto do esqueci-a-senha **dentro do card**, centralizado; "Voltar ao login". |
| `c732282` `m3` | **/admin/acessos:** tabela no padrão CardTabela (headers caixa normal, `colgroup`, "Último acesso" em `DD/MM/AAAA`); ações de linha reduzidas a **Senha** + **Excluir**; **Excluir** com **confirmação** (ModalCentral) e **revogação de sessão** (`auth.admin.signOut`) — herdando o que o "Desativar" fazia; pills preenchidas neutro; **Checkbox** do design system (componente novo `src/components/ui/checkbox.tsx`); chip "Usuários & Acessos" sem destaque dourado. |
| `aaf2b30` `m4` | version 4.14.1 + CHANGELOG + CHANGELOG_DIRETORIA + ADR-0103 (extensão) + CLAUDE.md. |

## ADR
- **ADR-0103 (extensão)** — regra setor × plataforma + tokens neutros dedicados das telas de plataforma (`--action-primary`/`-fg`, `--focus-ring`, `.foco-neutro`). Sem ADR novo.

## Decisões de escopo
- Selects nativos mantidos (sem Radix no projeto) — só com o foco neutralizado.
- `#1A1814`/`#75777B` (preto/cinza institucionais) preservados — são neutros, não-dourado, e cores semânticas fixas do design system.
- As RPCs de **desativar** permanecem no banco (saíram só da UI). Anti-lockout preservado.
- Não se mexeu no mecanismo da sidebar nem nos temas das abas de setor.

## Gates
`tsc` 0 · `npm test` 87 · `lint` 13 (baseline) · `build` limpo. 0 ocorrências de `#BD965C` nos arquivos tocados.

## Smoke no preview (sessão admin de teste descartável; 0 resíduo em produção)
**10/10 PASS** — as telas alcançáveis sem sessão (login, solicitar-acesso, auth/confirm) e as gated (trocar-senha, admin/acessos via sessão de teste) renderizam **neutras no deploy** (token `--action-primary` presente, **zero dourado servido**); `/admin/acessos` confirmadamente **sem** as ações "Link"/"Desativar" e com "Criar usuário".

## Arquivos (principais)
- **Tokens/CSS:** `src/styles/tokens.css` (`--action-primary*`, `--focus-ring`), `src/app/globals.css` (`.foco-neutro`).
- **Telas públicas:** `src/components/auth/auth-header.tsx` (novo), `src/app/{login,trocar-senha,solicitar-acesso,sem-acesso}/page.tsx`.
- **/admin/acessos:** `src/components/admin/acessos/{acessos-content,aba-usuarios,aba-roles,aba-solicitacoes,modal-role,modal-convidar,tipos}.tsx`, `src/components/ui/checkbox.tsx` (novo), `src/components/shared/modal-central.tsx` (uso).
- **Versão/docs:** `package.json` (4.14.1), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `docs/adr/0103-paleta-de-cores-canonica.md`, `CLAUDE.md`.

## Pendências / follow-up
- Nenhuma específica da 4.14.1. (SMTP próprio segue como pendência herdada da v4.14 — entrega de senha/links continua manual até configurar.)

---

**PR:** [#105](https://github.com/WT-Finance/wt-finance/pull/105) — `feat/v4-14-1` → `main` (mergeado). Sucessor: **v4.14.2** (PR #106).
