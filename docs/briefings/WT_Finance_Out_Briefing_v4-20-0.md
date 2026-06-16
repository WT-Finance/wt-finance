# WT Finance — Out-Briefing v4.20.0

**Data:** 2026-06-15 · **Branch:** `feat/v4-20-0-numeracao-movimentacoes` (base `main`) · **Versão:** 4.19.1 → **4.20.0** (MINOR)
**Tema:** **Número de referência por solicitação, auditoria de movimentações navegável e permissão de Solicitações em dois níveis.** Migration 0143 (aditiva). ADRs 0120 e 0121. **Merge e deploy ficam com o usuário.**

> **Adendo pré-merge (a pedido do Yan):** após as 6 missões, três ajustes foram dobrados nesta mesma versão/PR (ainda não mergeada): **(1)** confirmar o botão Movimentações gestão-only (já era — fica dentro de `podeGestao`); **(2)** **separar a permissão de Solicitações em básica + gestão** (migration 0143, ADR-0121); **(3)** remover o ponto final dos subtítulos de página. Detalhe na seção "Adendo pré-merge" abaixo.

---

## O que entrou (6 missões)

### M1 — Número de referência (#id)
Cada solicitação passa a exibir seu **número** (`#id`, a PK `app.solicitacao.id`) em 3 pontos que não o mostravam: card da **caixa-de-entrada** (gestão, `board-solicitacoes.tsx`), card de **"Minhas solicitações"** (`minhas-solicitacoes.tsx`) e **cabeçalho do drawer** (subtítulo `Solicitação #id`, `drawer-solicitacao.tsx`). **Apenas exibição** — o `id` já vinha nos payloads. **Sem RPC, sem migration.**

**Número cru, com lacunas (decisão de produto, Yan):** o `id` é `bigint GENERATED ALWAYS AS IDENTITY` e tem buracos por design (confirmado em produção: ids `[5, 7, 8]`, count 3, max 8). Expõe-se o número literal — como nota fiscal/pedido. **Não** se renumera nem se materializa coluna contígua (alternativas rejeitadas no ADR-0120, registradas para o futuro).

### M2 — Movimentações (visual)
- Colunas reordenadas para **Usuário · Ação · Solicitação · Quando**; **coluna Detalhe removida** (a justificativa migra para o drawer, M4).
- Solicitação mostra **só o número** (`#id`), não o tipo.
- Ações em **particípio** (aberta/concluída/rejeitada/cancelada) — mapa `PARTICIPIO` (a RPC emite o substantivo Abertura/Conclusão/Rejeição/Cancelamento); busca e ordenação usam o particípio exibido.
- **Badges em tokens semânticos** (`@theme`-mapeados, **nunca hex**): concluída=`success` (verde), rejeitada=`danger` (vermelho), cancelada=`warning` (âmbar), aberta=neutra (zinc). O âmbar de `cancelada` é o token `warning`, **distinto do `--gestao`** (também âmbar, mas é a identidade da área, não um estado).

### M3 — Movimentações (busca / ordenação)
- **Busca única client-side** sobre **todas as colunas** (texto concatena `ator` + particípio + `#id` + `id` + `fmtDataHoraSP(em)`), sobre a lista já carregada por `getMovimentacoes()`.
- **Ordenação por cabeçalho de coluna** (botão em cada `<th>`), default **Quando desc**. `Array.sort` é estável (ES2019+) → empates preservam a ordem da RPC (`id` desc). Comparadores: `em` por string ISO, `solicitacao_id` numérico, `ator`/`acao` por `localeCompare('pt-BR')`.
- **Sem RPC nova, sem paginação** (volume baixo; a RPC já devolve a lista inteira).

### M4 — Linha clicável → drawer
- Clicar (ou **Enter/Espaço**, `role="button"` + `tabIndex`) numa linha chama **`detalheSolicitacao(id)`**, uma **server action nova** (`src/app/solicitacoes/actions.ts`) — necessária porque `@/lib/solicitacoes/rpc.ts` é `import 'server-only'` e não pode ser chamada de um client component. A action faz `requireAreaAction('solicitacoes')` e delega a `getDetalhe` → abre o **`DrawerSolicitacao`** reaproveitável.
- A **justificativa de rejeição** (que saiu da coluna Detalhe) aparece no drawer (`drawer-solicitacao.tsx:166`, `sol.justificativa`) — **não se perde**.
- Estados: `carregando` (spinner na linha + opacidade), `erro` (faixa de erro), guarda contra clique duplo.

