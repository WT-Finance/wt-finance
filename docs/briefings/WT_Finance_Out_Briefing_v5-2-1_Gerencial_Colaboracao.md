# Out-briefing — v5.2.1 · Gerencial: acabamentos + colaboração segura na Base de Dados

**Base:** `main` @ v5.2.0 (`097ffa4`) · **Branch:** `feat/v5-2-1-gerencial-colaboracao` · **PATCH** · **ADR-0155**
**Motivação real:** um usuário apagou toda a Base de Dados do Gerencial sem reversão possível; e edições simultâneas podiam se atropelar sem ninguém ver.

> **Migrations 0199–0202 APLICADAS em produção** (2026-07-23, pelo Yan via `--aditiva --fora-de-ordem`, gate verde). O harness bloqueou o `db:migrate` autônomo (escrita em produção) → o Yan rodou o comando. Pré-check do Realtime (`realtime.topic()`/`send()`) passou antes. Objetos **verificados por introspecção**: tabela do diário (11 cols), trigger AFTER row-level, 3 triggers statement-level de broadcast, policy em `realtime.messages` (via `pode_assinar_area`), 8 funções novas, overloads 2/3-arg da trava, `get_gerencial_lancamentos` expõe `atualizado_em`. Resta o **teste funcional com 2 usuários** (app) + o merge. Ver "Aplicação das migrations" abaixo.

## Missões implementadas

### M1 — Acabamentos (sem migration)
- **"sem data" extinto.** `rotuloStaleness(null)` passa a devolver texto vazio; o `DataSaldoCell` das duas superfícies (cards do Gerencial e drill do Projetado) renderiza um **"—" neutro clicável** (abre o `<input type="date">`), sem cor de alerta. Staleness discreto só quando há `data_saldo`.
- **Máscara de moeda pt-BR em tempo real** nas duas superfícies de saldo — helper único `InputMoeda` (`src/components/shared/input-moeda.tsx`) + `fmt.mascaraMoeda` ("dígitos como centavos": digitar `122829,13` → `R$ 122.829,13`; suporta negativo; colar funciona; `inputMode="numeric"`). Substitui o par `editStr`+`toNum`-no-blur nas células de saldo (`NumCell` no Gerencial, `SaldoCell` no Projetado).
- **Dedupe** (follow-up da v5.2.0): `hojeSP`/`diasDesde`/`rotuloStaleness` viraram fonte única em `@/lib/fmt` (antes duplicados em `contas-cards.tsx` e `posicao-projetado.tsx`).
- Testes de tabela para `mascaraMoeda` (incl. fronteira de 15 dígitos), `rotuloStaleness` e `diasDesde`.

### M2 — Diário de alterações (migration 0199)
- `financeiro.diario_alteracoes` **append-only e imutável** (`tabela_alvo`, `operacao` I/U/D, `registro_id`, `dados_antes`/`dados_depois` jsonb, `usuario_id`/`usuario_nome`, `lote_id`=`txid`, `origem_undo`, `criado_em`).
- Função de trigger **genérica** `financeiro.fn_diario_alteracoes` (assume PK `id`; guard explícito falha com mensagem clara se reusada em tabela sem `id`) + AFTER trigger row-level em `analytics.gerencial_lancamentos`.
- RLS liga; nenhum grant a anon/authenticated; só o trigger (SECURITY DEFINER dono postgres) escreve; leitura só via RPC. Índices `(tabela_alvo, criado_em desc)`, `(lote_id)`, `(tabela_alvo, registro_id)`.

### M3 — Histórico + desfazer (migration 0200 + painel)
- RPCs de leitura `gerencial_historico_lotes` (agrupado por lote) e `gerencial_historico_lote` (detalhe antes/depois).
- Núcleo interno `financeiro.reverter_diario` (não exposto): inverso transacional com **verificação de conflito** (linha mudou depois → RAISE amigável, não força; DELETE→undo reinsere o "antes" com `atualizado_em = now()` para não revalidar tokens antigos). RPCs `gerencial_desfazer_lote`/`gerencial_desfazer_linha`.
- **Undo auditado:** as escritas da reversão disparam o trigger do diário → novas entradas com `origem_undo` = lote revertido, via GUC transacional `app.diario_undo_de`.
- **Permissões:** própria unitária = `financeiro/gerencial`; de terceiro OU restauração em massa (lote > 1 linha) = `admin/acessos`.
- Painel `historico-alteracoes.tsx` (colapsável, logo abaixo da base): lotes com quem/quando/N/operação, expandir → diff formatado (R$/dd-mm-aaaa/Sim-Não), desfazer por lote/linha. **Confirmação forte (ConfirmModal) só para massa**; unitário direto; por-linha com duplo-clique.
- Cópia do `ConfirmModal` da exclusão em massa corrigida: era "não pode ser desfeita" → agora "pode reverter pelo Histórico".

