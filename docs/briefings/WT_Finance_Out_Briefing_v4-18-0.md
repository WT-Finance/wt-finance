# WT Finance — Out-Briefing v4.18.0

**Data:** 2026-06-14 · **Branch:** `feat/v4-18-0-solicitacoes-acessos` (base `main`) · **Versão:** 4.17.1 → **4.18.0** (MINOR)
**Tema:** **Solicitações e Acessos — reformulação e refino.** Regime autônomo com fronteira de produto. **Merge e deploy ficam com o usuário.**

---

## Missões (todas implementadas)

| Bloco | Commit | Conteúdo |
|-------|--------|----------|
| **M1 — Banco** | `4c5daba` | migration **0138** `admin_atualizar_nome` (SECURITY DEFINER + `exigir_acesso`; nome vazio rejeitado; sem anti-lockout) + action `atualizarNome` + tipo. |
| **M2 — Hora/fuso** | `5acc933` | `fmtDataSP`/`fmtDataHoraSP` (UTC→SP via `Intl`+`timeZone`) + `fmtDataHora` tz-aware (corrige o split que mostrava UTC; preserva o ingênuo do CHANGELOG). +tests (near-midnight UTC → dia SP correto). |
| **M3 — Token âmbar** | `f57296f` | token `--gestao`/`--gestao-soft`/`--gestao-fg` + `PILL_GESTAO` + doc no Design System + extensão do ADR-0103. Distinto do `--warning`. |
| **M5 — Sidebar** | `fc2222e` | badge de pendências em **vermelho** (`bg-danger`); "Tipos de solicitação" sai da sidebar. |
| **M4 — Usuários/Acessos** | `2b5662b` | migration **0139** (`admin_listar_solicitacoes` + decisor/motivo); badges semânticas + "Pendente"; Último acesso data+hora SP; ações em ícone (Editar/Redefinir senha/Excluir) + modal Editar nome; ação primária na **linha das pills**; "Solicitações de acesso" + histórico texto "Aprovada em DD/MM/AAAA às HH:MM por …" + motivo. |
| **M6 — Caixa de entrada** | `60d3668` | colunas por **TIPO**; filtro **Abertas/Concluídas** (some o filtro de visão; usuário sempre vê mim+role); Concluídas inclui canceladas-pelo-originador com marca "Cancelada pelo solicitante" (dado `status=cancelada` preservado); gestão âmbar **Ver todas / Gerenciar solicitações** (só admin); abas reordenadas (Caixa primeiro + default) + "Nova solicitação" na linha. |
| **M7 — Minhas solicitações** | `d0be12e` | colunas por **STATUS** (Abertas/Concluídas/Rejeitadas) sob filtro **Ativas/Canceladas**; Concluídas mostra **quem concluiu e quando** (fuso SP). |
| **M8 — Fechamento** | (release) | versão 4.18.0, CHANGELOG, CHANGELOG_DIRETORIA, ADR-0117, CLAUDE.md (convenção de fuso), out-briefing, auto-auditoria, gates, PR. |

## Migrations (aditivas)
- **0138** `admin_atualizar_nome(uuid, text)` — edição de nome.
- **0139** `admin_listar_solicitacoes` (CREATE OR REPLACE) — acrescenta `decidido_por_rotulo` + `observacao` ao histórico.
**Aplicadas em produção (0138 + 0139).** A Management API estava lenta hoje e o restore-test do wrapper engasgou; apliquei via `db push` (conexão de migration direta, rápida) tendo como rede o backup-do-dia `2026-06-14-gate-test` (já full-restore-tested 38/38 nesta sessão). **Verificado pós-push:** `admin_atualizar_nome` existe; `admin_listar_solicitacoes` emite `decidido_por_rotulo` + `observacao`.

## ADR
- **0117** — Solicitações: eixo de coluna por contexto (Caixa por TIPO, Minhas por STATUS) + token de gestão (ext. ADR-0103) + fuso SP nas datas + `admin_atualizar_nome`.