### M5 — Backup-gate worktree-aware
`REPO` em `scripts/db-gate/` deixa de ser hardcoded para a raiz do `main` e resolve o **checkout atual**: `git rev-parse --show-toplevel` na `cwd`, fallback `process.cwd()`. **Fonte única** em `lib.mjs` (`export const REPO`); `gate.mjs` e `migrate.mjs` importam (removem o `const REPO` local). Realiza o follow-up registrado no out-briefing da v4.19.1.

**Não afeta o backup-gate:** a conexão com produção é por `SUPABASE_DB_URL` (independe do `REPO`). A mudança só corrige a `cwd` do export e do `db push` — que, rodados de uma worktree, antes corriam do `main` (cego à migration da worktree → "Remote database is up to date" silencioso). Verificado: da worktree, `REPO` = caminho da worktree; do `main`, resolveria a raiz do `main`; `node --check` verde nos 3 scripts.

### M6 — Fechamento
Versão 4.20.0, CHANGELOG.md, CHANGELOG_DIRETORIA, ADR-0120, este out-briefing.

## Adendo pré-merge (Solicitações em dois níveis + ajustes) — ADR-0121, migration 0143
Três pedidos do Yan, dobrados na mesma versão/PR (ainda não mergeada):

**(1) Botão Movimentações gestão-only — já era.** Fica dentro de `{podeGestao && …}` em `solicitacoes-content.tsx`; `podeGestao = includes('solicitacoes')` (área de gestão). Nenhuma mudança — confirmado.

**(2) Permissão de Solicitações em DOIS níveis.** Antes: `/solicitacoes` (caixa + minhas) aberta a **qualquer autenticado**; uma única área `solicitacoes` (gestão). Agora:
- **`solicitacoes/basico`** (nova, rótulo **"Solicitações"**, grupo Geral, ordem 45) = acesso **básico** (caixa de entrada + minhas + abrir pedido). A página exige `['solicitacoes/basico','solicitacoes']` (OR — gestão **inclui** a básica). Item da sidebar gateado por `areasAny` (campo novo no `NavItem`).
- **`solicitacoes`** (existente, rótulo **"Solicitações (gestão)"**, inalterada) = **gestão** (Ver todas, Gerenciar, Movimentações + `/admin/solicitacoes/*`). **Nenhum guard de gestão mudou** (`podeGestao`, `requireArea('solicitacoes')`, `exigir_acesso(['solicitacoes'])`, `tem_area('solicitacoes')`).
- **Decisão-chave (risco):** manter `solicitacoes` = gestão (em vez de inverter) evita reescrever ~10 funções `SECURITY DEFINER` só para trocar a string — zero risco na camada de segurança e migration **puramente aditiva**. O usuário vê os **rótulos** ("Solicitações" / "Solicitações (gestão)"), que ficam como pedido; o nome interno `solicitacoes`=gestão é histórico (documentado em `areas.ts` e ADR-0121).
- **Backfill não-quebra (decisão do Yan): conceder a básica a TODOS os roles.** A migration 0143 insere a área e dá `solicitacoes/basico` a todo role (admin remove depois). **Verificado em produção:** 2 roles, ambos com a básica (✓ todos); grants de `solicitacoes` (gestão) seguem em **1** role (inalterado) → **conceder a básica a todos NÃO vazou gestão**.
- **Fronteira aceita:** as RPCs **básicas** (getMinhas/getCaixa próprio/getPendencias/criar…) seguem em `exigir_acesso()` (login+ativo). Os dados são **self-scoped** (do próprio chamador) — sem vazamento cross-user; o gate da feature é a **página**. É estritamente não-pior que hoje. Negação hard no nível da RPC básica = follow-up (recriar ~7 funções) se a diretoria quiser bloquear acesso por API direta.

**(3) Subtítulos de página sem ponto final.** Removido o ponto final em Solicitações, Design System, Movimentações e a tela de login (os demais — Tipos, Upload, Acessos — já não tinham). A prosa instrucional multi-frase das telas de auth (trocar-senha, solicitar-acesso, sem-acesso) foi **mantida** (remover só o ponto final de texto com 2 frases ficaria incoerente) — me avise se quiser essas também.

