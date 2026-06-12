# WT Finance — Out-Briefing v4.14.3

**Data:** 2026-06-12 · **Branch:** `fix/v4-14-3-design-system-doc` · **Versão:** 4.14.2 → **4.14.3** (PATCH)
**Tema:** Documentação viva do Design System (`/admin/design-system`) atualizada para refletir a família de tokens neutros de plataforma introduzida nas v4.14.1/v4.14.2. **Regime normal.** **Nenhum código de produto muda; sem migration.** Merge e deploy permanecem com o usuário.

> Origem: investigação somente-leitura (2026-06-12) confirmou deriva entre o design system real e a página de doc. Decisão do Yan: zerar as ausências com demos ao vivo (esforço M aceito).

---

## Missões / commits

| Commit | Conteúdo |
|--------|----------|
| `docs(design-system): tokens neutros no ColorGrid e correções do §10` | **A-m1** — §1: 6 tokens neutros (`--action-primary*`, `--action-soft*`, `--focus-ring`) + nota sobre o swatch `--brand` resolver neutro no tema group da página. §10: corrige caminho de `PeriodoFilterPillsUrl` (`shared/`), adiciona `PeriodoPillsUrl`, `AuthHeader`, `Checkbox`, `ModalCentral`, `botoes.ts`. |
| `docs(design-system): seção Plataforma com regra ADR-0103 e demos ao vivo` | **A-m2** — Seção 11 nova "Plataforma (auth/admin)": regra setor × plataforma (ADR-0103 ext.) + porquê dos tokens dedicados; novo client component `plataforma-showcase.tsx` com demos ao vivo (hierarquia de botões, pill bege, foco `:focus-visible`, Checkbox, CTA sólido). Item no índice. |
| `docs(claude-md): out-briefing no DoD e regra de addendum pós-merge` | **A-m3** — CLAUDE.md: out-briefing é parte do DoD (não pós-entrega; precedente v4.14.1); addendum pós-merge vira patch novo (precedente v4.14.2). |
| `chore(release): v4.14.3` | **A-m4** — version 4.14.3, CHANGELOG, CHANGELOG_DIRETORIA, este out-briefing. |

## Migrations / ADRs
- **Nenhuma migration.** Patch de documentação.
- **Nenhum ADR novo** — a página passa a documentar a extensão do ADR-0103 já existente (v4.14.1).

## Arquivos
- `src/app/admin/design-system/page.tsx` (§1, §10, índice, §11).
- `src/app/admin/design-system/plataforma-showcase.tsx` (**novo**, client — demos ao vivo).
- `CLAUDE.md` (2 aprendizados), `package.json` (4.14.3), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`.

## Gates
`tsc` 0 · `npm test` 87 · `lint` 13 (baseline) · `build` limpo.

## Achados para a fila (notados ao documentar — NÃO corrigidos nesta missão, por escopo)
- A página do Design System roda sempre sob `[data-theme="group"]`, então os exemplos que usam `var(--brand)` (ex.: H2 em §4, "Ver mais" do card-clicável) renderizam em **cinza neutro**, não no dourado/turquesa real do setor. É documentação fiel ao tema da própria página, mas pode confundir quem espera ver as cores de setor "ao vivo". (Eventual melhoria: um seletor de tema na própria página para pré-visualizar os 4 temas.)
- `§8` lista as cores de IDENTIDADE de setor (`--setor-*`) mas não explica a distinção DESTAQUE `--brand` × IDENTIDADE `--setor-*` (documentada no CLAUDE.md). Candidato a uma nota futura.

## Pendências / follow-up
- Nenhuma específica desta versão.

---

**PR:** `fix/v4-14-3-design-system-doc` → main. **Ordem de merge: este PR primeiro**; a branch da v4.15.0 rebaseia depois. Merge e deploy ficam com o usuário.
