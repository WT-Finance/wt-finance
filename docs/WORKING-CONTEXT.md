# WORKING-CONTEXT — Janus

Última atualização: 2026-07-15 · v5.1.4 (A Virada — flip APLICADO; Metas/Performance leem o Monde)

> Verdade atual do projeto em UMA página. Toda sessão nova lê este arquivo antes de
> explorar o repositório (o hook `contexto-sessao` o injeta automaticamente).
> Atualizado como parte do out-briefing de TODA versão/patch (DoD). Manter curto:
> o que mudou de verdade, não histórico — histórico é o CHANGELOG.

## Verdade atual

- Versão em produção (main): `5.1.4` (A Virada — PR #182)
- Versão em execução (worktree/branch ativa): nenhuma
- Última migration **aplicada**: `0182_monde_agendamento_supabase.sql` — o **flip (0181/0182) foi aplicado**: as 7 funções PURA-mv leem o Monde e o cron `*/15` está ativo (conferido ao vivo em 2026-07-15)
- Último ADR registrado: `0151`

## Bloqueios vigentes

- **Faturamento roda em MODO TESTE** — o flip de produção (Asaas produção + `EMAIL_MODO=real`)
  é decisão do Yan, fora do código. A dupla trava do modo real está construída, não acionada.
- **Virada Monde APLICADA (v5.1.4):** as 7 funções PURA-mv (Metas/Performance/Executiva/drawers) leem o
  espelho Monde (`monde.mv_vendas_diarias_compat`); cron `*/15` ativo; paridade ao vivo conferida ao
  centavo (2026-06 e 2026-07). O **upload de Excel virou fallback dormente** — MAS **ainda é a única
  fonte** de: `get_mix_produto`/`get_cagr` (Performance: mix por produto / CAGR), `get_pipeline_weddings`/
  `get_prejuizos`/`get_sumario_subsetor`/`get_weddings_historico_subsetor` (Weddings: subsetor/produto/
  operação-própria) e do rótulo "Última atualização" (`get_upload_status` = `MAX(criado_em)` de `fato_venda`).
  **NÃO parar o upload** até o *fato* item-level do Monde existir (Scope B, abaixo).
- **`SMTP_*` na Vercel** — sem eles, as notificações por e-mail degradam em silêncio (0 enviados).
- **% Rec no Cadastro de Metas** — alvos de %Rec nascem vazios; enquanto o Yan não os digita,
  os cards de Metas mostram "—" no "% da meta".
- Favicon/símbolo Janus adiado (reprovado no gate de legibilidade 16/32px) — confirmar com o usuário.

## Filas ativas (próximos passos já decididos)

- **Rótulo "Última atualização" defasado (follow-up):** em `/metas` e `/metas/tv` vem de
  `get_upload_status`→`MAX(fato_venda.criado_em)` (upload manual, hoje dormente), não do frescor do
  Monde — congela quando o upload parar. Repontar para o frescor real (`monde.ingest_control` /
  `MAX(monde.mv_vendas_diarias.data_venda)`). Patch dedicado.
- **Monde — Scope B:** ingerir o *fato* item-level do Monde (produto/subsetor/operação-própria) para
  virar `get_mix_produto`/`get_cagr` + as 4 funções de Weddings e enfim aposentar o upload de Vendas.
- restore-test COMPLETO do backup-gate (follow-up ADR-0116; hoje só o spot-check roda).
- Caso de contrato para `solicitar_acesso_admin` em `rpc-contrato.test.ts` (0177 já em produção).
- Tokenização do `zinc` (follow-up do lint de cor, v4.26).
- Consolidação das 3 pills de período (dívida opcional, patch dedicado).
- Metas por Vendedor — próxima capacidade planejada (escopo a confirmar com o usuário).

## Cuidados desta fase (o que uma sessão nova precisa saber AGORA)

- **Hooks do harness ATIVOS (instalados na v5.1.3).** Editar config de gate (`eslint.config.*`,
  `tsconfig*.json`, `.prettierrc*`, `eslint-rules/`, `.claude/`) é bloqueado — exige checkpoint com o
  usuário + reexecução com `WT_PERMITIR_CONFIG=1`. O `gate-stop` bloqueia a resposta se sobrar
  `console.log` ou shorthand `-[--token]` em `.ts/.tsx` de `src/`. Escape geral: `WT_DESLIGAR_HOOKS=1`.
- **`.claude/settings.json` versionado tem só a chave `hooks`** — NÃO fixa o `model` do orquestrador
  (o CLAUDE.md menciona Opus fixado ali; fixar de fato é decisão pendente do usuário — v5.1.3).
- **Protocolo de revisão de contexto separado:** despachar `revisor` (sempre) e `revisor-db`
  (se houver migration/RPC) ANTES dos gates e da auto-auditoria — read-only, não conflitam.
- `monde.*` **é a fonte viva** das telas executivas/Metas desde o flip (v5.1.4). Mas mix-por-produto, CAGR, as telas de **Weddings** (subsetor/pipeline/prejuízos) e o rótulo "Última atualização" ainda vêm do **upload** — não assumir que tudo já é Monde.

---
Regra de manutenção: item resolvido SAI (não é log). Aprendizado permanente NÃO fica
aqui — vai para o CLAUDE.md pelo critério das três condições (permanente, transversal,
custou caro).
