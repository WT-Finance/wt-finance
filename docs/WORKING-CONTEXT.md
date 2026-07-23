# WORKING-CONTEXT — Janus

Última atualização: 2026-07-23 · v5.2.1 (Gerencial — colaboração segura na Base de Dados: diário append-only + desfazer auditado + realtime por broadcast + trava otimista, mais acabamentos; implementado, PR draft, aguarda checkpoint + aplicação das migrations)

> Verdade atual do projeto em UMA página. Toda sessão nova lê este arquivo antes de
> explorar o repositório (o hook `contexto-sessao` o injeta automaticamente).
> Atualizado como parte do out-briefing de TODA versão/patch (DoD). Manter curto:
> o que mudou de verdade, não histórico — histórico é o CHANGELOG.

## Verdade atual

- Versão em produção (main): `5.2.0` (#190 mergeado — Fluxo de Caixa Onda 1, eixo da movimentação; merge `097ffa4`)
- Versão em execução (worktree/branch ativa): `feat/v5-2-1-gerencial-colaboracao` (PR draft). Colaboração segura na Base de Dados do Gerencial (M2–M5) + acabamentos (M1). **Gates locais verdes (tsc 0 / lint / 467 testes / build).** Revisor e revisor-db APROVARAM (0 CRÍTICO/ALTO; MÉDIOs endereçados).
- **Migrations 0199–0202 (v5.2.1) NÃO aplicadas** (job em background). Aplicação + verificação via REST no **checkpoint** — ver out-briefing. As 0185–0198 (v5.2.0) já em produção.
- ⚠️ **Aditiva nova ainda precisa de `npm run db:migrate -- --aditiva --fora-de-ordem`** + cópias untracked das 0950–0954 (v5.4.0/PR #191 ocupam o topo do remoto), removidas antes do merge — até a v5.4.0 renumerá-las.
- Último ADR registrado: `0155` (diário append-only + undo auditado + realtime broadcast + trava otimista — v5.2.1)
- **Ações do Yan p/ fechar a v5.2.1 (checkpoint):** (1) verificar Realtime hospedado (`realtime.topic()`/`realtime.send()` + autorização de canal privado no dashboard) — BLOQUEANTE do 0201; (2) aplicar 0199–0202 (`--aditiva --fora-de-ordem` + cópias untracked) **ANTES do merge** (o cliente chama overloads novos das RPCs); (3) testar com 2 usuários reais (simultaneidade + simular o incidente de exclusão em massa e reverter pelo Histórico); (4) marcar PR pronto + mergear.
- **Vercel (infra, standing):** deploy de repo privado de org exige plano Pro (Hobby recusa) — pendência de billing do Yan, herdada da v5.2.0.

## Bloqueios vigentes

- **v5.2.1 Gerencial: colaboração segura — aguarda CHECKPOINT do Yan (antes do merge):** implementado
  e revisado (gates verdes; revisor/revisor-db APROVARAM). Falta: (1) **verificar o Realtime hospedado**
  — `realtime.topic()`/`realtime.send()` existirem + autorização de canal privado ligada no dashboard
  (BLOQUEANTE do 0201; se faltar, degradar p/ polling); (2) **aplicar 0199–0202 ANTES do merge**
  (`--aditiva --fora-de-ordem` + cópias untracked das 0950–0954, removidas antes do merge) — o cliente
  chama overloads NOVOS das RPCs, então sem as migrations aplicadas as edições do Gerencial quebram;
  (3) testar com 2 usuários reais: simultaneidade (mudança de A aparece p/ B em segundos; conflito de
  salvar avisa em vez de sobrescrever) e **simular o incidente** (excluir em massa → confirmação forte →
  reverter pelo Histórico em 1 ação); conferir a máscara de moeda nas 2 superfícies e que o Gerencial
  segue normal para quem só edita. Out-briefing: `docs/briefings/WT_Finance_Out_Briefing_v5-2-1_Gerencial_Colaboracao.md`.
- **Faturamento roda em MODO TESTE** — o flip de produção (Asaas produção + `EMAIL_MODO=real`)
  é decisão do Yan, fora do código. A dupla trava do modo real está construída, não acionada.
- **Virada Monde APLICADA (v5.1.4):** as 7 funções PURA-mv (Metas/Performance/Executiva/drawers) leem o
  espelho Monde (`monde.mv_vendas_diarias_compat`); cron `*/15` **ATIVO (200, ingerindo)**; paridade ao vivo conferida ao
  centavo (2026-06 e 2026-07). O **upload de Excel virou fallback dormente** — MAS **ainda é a única
  fonte** de: `get_mix_produto`/`get_cagr` (Performance: mix por produto / CAGR), `get_pipeline_weddings`/
  `get_prejuizos`/`get_sumario_subsetor`/`get_weddings_historico_subsetor` (Weddings: subsetor/produto/
  operação-própria). (O rótulo "Última atualização" foi repontado ao Monde na v5.1.5 — não depende mais do upload.)
  **NÃO parar o upload** enquanto essas funções lerem `fato_venda` (o Scope B resolve — ver abaixo).
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
- **Saúde da sincronização Monde:** a v5.1.11 cobriu a falha DURA com sinal PASSIVO (rótulo vermelho >45min). Follow-ups possíveis: (2) **alerta ATIVO por e-mail** (não depender de olhar a tela; reusa `src/lib/email`); (3) detectar a falha **SILENCIOSA** (API 200 sem vendas — o marcador avança e engana; cruzar `ultima_sync`/`max_data`, calibrar contra janelas quietas).
- restore-test COMPLETO do backup-gate (follow-up ADR-0116; hoje só o spot-check roda).
- `CRON_SECRET` do handler `/api/monde/ingest` em comparação **constant-time** (`crypto.timingSafeEqual`) — hardening pré-existente da v5.1.2 (baixo risco; HTTPS/Vault protegem). Achado BAIXO do revisor v5.1.7.
- Caso de contrato para `solicitar_acesso_admin` em `rpc-contrato.test.ts` (0177 já em produção).
- Caso de contrato para `monde_ingest_status` (agora com `ultima_sincronizacao`) em `rpc-contrato.test.ts` — a RPC não tem schema/teste (só cast manual em `carregar-acompanhamento`); débito da v5.1.5, **re-registrado** na v5.1.8 (achado do revisor).
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