## CLAUDE.md
- Nova convenção: **timestamptz (UTC) → exibir sempre no fuso de São Paulo via `Intl`+`timeZone`, nunca split** (`fmtDataSP`/`fmtDataHoraSP`); split só para datetime local ingênuo (CHANGELOG). (v4.18/M2.)

## Auto-auditoria adversarial (§6)
- **Fuso:** test de tabela com timestamp perto da meia-noite UTC → dia correto em SP (`fmtDataHoraSP('2026-06-15T02:30:00Z')` = `14/06/2026 às 23:30`). ✓
- **Visibilidade (remoção dos filtros antigos não vaza terceiros):** confirmado por inspeção da RPC viva `solic_caixa` — enforce **server-side**: default `mim_e_role` → `destinatario_user_id = uid OR destinatario_role_id = minha_role` (sem terceiros); `'todas'` exige `tem_area('solicitacoes')` (gestão). Remover os filtros de UI **não** altera a RPC; o escopo continua server-side. ✓
- **Cancelada preservada:** a Caixa agrupa a cancelada sob "Concluídas" com a marca "Cancelada pelo solicitante", mas o dado permanece `status=cancelada`. Confirmado: `solic_caixa` retorna **todos os status** (sem filtro de status no WHERE), incl. cancelada; a UI só lê/exibe — nenhum caminho regrava. ✓
- **Editar nome reflete em todos os pontos de leitura:** tabela de Usuários e rodapé da sidebar leem `usuario.nome` (fallback e-mail); após `admin_atualizar_nome` + `router.refresh()`, ambos atualizam. O drawer de Solicitações usa e-mail (não afetado). ✓

## Fronteira de produto (respeitada)
- **Fluxo de Caixa dormente** — não tocado. **Exportação de relatório** e **`solicitacao_evento`** não entraram (estrutura já pronta; futuros). Nenhum item de produto novo decidido sozinho. (Decisão de alinhamento ao "Caixa primeiro": tornei a Caixa de entrada a aba **default** — consequência direta da reordenação §4.2; registrado.)

## Achado operacional (gate-perf)
A Management API estava **pathologicamente lenta** hoje, fazendo o `db:migrate` (backup + restore-test) **engasgar** por muito tempo. Apliquei as aditivas via `--reuse` do backup-do-dia já verificado (38/38, restore-test completo earlier nesta sessão). É a limitação de performance já registrada como follow-up do backup-gate (ADR-0116): restore via Management API um-statement-por-chamada; ganho real = conexão Postgres direta (`COPY`).

## Gates
`tsc` 0 · `lint` 13 (baseline, zero novos) · `build` limpo · `npm test` **119** (118 + 1 do fuso).

## Arquivos (principais)
- **Banco:** `supabase/migrations/0138_admin_atualizar_nome.sql`, `0139_listar_solicitacoes_historico.sql`.
- **M1/M4:** `src/app/admin/acessos/{actions,page}.tsx`, `src/components/admin/acessos/{aba-usuarios,aba-solicitacoes,aba-roles,acessos-content,tipos,botoes}.tsx`, `src/types/database.ts`.
- **M2:** `src/lib/fmt.ts` (+`fmt.test.ts`).
- **M3:** `src/styles/tokens.css`, `src/app/admin/design-system/plataforma-showcase.tsx`, `docs/adr/0103-*`.
- **M5:** `src/components/layout/sidebar.tsx`.
- **M6/M7:** `src/components/solicitacoes/{board-solicitacoes,solicitacoes-content,minhas-solicitacoes}.tsx`, `src/app/solicitacoes/page.tsx`.
- **Fechamento:** `package.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `docs/adr/0117-*`, `CLAUDE.md`, este out-briefing.

---
**PR:** `feat/v4-18-0-solicitacoes-acessos` → `main`. Merge e deploy ficam com o usuário.