## Banco — migration 0143 (aditiva)
- **Base (M1–M6): nenhuma migration** (display + reaproveitamento de `getDetalhe`/`solicitacaoSchema`/`movimentacaoSchema`, intactos; sem drift de contrato).
- **Adendo: migration 0143** (`0143_solicitacoes_area_basica.sql`) — **aditiva/retrocompatível**: só `INSERT` de catálogo (área `solicitacoes/basico`) + `INSERT` de grants (backfill a todos os roles), `ON CONFLICT DO NOTHING`. **Não** faz UPDATE/DELETE/DROP em dado pré-existente → regime autônomo (gate como rede, sem confirmação). **Aplicada:** backup-gate **VERDE** (38/38 tabelas, restore-test spot 4/4 idêntico, 26,1s via COPY) → `db push` da **worktree** (validou o REPO worktree-aware do M5 em produção). Verificada via pooler (áreas + backfill conferidos). Retrocompat com a `main` viva (v4.19.1): o app antigo ignora a área desconhecida e segue abrindo `/solicitacoes` a qualquer autenticado.

## Guarda (gestão-only, não reaberta)
- A página `/admin/solicitacoes/movimentacoes` é **gestão-only** (`requireArea('solicitacoes')`).
- `detalheSolicitacao` repete o guard de superfície (`requireAreaAction('solicitacoes')`) e delega a `solic_detalhe`, que **refina por `pode_ver_solic`** (`tem_area('solicitacoes') OR <participante>`) → gestor vê **qualquer** solicitação; não-participante sem área → `null` (UI mostra "não foi possível abrir"). O `proxy.ts` só exige sessão (não gateia área) — padrão confirmado na v4.19.1.

## Gates (após o adendo)
`tsc` **0** · `lint` **13** (baseline; os "matches" no grep são o **nome da worktree** no path — `numeracao`/`movimentacoes` —, nenhum flag em arquivo meu) · `build` **limpo** (47/47) · `npm test` **125 passed** (9 arquivos; +3 vs base: 2 casos de rota em `areas.test.ts` + a paridade `AREAS ↔ rbac_areas` em `rpc-contrato.test.ts` agora cobre a área nova, rodada contra a base viva com a migration aplicada).

> Nota de processo: o rewrite de `movimentacoes-content.tsx` introduziu **+4 erros de lint** (`react-hooks/static-components` — um componente `Th` definido **dentro** do componente, flagado em cada um dos 4 usos). **Corrigido** hoistando `Th` para o nível de módulo com props explícitas (`col`/`label`/`sortCol`/`sortDir`/`onToggle`) → lint de volta ao baseline 13.

## Auto-auditoria adversarial (§6) — VERDE (proporcional ao risco)
Versão de **baixo risco** (display + reaproveitamento de RPC/drawer existentes + 1 ajuste de tooling; sem banco). Auditoria enxuta, focada nos pontos do §6, verificada contra o código real:
1. **Numeração = id real** (OK): `#{s.id}`/`Solicitação #${sol.id}` nas 3 superfícies; id cru com lacunas (verificado em produção `[5,7,8]`), sem renumerar/materializar.
2. **Linha clicável** (OK): abre o `DrawerSolicitacao` correto via `getDetalhe`; **justificativa de rejeição presente no drawer** (`drawer-solicitacao.tsx:166`); **gestão-only respeitado** (`requireAreaAction` + `pode_ver_solic`, sem reabrir anon/área).
3. **Busca/ordenação client-side** (OK): busca casa todas as colunas; `[...filtradas].sort()` estável; default Quando desc; sem RPC nova.
4. **Badges semânticas** (OK): `border-success`/`danger`/`warning` (tokens `@theme`, não hex); `cancelada=warning` **distinto do `--gestao`**.
5. **Gate worktree-aware** (OK): `REPO` resolve à worktree quando rodado dela e ao `main` quando rodado do `main`; fonte única; `node --check` verde; **backup-gate intacto** (fala com produção via `SUPABASE_DB_URL`).
6. **Sem drift de contrato** (OK): nenhuma RPC/schema mudou; `solicitacaoSchema.justificativa` = `z.string().nullable()` (já existia); `npm test` sem regressão.

**Adendo (permissão em dois níveis) — VERDE, auditoria reforçada (toca segurança):**
7. **Gestão NÃO vazou para a básica** (OK — crítico): conceder `solicitacoes/basico` a todos os roles não dá gestão a ninguém, porque **todos** os guards de gestão exigem `solicitacoes` (área inalterada). Grep confirmou que `includes('solicitacoes')`/`requireArea('solicitacoes')` só aparecem em superfícies de gestão (`podeGestao`, `/admin/solicitacoes/*`, `detalheSolicitacao`). Verificado em produção: grants de `solicitacoes` = 1 role (inalterado).
8. **Gate básico funciona + não-quebra** (OK): página e sidebar exigem `['solicitacoes/basico','solicitacoes']` (OR); backfill deu a básica aos 2 roles → ninguém trancado. Gestão **inclui** a básica (OR + backfill).
9. **Paridade de catálogo** (OK): `rbac_areas` (DB) == `AREAS` (app) — teste de contrato verde; `AREA_INFO` cobre `AREAS`, ordens únicas (45 livre).
10. **Fronteira RPC básica** (consciente): self-scoped, login+ativo, página é o gate; documentada, follow-up registrado. Não é regressão (era any-auth nos dois níveis).

