# Out-briefing — v5.1.9 · Ajustes de UI e permissões

**Tipo:** PATCH · migration **0184 (DESTRUTIVA — só rótulo, aplicada pelo Yan)** · **SEM ADR** · base main @ v5.1.8.

## Entregas (7 itens pedidos pelo Yan)

| # | Entrega | Arquivos |
|---|---|---|
| 1 | **Auto-refresh na Comparação** (`/metas/comparacao`) — converge ao Monde sem reload (5 min), como o Acompanhamento/TV | `src/app/metas/comparacao/page.tsx` |
| 2 | **Cadastro de Clientes responsivo** — Empresa (`w-[8.5rem] md:w-[22%]`) e Forma pgto (`w-[76px] md:w-[100px]`) encolhem em telas menores | `src/components/financeiro/cadastro-clientes.tsx` |
| 3 | **Botão "Modo de Comparação"** (âmbar gestão, `GitCompare`) à esquerda do "Modo de Exibição", gated por `metas` (Cadastro); remove o link discreto "Comparação (Monde)" | `src/components/metas/acompanhamento-content.tsx`, `src/app/metas/page.tsx` |
| 4 | **Rótulos de Metas** → "Metas/Cadastro" (`metas`) e "Metas/Acompanhamento" (`metas/acompanhamento`) — só rótulo; chaves/guards/RPCs intocados | `src/lib/auth/areas.ts` (fallback) + **migration 0184** (rbac_areas) |
| 5 | **Faixa "Administração" → badge âmbar** (canto sup. direito, `VenetianMask`, tokens gestão); conteúdo sobe (sem gap) | `src/app/admin/layout.tsx` |
| 6 | **Sidebar reordenada** (Metas acima de Financeiro; Solicitações acima de Upload) | `src/components/layout/sidebar.tsx` |
| 7 | **Aviso "em construção":** link "Metas" + cores uniformes; **ícone de alerta** na sidebar nos itens gated (Executiva, Performance/Geral) | `src/components/shared/em-construcao.tsx`, `src/components/layout/{sidebar,nav-group}.tsx` |

## Decisões (para sua conferência no preview)

- **Badge âmbar = tokens `gestao`** (`border-gestao`/`bg-gestao-soft`/`text-gestao-fg`) — a badge "PRODUÇÃO" que você apontou é **NEUTRA** por decisão de design; o âmbar canônico "admin/gestão só-admin" do DS é o `gestao`. Usei esse.
- **Ícone do badge Admin:** `VenetianMask` (máscara — o "agente secreto/incógnito" canônico do lucide). Alternativas disponíveis: `Glasses`, `HatGlasses`, `ShieldUser`.
- **Badge Admin em fluxo normal** (linha à direita, não `absolute`) — evita colidir com controles top-right das páginas (ex.: o refresh de `/admin/uploads`). Se preferir inline com o título de cada página, é outro ajuste.
- **Botão "Modo de Comparação"** com a forma `rounded-lg` (igual ao vizinho "Modo de Exibição"), não pill — coerência com o botão ao lado.
- **Ícone de alerta "em construção":** `TriangleAlert` (`text-warning`), à direita do item.

## ⚠️ Migration 0184 — VOCÊ aplica (DESTRUTIVA por classificação)

O rename de rótulo é `UPDATE app.rbac_areas SET rotulo = ...` → o classificador marca **destrutiva** (mesmo sendo só texto de exibição; precedente 0168). O agente **não aplica** destrutiva (aborta em não-TTY). **Você aplica:** `npm run db:migrate -- --destrutiva` no terminal. Até lá, o modal de Usuários e Acessos mostra os rótulos antigos ("Metas" / "Metas — Acompanhamento") — o `areas.ts` já tem os novos como fallback. Reversível (bloco DOWN na 0184). O resto do patch funciona no deploy, independente da migration.

## Gates

`npx tsc --noEmit` · `npx eslint` (arquivos alterados) · `npm test` · `npx next build` — [preencher]. **revisor** + **revisor-db** (migration 0184) — [preencher]. Sem ADR.

## Pendências (inalteradas)

- (após esta) você aplicar a **0184** (rótulos) em TTY.
- (seguem) teste de contrato do `monde_ingest_status`; `CRON_SECRET` constant-time; `SMTP_*`; `%Rec` no Cadastro; **Scope B** (aposentar o upload).
