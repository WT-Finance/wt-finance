# ADR-0120 — Número de referência por solicitação + auditoria de movimentações navegável

**Status:** Aceito (v4.20.0, 2026-06-15)
**Relacionado:** ADR-0117 (Solicitações — eixo por contexto), ADR-0118 (regra de data por campo). Estende a auditoria de Movimentações introduzida na v4.19.1.
**Escopo:** UI de Solicitações/Movimentações + um ajuste de tooling (backup-gate worktree-aware). **Sem migration.**

## Contexto

A v4.19.1 entregou a página de auditoria de **Movimentações** (lista única derivada das colunas de `app.solicitacao`, gestão-only). Faltavam três coisas para o uso real:

1. **Identificar uma solicitação por um número.** A solicitação não exibia nenhum identificador legível — gestor e solicitante não tinham como se referir a "o pedido tal" sem descrever o conteúdo. A PK `app.solicitacao.id` (`bigint GENERATED ALWAYS AS IDENTITY`) já viajava em todos os payloads, mas nunca era mostrada.
2. **A auditoria não era pesquisável nem navegável.** A lista mostrava uma coluna `Detalhe` (texto solto, incluindo a justificativa de rejeição) mas não dava para buscar, ordenar, nem abrir a solicitação por trás de uma linha.
3. **O backup-gate assumia a raiz do `main`.** `REPO` em `scripts/db-gate/` era hardcoded; rodado de uma worktree, o `db push` corria do `main` (cego à migration da worktree).

## Decisão

### 1. Número de referência = `id` cru, sem renumerar

O número de referência exibido é o **`app.solicitacao.id` literal** (`#8`), em 3 superfícies (card da caixa, card de "Minhas", subtítulo do drawer). **Apenas exibição** — sem RPC, sem migration, sem coluna nova.

**Aceita-se lacunas.** O `id` é `GENERATED ALWAYS AS IDENTITY` e tem buracos por design (rollback de transação, deleção) — confirmado em produção (ids `[5, 7, 8]`, count 3, max 8). Optou-se por **expor o número cru com lacunas**, como número de nota fiscal/pedido, em vez de:
- **renumerar** (quebraria a identidade estável de uma solicitação ao longo do tempo), ou
- **materializar uma coluna contígua** (`numero` sequencial sem buracos) — custo de migration + manutenção (gap-fill, concorrência) desproporcional ao ganho cosmético. Decisão de produto do Yan: lacuna é aceitável.

### 2. Movimentações: visual semântico + busca/ordenação client-side + linha → drawer

- **Visual:** colunas **Usuário · Ação · Solicitação · Quando**; coluna **Detalhe removida** (a justificativa migra para o drawer); Solicitação mostra **só o número** (`#id`); ações em **particípio** (aberta/concluída/rejeitada/cancelada); **badges em tokens semânticos** (`success`/`danger`/`warning`/neutro), nunca hex. `cancelada` usa `warning` (âmbar) **distinto do `--gestao`** (também âmbar, mas é a identidade da área, não um estado).
- **Busca e ordenação:** ambas **client-side** sobre a lista já carregada por `getMovimentacoes()` (a página continua server-fetch, gestão-only). Busca única casa contra **todas as colunas** (incl. o particípio exibido e o `#id`). Ordenação por cabeçalho; default **Quando desc**. `Array.sort` é estável (ES2019+) → empates preservam a ordem da RPC. **Sem RPC nova, sem paginação** (volume baixo; `max_rows=1000` cobre).
- **Linha clicável → drawer:** a linha chama `detalheSolicitacao(id)`, uma **server action** nova em `src/app/solicitacoes/actions.ts`, porque `@/lib/solicitacoes/rpc.ts` é `import 'server-only'` e não pode ser chamada de um client component. A action faz `requireAreaAction('solicitacoes')` e delega a `getDetalhe` → abre o **`DrawerSolicitacao`** reaproveitável (mesmo componente das outras telas). A **justificativa de rejeição** — antes na coluna Detalhe — passa a aparecer no drawer, **sem se perder**.

**Autorização não foi reaberta.** A página é gestão-only (`requireArea('solicitacoes')`); a RPC `solic_detalhe` refina por `pode_ver_solic` (`tem_area('solicitacoes') OR <participante>`) → gestor vê qualquer; não-participante sem área → `null` (a UI mostra "não foi possível abrir"). A camada de `detalheSolicitacao` repete o guard de superfície.

### 3. Backup-gate worktree-aware

`REPO` deixa de ser hardcoded e resolve o **checkout atual**: `git rev-parse --show-toplevel` na `cwd`, fallback `process.cwd()`. **Fonte única** em `scripts/db-gate/lib.mjs`; `gate.mjs`/`migrate.mjs` importam (removem o `const REPO` local). **Não afeta o backup-gate**: a conexão com produção é por `SUPABASE_DB_URL` (independe do `REPO`); a mudança só corrige a `cwd` do export e do `db push`, que agora enxergam a migration da worktree e continuam funcionando do `main`.

## Consequências

- **Positivas:** solicitação ganha identidade legível e estável; auditoria deixa de ser uma lista morta (busca, ordena, navega); zero superfície de banco nova (sem migration, sem RPC, sem grant) → risco mínimo; `db:migrate` passa a funcionar de dentro de uma worktree sem o falso "Remote database is up to date".
- **Custo / atenção:** o número exibido tem lacunas — se algum dia a diretoria pedir numeração contígua, será migration + coluna materializada (registrado aqui como alternativa rejeitada, não esquecida). O `detalheSolicitacao` é mais uma server action a manter no guard de área (já coberta pelo padrão `requireAreaAction`).
- **Sem mudança de contrato:** nenhuma RPC ou schema Zod mudou (`solic_detalhe`/`solicitacaoSchema`/`movimentacaoSchema` intactos) → `rpc-contrato.test.ts` segue verde sem novo caso.