## Aprendizado permanente (CLAUDE.md) — avaliado, **não** adicionado
Nada novo permanente/transversal/caro o bastante: o `react-hooks/static-components` (não definir componente em render) é regra geral de React já coberta pelo lint; a numeração via id cru é decisão de produto (out-briefing/ADR); o gate worktree-aware está documentado no ADR-0120 e o CLAUDE.md já trata a convenção de worktree. **Adendo:** a técnica "dividir uma área de permissão mantendo o nome existente como o nível mais alto + sufixo para o novo nível, para não reescrever guards" ficou no ADR-0121 (útil, mas niche; não custou — saiu certo de primeira). Sem poda necessária.

## Arquivos
- **M1:** `src/components/solicitacoes/board-solicitacoes.tsx`, `minhas-solicitacoes.tsx`, `drawer-solicitacao.tsx`.
- **M2/M3/M4:** `src/components/solicitacoes/movimentacoes-content.tsx` (rewrite), `src/app/solicitacoes/actions.ts` (server action `detalheSolicitacao`).
- **M5:** `scripts/db-gate/lib.mjs`, `gate.mjs`, `migrate.mjs`.
- **M6:** `package.json` (4.20.0; `src/lib/version.ts` deriva), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `docs/adr/0120-...md`, este out-briefing.
- **Adendo — permissão (2):** `supabase/migrations/0143_solicitacoes_area_basica.sql`, `src/lib/auth/areas.ts`, `src/lib/auth/areas.test.ts`, `src/app/solicitacoes/page.tsx`, `src/components/layout/sidebar.tsx`, `docs/adr/0121-solicitacoes-permissao-basica-e-gestao.md`.
- **Adendo — subtítulos (3):** `src/components/solicitacoes/solicitacoes-content.tsx`, `src/app/admin/design-system/page.tsx`, `src/app/admin/solicitacoes/movimentacoes/page.tsx`, `src/app/login/page.tsx`.

## Commits
1. `feat(solicitacoes): exibe numero (#id) no card da caixa, minhas e drawer` (M1)
2. `feat(movimentacoes): reformula auditoria — colunas+badges, busca/ordenacao e linha clicavel` (M2+M3+M4 — um rewrite coeso de um componente; não há split por hunk)
3. `fix(db-gate): REPO dinamico (worktree-aware) via git rev-parse` (M5)
4. `chore(release): v4.20.0` (M6)
5. `feat(solicitacoes): permissao basica + gestao (migration 0143, ADR-0121)` (adendo 2)
6. `style(ui): remove ponto final dos subtitulos de pagina` (adendo 3)
7. `docs(release): changelog + diretoria + out-briefing do adendo v4.20.0`

## Fronteira de produto (respeitada)
Sem tabela de eventos nova; sem reabertura/reatribuição; sem numeração contígua materializada (lacunas aceitas por decisão do Yan). Lista somente-leitura, gestão-only. Nada do Fluxo de Caixa tocado. Backfill da área básica a todos os roles = decisão do Yan (não-quebra).

## Follow-ups (registrados)
- **Negação hard da feature básica no nível da RPC** (recriar ~7 funções para exigir `solicitacoes/basico`/`solicitacoes`), se quiser bloquear acesso por API direta — hoje o gate é a página (dados self-scoped). Fronteira aceita no ADR-0121.
- **Paginação/filtros** das Movimentações se o volume crescer (herança da v4.19.1; hoje a RPC devolve a lista inteira).
- **Subtítulos das telas de auth** (trocar-senha, solicitar-acesso, sem-acesso) — prosa multi-frase mantida com ponto; reavaliar se o Yan quiser uniformizar.
- Backup-gate: `--full` como default, export paralelo, durabilidade off-machine (herança das v4.18/v4.19).

---
**PR:** `feat/v4-20-0-numeracao-movimentacoes` → `main`. Merge e deploy ficam com o usuário.
