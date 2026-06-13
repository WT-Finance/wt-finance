# WT Finance — Out-Briefing v4.16.1

**Data:** 2026-06-13 · **Branch:** `fix/v4-16-1-design-revisao` (empilhada sobre `feat/v4-16-0-solicitacoes`) · **Versão:** 4.16.0 → **4.16.1** (PATCH)
**Tema:** Revisão de **design / UX / acessibilidade / desempenho** das telas internas (Solicitações, Usuários e Acessos, Design System), padronizando coerência entre elas. **UI-only — sem migration.** **Merge e deploy ficam com o usuário.**

> Pedido do Yan (regime autônomo): "padronizar o quanto possível o design das telas, melhorar usabilidade/UX e desempenho; aplique tudo que não seja crítico de forma autônoma, mantendo como desfazer." Esta versão entrega isso + o relatório de achados (aplicados × registrados).

---

## Como foi feito (método)
1. **F1 — Respiro vertical único:** o `<main>` do AppShell passou a concentrar o padding topo/base (`py-8`); os **11 containers de página** perderam o `py` ad-hoc (4 ritmos diferentes; Acessos estava "grudado" no topo, mesmo bug das Solicitações). Documentado no **Design System §12** e no CLAUDE.md.
2. **F2 — Auditoria multi-lente (workflow):** 9 revisores (3 telas × lentes *coerência visual*, *UX/a11y*, *desempenho*) + verificador adversarial por achado → **91 achados únicos**, triados em aplicar / registrar / descartar. (Parte dos verificadores caiu no limite de sessão; re-triei manualmente.)
3. **F3 — Implementação:** fundação compartilhada (eu) + **20 editores em paralelo** (um por arquivo, arquivos disjuntos, consumindo a fundação) + reconciliação/correção de lacunas cross-file (eu) + gates.

## Achado HEADLINE (causa-raiz da incoerência)
**Shorthand de CSS var do Tailwind v4 quebrado em todo o app.** `text-[--token]` (forma v3) compila para `color:--token` — **CSS inválido** — então a cor do token era **silenciosamente descartada** e o texto caía na cor herdada. Confirmado no CSS compilado (`.text-\[--text-muted\]{color:--text-muted}`). **81 ocorrências em 26 arquivos** migradas para `[var(--token)]` (mesma forma das 111 já corretas). Commit isolado (`acf4b6e`) — revertível à parte se quiser limitar o alcance.

## Mudanças aplicadas (47 achados + fundação)
**Fundação compartilhada** (`1a132f8`): `@/lib/ui/overlay-stack` (Esc fecha só o overlay do topo — corrige modal-sobre-drawer); `@/lib/ui/campos` (`CAMPO`/`CAMPO_COMPACTO`, antes duplicado/divergente em 5 arquivos); `ConfirmModal` (confirmação destrutiva no DS); `ModalCentral`/`ListDrawer` com foco inicial+restauração e semântica de diálogo; `.card-clicavel-neutra` (afordância neutra de plataforma).

**Usuários e Acessos** (`f49fcaf`): tabelas → `CardTabela` (table-fixed/colgroup, cabeçalho padrão, sem borda/thead destacados) **preservando contagem e colunas**; pills → `botoes.ts`; erros → `FaixaMensagem`; modais → `ModalCentral`; `window.confirm` → `ConfirmModal`/`ModalCentral`; badge "Rejeitada" vermelho; datas sem deslocar dia; a11y (aria-label na senha, title em truncados, Aprovar explica desabilitação); estado otimista de permissão reconciliado; `isPending` usado; `revalidatePath` fora do `finally`; "role" → "permissão" em textos visíveis.

**Solicitações** (`45f9153`): cards/linhas clicáveis acessíveis por teclado + hover neutro; Concluir expõe erro; Cancelar pede confirmação; download de anexo à prova de popup-blocker + spinner; envio bloqueado com anexo subindo/erro; grid responsivo + autoFocus; pills com semântica de tabs + feedback de navegação; **página busca só a lista da view atual**; erro de carga visível; tabela de tipos sem clipar ações; `fmtValor` não lê milhar pt-BR como decimal; formatter de data memoizado; `getPendencias` com `React.cache()`.

