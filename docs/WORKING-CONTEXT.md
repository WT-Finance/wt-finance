# WORKING-CONTEXT — Janus

Última atualização: 2026-07-15 · v5.1.7 (fix: o cron do Monde estava bloqueado pelo `proxy.ts` — 401)

> Verdade atual do projeto em UMA página. Toda sessão nova lê este arquivo antes de
> explorar o repositório (o hook `contexto-sessao` o injeta automaticamente).
> Atualizado como parte do out-briefing de TODA versão/patch (DoD). Manter curto:
> o que mudou de verdade, não histórico — histórico é o CHANGELOG.

## Verdade atual

- Versão em produção (main): `5.1.7` (fix do cron do Monde no proxy; auto-refresh v5.1.6; rótulo lê o Monde; virada aplicada)
- Versão em execução (worktree/branch ativa): nenhuma
- Última migration **aplicada**: `0182_monde_agendamento_supabase.sql` — o **flip (0181/0182) foi aplicado**: as 7 funções PURA-mv leem o Monde e o cron `*/15` está agendado (**retornava 401 por bug no `proxy.ts` — corrigido na v5.1.7; após deploy deve virar 200; ver Bloqueios**)
- Último ADR registrado: `0153`

## Bloqueios vigentes

- **Faturamento roda em MODO TESTE** — o flip de produção (Asaas produção + `EMAIL_MODO=real`)
  é decisão do Yan, fora do código. A dupla trava do modo real está construída, não acionada.
- **Virada Monde APLICADA (v5.1.4):** as 7 funções PURA-mv (Metas/Performance/Executiva/drawers) leem o
  espelho Monde (`monde.mv_vendas_diarias_compat`); cron `*/15` agendado (mas em 401 — ver bloqueio); paridade ao vivo conferida ao
  centavo (2026-06 e 2026-07). O **upload de Excel virou fallback dormente** — MAS **ainda é a única
  fonte** de: `get_mix_produto`/`get_cagr` (Performance: mix por produto / CAGR), `get_pipeline_weddings`/
  `get_prejuizos`/`get_sumario_subsetor`/`get_weddings_historico_subsetor` (Weddings: subsetor/produto/
  operação-própria). (O rótulo "Última atualização" foi repontado ao Monde na v5.1.5 — não depende mais do upload.)
  **NÃO parar o upload** enquanto essas funções lerem `fato_venda` (o Scope B resolve — ver abaixo).
- **Cron do Monde em 401 — CAUSA-RAIZ ACHADA; fix na v5.1.7 (aguarda deploy).** NÃO era o secret: o
  `proxy.ts` (middleware, camada 1) exigia sessão em `/api/monde/ingest` e cortava o request do cron
  (só o Bearer do CRON_SECRET, sem cookie) com `{"error":"AUTH_NECESSARIA"}` **antes** do handler — a
  checagem do CRON_SECRET nunca rodava (bug latente desde a v5.1.2). A **v5.1.7** isenta a rota do portão
  de sessão do proxy (`API_AUTH_PROPRIA`; ADR-0153); o handler segue autenticando (CRON_SECRET ou sessão
  admin). O `CRON_SECRET` Vercel=Vault já foi acertado. **Após o merge+deploy da v5.1.7, verificar:**
  `net._http_response`→200 e `monde_ingest_status().ultima_sync` avançar. Espelho congelado desde
  14/07 22:03 UTC até lá.
- **`SMTP_*` na Vercel** — sem eles, as notificações por e-mail degradam em silêncio (0 enviados).
- **% Rec no Cadastro de Metas** — alvos de %Rec nascem vazios; enquanto o Yan não os digita,
  os cards de Metas mostram "—" no "% da meta".
- Favicon/símbolo Janus adiado (reprovado no gate de legibilidade 16/32px) — confirmar com o usuário.

## Filas ativas (próximos passos já decididos)

- **Monde — Scope B (APOSENTAR o upload manual de Vendas):** confirmado **VIÁVEL** na análise da
  v5.1.5 — o dado item-level **já está ingerido no espelho** (`monde.venda_item`: produto/product_kind/
  fornecedor/passageiros; `monde.venda`: setor_micro/operação-própria; cobertura **2023→2026**), toda a
  granularidade que hoje só o upload fornece. Falta **construir o fato/mv item-level** a partir dele e
  repontar as **6 funções** que ainda leem `analytics.fato_venda` DIRETO — `get_mix_produto`, `get_cagr`
  (Performance: mix por produto / CAGR) + `get_pipeline_weddings`, `get_prejuizos`, `get_sumario_subsetor`,
  `get_weddings_historico_subsetor` (Weddings: subsetor). Feito isso, o upload de Vendas **pode ser
  desligado de vez**. Até lá, ele segue necessário para essas telas.
- restore-test COMPLETO do backup-gate (follow-up ADR-0116; hoje só o spot-check roda).
- `CRON_SECRET` do handler `/api/monde/ingest` em comparação **constant-time** (`crypto.timingSafeEqual`) — hardening pré-existente da v5.1.2 (baixo risco; HTTPS/Vault protegem). Achado BAIXO do revisor v5.1.7.
- Caso de contrato para `solicitar_acesso_admin` em `rpc-contrato.test.ts` (0177 já em produção).
- Tokenização do `zinc` (follow-up do lint de cor, v4.26).
- Consolidação das 3 pills de período (dívida opcional, patch dedicado).
- Metas por Vendedor — próxima capacidade planejada (escopo a confirmar com o usuário).

## Cuidados desta fase (o que uma sessão nova precisa saber AGORA)

- **Hooks do harness ATIVOS (instalados na v5.1.3).** Editar config de gate (`eslint.config.*`,
  `tsconfig*.json`, `.prettierrc*`, `eslint-rules/`, `.claude/`) é bloqueado — exige checkpoint com o
  usuário + reexecução com `WT_PERMITIR_CONFIG=1`. O `gate-stop` bloqueia a resposta se sobrar
  `console.log` ou shorthand `-[--token]` em `.ts/.tsx` de `src/`. Escape geral: `WT_DESLIGAR_HOOKS=1`.
- **`.claude/settings.json` versionado tem só a chave `hooks`** — o `model` do orquestrador **NÃO é
  predefinido** (decisão do Yan, v5.1.5): escolhe-se por sessão, Opus recomendado. O CLAUDE.md foi
  corrigido (§Modelos por camada — antes dizia "Opus fixado ali", o que nunca foi verdade).
- **Protocolo de revisão de contexto separado:** despachar `revisor` (sempre) e `revisor-db`
  (se houver migration/RPC) ANTES dos gates e da auto-auditoria — read-only, não conflitam.
- `monde.*` **é a fonte viva** das telas executivas/Metas desde o flip (v5.1.4); o rótulo "Última atualização" também (v5.1.5). Mas mix-por-produto, CAGR e as telas de **Weddings** (subsetor/pipeline/prejuízos) ainda vêm do **upload** — não assumir que tudo já é Monde.

---
Regra de manutenção: item resolvido SAI (não é log). Aprendizado permanente NÃO fica
aqui — vai para o CLAUDE.md pelo critério das três condições (permanente, transversal,
custou caro).