### M4 — Tempo real (migration 0201 + hook)
- **Broadcast** (não `postgres_changes`): trigger statement-level `financeiro.fn_broadcast_gerencial` (`realtime.send`, 1 mensagem por statement com a contagem) + policy em `realtime.messages` reusando `app.pode_assinar_area` (ativo + área). Escolha justificada no ADR (evita reabrir acesso direto à tabela fechado na 0120/ADR-0108).
- **Fail-safe:** erro de realtime é engolido no trigger (escrita nunca quebra) e o hook cliente degrada em silêncio. **Broadcast só para edição interativa** (`auth.uid()` não nulo) — importação (service_role, insere linha a linha) não inunda os clientes; o diário ainda a audita.
- Hook `use-realtime-gerencial.ts`: assina o canal privado, ignora as próprias mudanças (`usuario_id`), **debounce 600ms** (coalesce de rajadas). Banner discreto "Fulano alterou N linhas" + `router.refresh()`.

### M5 — Trava otimista (migration 0202 + wiring)
- Token de versão = **`atualizado_em`** (coluna já existente, trigger-mantida — mais aditivo que uma `versao` nova; comparação por instante, exata no round-trip via `::text`). `get_gerencial_lancamentos` expõe o token.
- Overloads (por aridade, sem ambiguidade) de `update`/`delete`/`delete_bulk` conferem a versão esperada **na cláusula WHERE** (atômico, sem TOCTOU) e distinguem conflito de inexistente. Bulk recebe mapa `{id: atualizado_em}`. Token nulo = sem trava (retrocompat).
- Cliente: `LancamentoRow` reenvia o token e surfaça o conflito (`onConflito` → banner + refresh; `EditableCell` não marca "salvo" falso). Bulk-delete envia o mapa de versões.

## Migrations
`0199_diario_alteracoes.sql`, `0200_diario_historico_desfazer.sql`, `0201_realtime_broadcast_gerencial.sql`, `0202_gerencial_trava_otimista.sql` — **todas aditivas**.

### Aplicação das migrations (checkpoint)
1. **Verificar o Realtime** (pré-condição BLOQUEANTE do 0201): `select proname from pg_proc where pronamespace='realtime'::regnamespace and proname in ('topic','send');` e confirmar no dashboard que a Autorização de Realtime (canais privados) está habilitada. Se `realtime.topic()` não existir, o `CREATE POLICY` do 0201 falha na aplicação (a policy vem antes dos triggers de propósito → reaplicação limpa após habilitar).
2. Trazer as provisórias **0950–0954** (v5.4.0) como cópias **untracked** para `supabase/migrations/` (existem na worktree `feat+v5-4-0-api-externa`); aplicar com **`npm run db:migrate -- --aditiva --fora-de-ordem`**; **remover as cópias antes do merge**. Nunca `migration repair`. (As 4 classificam **aditiva** no gate — o classificador foi ajustado nesta versão para não dar falso-positivo de destrutiva em `CREATE TRIGGER` cujo evento contém `UPDATE`/`DELETE`.)
3. **⚠️ Ordem obrigatória: aplicar as migrations ANTES do merge/deploy.** O cliente chama os *overloads* novos (ex.: `update_gerencial_lancamento` de 3 args); sem as migrations aplicadas, as edições do Gerencial quebrariam (função inexistente). Fluxo: aplicar (checkpoint) → mergear → deploy automático.
4. Verificar as RPCs via REST (service key) após aplicar.

## ADR
- **ADR-0155** — diário genérico append-only + undo auditado + realtime por broadcast + trava otimista (padrão generalizável).

## Parecer da revisão

Despachados `revisor` (código) e `revisor-db` (migrations), contexto separado, em paralelo.

