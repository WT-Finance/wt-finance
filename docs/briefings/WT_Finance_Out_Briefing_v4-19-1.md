# WT Finance — Out-Briefing v4.19.1

**Data:** 2026-06-15 · **Branch:** `feat/v4-19-1-movimentacoes` (base `main`) · **Versão:** 4.19.0 → **4.19.1** (PATCH)
**Tema:** **Auditoria de movimentações das solicitações.** Migration 0142 (aditiva). **Merge e deploy ficam com o usuário.**

---

## O que entrou
Botão âmbar **"Movimentações"** na página de Solicitações (gestão-only, ao lado de "Ver todas"/"Gerenciar solicitações") → nova página **`/admin/solicitacoes/movimentacoes`** com uma **lista única de auditoria** do que cada usuário fez em cada solicitação: **Abertura · Conclusão · Rejeição · Cancelamento** (quem + quando + detalhe), ordenada do mais recente. Colunas: **Quando** (fuso SP) · **Ação** · **Solicitação** (tipo #id) · **Quem** · **Detalhe** (justificativa da rejeição).

## Decisão de modelagem (sem tabela de eventos)
A lista é **DERIVADA das colunas existentes** de `app.solicitacao` — **não** há `solicitacao_evento` (segue fora de escopo, ADR-0117). Cada solicitação rende:
- **Abertura** — `solicitante_id` @ `criado_em`;
- **Decisão terminal** (só quando `status <> 'aberta'`) — `decidido_por` @ `decidido_em`, ação derivada do status (`concluida`→Conclusão, `rejeitada`→Rejeição, `cancelada`→Cancelamento), `justificativa` como detalhe.

O CHECK `solicitacao_terminal_decidido` garante `decidido_por`/`decidido_em` não-nulos quando há terminal; `decidido_por` é sempre o autor da ação (cancelamento = o próprio solicitante, por enforcement das RPCs 0128). É a realização do "relatório futuro" previsto no ADR-0117.

## Banco — migration 0142 (aditiva)
- RPC **`public.solic_movimentacoes()`** (`STABLE SECURITY DEFINER SET search_path=''`): `exigir_acesso(ARRAY['solicitacoes'])` (gestão-only) → `jsonb_agg` de uma `UNION ALL` (abertura + terminal), ordenada por `em` (timestamp real) DESC. Ator = `coalesce(nome, email)` de `app.rbac_usuarios` (convenção de histórico da 0139). `REVOKE FROM PUBLIC, anon` + `GRANT authenticated, service_role`. `NOTIFY pgrst`.
- **Aplicada em produção:** backup-gate **VERDE** (38/38 tabelas, restore-test spot 4/4 idêntico, **2,8 s** via COPY) → `db push` (aditiva). **Verificado pós-push (REST, service role):** 200, **5 movimentações** coerentes (3 aberturas + 1 conclusão + 1 cancelamento), 7 chaves exatas, ordem desc, `ator` resolvido a nome (Yan/Carine); cancelamento com ator = solicitante. Contrato `REQUIRE_CONTRACT=1` verde contra a RPC viva.

## Guarda (gestão-only)
**Gate de área** = **`requireArea('solicitacoes')`** na página (camada 2) + **`exigir_acesso(['solicitacoes'])`** na RPC + `REVOKE anon`/`GRANT authenticated` (camadas 3/4). O **proxy só exige sessão**, NÃO checa área (`proxy.ts:4-7`) — a rota vive sob `/admin/solicitacoes` por organização (irmã do admin de tipos), não por gate de proxy. O botão só aparece para `podeGestao`. Sem mudança em `areas.ts`. _(A auto-auditoria corrigiu a suposição inicial de que o proxy gateava a área via `areasDaRota` — ele não gateia; o gate real é página + RPC.)_

## Frente / fontanaria do contrato
A chave `ator` viaja RPC → `movimentacaoSchema` (Zod) → `parseRpc` → componente (`m.ator`) — nome consistente nas 3 pontas. Campos anuláveis (`ator`/`tipo_nome`/`detalhe`) são `.nullable()`; nenhum `.optional()` (a RPC emite as 7 chaves sempre). Teste de contrato cobre o shape vivo + a negação de anon.

## Gates
`tsc` 0 · `lint` 13 (baseline; **nenhum** arquivo novo flagueado — os "matches" no grep são o nome da worktree no path) · `build` **limpo** · `npm test` **122** (+1 = contrato de `solic_movimentacoes`; rodado com `REQUIRE_CONTRACT=1` → o shape da RPC nova foi `safeParse`-ado contra a **base viva** e a negação de anon confirmada).

## Auto-auditoria adversarial (§6) — VERDE (1 correção aplicada)
Cobertura por workflow adversarial (estagnou em 3/5 agentes por falha de infra do runner; os 3 concluídos = OK) + verificação direta do restante + teste vivo:
1. **Derivação correta/completa** (OK): `UNION ALL` sem dupla-contagem; o CHECK `solicitacao_terminal_decidido` (0127) garante `decidido_por`/`decidido_em` não-nulos na linha terminal; Abertura para toda solicitação (incl. aberta); ordenação por `em` (timestamp real) DESC; **cancelamento ator = solicitante** (enforcement das RPCs 0128).
2. **Gestão-only** (OK): `exigir_acesso(['solicitacoes'])` é a 1ª instrução; `REVOKE FROM PUBLIC, anon` + `GRANT authenticated, service_role`; anon e authenticated-sem-área negados. **Correção aplicada:** o comentário da página dizia que o proxy gateava a área — ele só exige sessão; o gate real é `requireArea` + RPC (corrigido na página, no CHANGELOG e aqui).
3. **Contrato/parseRpc** (verificado pelo teste vivo): `movimentacaoSchema` espelha as 7 chaves reais; anuláveis `.nullable()`; **REST 200 + `REQUIRE_CONTRACT=1` verde** = sem HTTP 500.
4. **Fuso/tokens** (verificado): `em` via `fmtDataHoraSP` (`@/lib/fmt`); tokens neutros (sem `var(--brand)`); `max-w-5xl px-4` sem `py`.
5. **Escala/timeout** (verificado): retorno em um único `jsonb_agg` (sem truncamento por `max_rows`); 2 scans de tabela pequena + subselects em `rbac_usuarios` (tiny) — folgado em 8s. Paginação = follow-up.

## Achado operacional (registrado)
**O wrapper `npm run db:migrate` tem `REPO` hardcoded para a raiz do `main`** (`scripts/db-gate/lib.mjs`/`gate.mjs`). Rodado de uma worktree, o **backup-gate roda certo** (testa produção, que é compartilhada), mas o **`db push` automático corre da raiz do `main`** — que não tem a migration da worktree → "Remote database is up to date" (não aplica). Fluxo correto p/ migration de worktree (igual v4.18/v4.19): rodar o gate para a rede e então **`db push --linked` da cwd da worktree** (que enxerga a migration nova). Follow-up: tornar o gate worktree-aware (derivar REPO de `process.cwd()`/`git rev-parse`).

## Arquivos
- **Banco:** `supabase/migrations/0142_solic_movimentacoes.sql`.
- **RPC/schema/contrato:** `src/lib/solicitacoes/schemas.ts` (movimentacaoSchema), `src/lib/solicitacoes/rpc.ts` (getMovimentacoes), `src/lib/rpc-contrato.test.ts`.
- **UI:** `src/app/admin/solicitacoes/movimentacoes/page.tsx` (nova), `src/components/solicitacoes/movimentacoes-content.tsx` (nova), `src/components/solicitacoes/solicitacoes-content.tsx` (botão).
- **Fechamento:** `package.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, este out-briefing.

## Fronteira de produto (respeitada)
Sem tabela de eventos nova; sem reabertura/reatribuição (não existem no domínio). Lista somente-leitura, gestão-only. Nada do Fluxo de Caixa tocado.

## Follow-ups (registrados)
- **Paginação** se o volume crescer muito (hoje a RPC devolve a lista inteira num jsonb — sem truncamento por `max_rows`, mas sem paginação). Filtros (por tipo/usuário/período) são candidatos.
- Gate worktree-aware (REPO dinâmico).

---
**PR:** `feat/v4-19-1-movimentacoes` → `main`. Merge e deploy ficam com o usuário.