**Design System** (`9f99e42`): header/container alinhados ao próprio §12; checkbox sem `label` aninhado + cursor; demos sem animação no mount; `title` em token truncado.

## Registrados — NÃO aplicados (decisão sua / patch futuro)
| # | Achado | Por que não entrou agora |
|---|--------|--------------------------|
| 1 | Desativar/reativar usuário e "Link de acesso" sem botão na UI (actions órfãs) | **Produto:** expor essas ações é decisão sua de UX/fluxo. |
| 2 | Histórico de solicitações de acesso sem paginação (`admin_listar_solicitacoes` sem limite) | **Produto:** paginação/limite é decisão de UX; cresce com o tempo. |
| 3 | Listas de Solicitações trazem respostas+anexos completos por linha (`getDetalhe` órfão) | Otimizar muda o **retorno da RPC** (migration) — fora do escopo UI-only. |
| 4 | `/solicitacoes` busca `tipos`/`destinatarios` sempre (usados só no modal Nova) | Lazy-load exige fetch client-side (rota/ação nova) — maior que um patch de revisão. |
| 5 | `router.refresh()` após actions que já `revalidatePath` (render duplo) | **Mantido por segurança:** remover pode deixar a lista sem atualizar na ação imperativa. |
| 6 | `admin_listar_areas` é RPC por render p/ catálogo que já existe local | Trocar mexe no contrato de dados; baixo valor, risco desnecessário. |
| 7 | `ListDrawer` sem portal + trap de foco completo (Tab cycling) | Fiz foco inicial/restauração + Esc-stack; portal mudaria empilhamento de drawers existentes. |
| 8 | `window.confirm` "trocar tipo limpa campos" no modal Nova | Guarda de **input não-salvo** (não destrói dado) — `window.confirm` é aceitável aqui. |

## Gates
- `npx tsc --noEmit` **0 erros** · `npm run build` **limpo** (49/49 páginas) · `npm test` **96/96** · `npm run lint` **13 problems (baseline — zero novos)**.
- Sweep: 0 `text-[--token]` quebrado restante; 0 `var(var())`; 1 `window.confirm` (o item #8, intencional).

## Preview / Verificação
**Smoke 6/6 no deploy da branch** (usuário descartável com as 3 áreas, 0 resíduo): `/solicitacoes`, `/admin/acessos` (render do `CardTabela`), `/admin/design-system` (§12 "Layout de Página") e `/admin/solicitacoes` retornam 200 e renderizam; tema neutro intacto (zero `#BD965C`); anon → `/login`. (Click-through visual — alinhamento de respiro, modais, foco — fica como smoke manual recomendado antes do merge.)

## Arquivos
- **Fundação:** `src/lib/ui/{overlay-stack,campos}.ts`, `src/components/shared/{confirm-modal,modal-central,list-drawer}.tsx`, `src/app/globals.css`.
- **Telas:** `src/components/admin/acessos/*` (7), `src/components/admin/solicitacoes/tipos-content.tsx`, `src/components/solicitacoes/*` (6) + `minhas-solicitacoes.tsx`, `src/app/solicitacoes/page.tsx`, `src/app/admin/design-system/*` (3), `src/components/ui/checkbox.tsx`, `src/lib/solicitacoes/{format,rpc}.ts`.
- **App-wide (Tailwind):** 26 arquivos (cards KPI, gráficos, tabelas, shared).
- **Layout/versão/docs:** `src/components/layout/app-shell.tsx`, `package.json` (4.16.1), `CHANGELOG.md`, `CHANGELOG_DIRETORIA`, `docs/adr`/CLAUDE.md (§ respiro), este out-briefing.

---

**PR:** `fix/v4-16-1-design-revisao` → main (empilhada sobre o #110; o GitHub retargeta sozinho após o merge da v4.16.0). Merge e deploy ficam com o usuário.