**`revisor`: APROVADO COM RESSALVAS — 0 CRÍTICO, 0 ALTO.**
- MÉDIO (diff do histórico sem formatação) → **corrigido** (`fmtCampo`: R$/data/Sim-Não).
- MÉDIO (`CellState.error` computado mas nunca renderizado) → **corrigido** (campo removido; o banner de topo + refresh já sinalizam o conflito).
- MÉDIO (4 RPCs de histórico sem Zod/parseRpc) → **registrado** como follow-up (consistente com todo o módulo Gerencial, que usa cast frouxo; é a pendência "cobertura de contrato das RPCs gated" do próprio briefing).
- BAIXO (cursor da máscara pula ao editar no meio; `ConfirmModal await`+`startTransition` fecha antes do RPC; janela de linha recém-criada sem token) → **registrados** (padrões pré-existentes/documentados; não corrompem dado). Teste de fronteira da máscara **adicionado**.

**`revisor-db`: as 4 migrations APROVADAS (0201 com ressalva). 0 CRÍTICO.**
- ALTO (0201: dependência externa `realtime.topic()`/`realtime.send()` — falha na aplicação se o Realtime hospedado não suportar) → **tratado como bloqueante de checkpoint** (item 1 acima) + policy reordenada para reaplicação segura.
- MÉDIO (DELETE-undo preservava `atualizado_em` antigo → token voltava a "bater") → **corrigido** (usa `now()`).
- MÉDIO (`gerencial_historico_lotes` full-scan+GROUP BY cresce com o diário append-only; broadcast síncrono soma latência sob contenção) → **registrados** para monitorar (dentro dos 8s no volume atual).
- BAIXO (bulk lock só checa ids no mapa; `idx_diario_registro` ainda sem consumidor; trigger genérico assume `id`) → **guard de `id` adicionado**; demais registrados.

Verificados sem achado (ambos): tokens de cor do DS (sem hex/classe crua), sem `console.log`, RBAC inline + REVOKE/GRANT explícitos, RLS sem `USING(true)`, predicado anulável via `IS DISTINCT FROM` (sem vazamento), atomicidade do undo (tudo-ou-nada), cobertura de colunas no restore, GUC transacional, overloads sem ambiguidade, guarda otimista atômica, `lote_id` como string ponta-a-ponta, hook realtime fail-safe, dedupe do M1 sem órfãos.

## Gates
`npx tsc --noEmit` 0 erros · `npm run lint` (por-arquivo) limpo · `npm test` 466→467 (novos testes de fmt) · `npm run build` OK. **Migrations não aplicadas** (checkpoint).

## Pendências / follow-ups (registro)
- **Aplicar migrations no checkpoint** (ordem + Realtime + `--fora-de-ordem` + cópias untracked — ver acima).
- Cobertura de contrato (`rpc-contrato.test.ts`) para as RPCs de leitura novas (`gerencial_historico_lotes`/`lote`) — pendência do briefing.
- `gerencial_historico_lotes`: monitorar crescimento (diário append-only, sem expurgo); se imports diários crescerem muito, considerar janela default/particionamento.
- Broadcast síncrono na transação: observar latência sob carga; eventual fila é redesenho maior.
- Cursor da máscara de moeda (pula ao editar no meio) — melhoria opcional (`selectionStart/End`).
- `ConfirmModal.onConfirmar` + `startTransition` fecha antes do RPC responder — dívida sistêmica (idêntica em `cadastro-clientes.tsx`), fora do escopo.
- Consolidação das ~8 cópias de `hojeSP()` — a v5.2.1 unificou só as 2 do Fluxo de Caixa (dívida conhecida, rotulada no `fmt.ts`).
- **FORA do escopo (briefing):** generalizar o diário a outras tabelas; persistência do horizonte do slider; Próximos Lançamentos; renumeração das migrations (pós-v5.3); Onda 2 (DRE Gerencial).

## Arquivos
**Migrations:** `supabase/migrations/0199…0202`.
**Novos (client):** `src/components/shared/input-moeda.tsx`, `src/components/financeiro/gerencial/historico-alteracoes.tsx`, `src/components/financeiro/gerencial/use-realtime-gerencial.ts`.
**Modificados (client):** `src/lib/fmt.ts`, `src/lib/fmt.test.ts`, `src/components/shared/…`, `src/components/financeiro/gerencial/{contas-manager,contas-cards,gerencial-section,base-dados-tab,lancamento-row}.tsx`, `src/components/financeiro/posicao-projetado.tsx`, `src/app/financeiro/fluxo-caixa/gerencial/{actions.ts,page.tsx}`.
**Docs/meta:** `docs/adr/0155-…md`, `docs/design-system.md`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json` (5.2.1), `docs/WORKING-CONTEXT.md`.
