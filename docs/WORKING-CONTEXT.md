# WORKING-CONTEXT — Janus

Última atualização: 2026-07-25 · v5.3.0 (DRE Gerencial Onda 2 — estrutura viva + tabela mensal híbrida + editor auditado; implementada, PR #193 draft, aguarda checkpoint final do Yan + merge)

> Verdade atual do projeto em UMA página. Toda sessão nova lê este arquivo antes de
> explorar o repositório (o hook `contexto-sessao` o injeta automaticamente).
> Atualizado como parte do out-briefing de TODA versão/patch (DoD). Manter curto:
> o que mudou de verdade, não histórico — histórico é o CHANGELOG.

## Verdade atual

- Versão em produção (main): `5.2.1` (#192 mergeado)
- Versão em execução (worktree/branch ativa): `feat/v5-3-0-dre-onda2` (**PR #193 draft**). DRE por
  Fluxo de Caixa completa: tabela mensal híbrida sobre a ESTRUTURA VIVA (`/financeiro/dre`, ano
  navegável) + editor auditado (`/financeiro/dre/estrutura`) + diário/undo GENERALIZADO.
  **Gates verdes (tsc 0 / lint / 476 testes / build).**
- **Migrations 0204–0208 (v5.3.0) APLICADAS em produção** (25/07, regime aditivo autônomo,
  backup-gate verde; seed reconciliou fail-closed: 29 blocos / 133 maps / 2 excluídas). RPCs
  verificadas EXECUTANDO via REST/service_role; smoke do Gerencial pós-generalização verde.
- O gate de mockup da M0 foi honrado: 3 rodadas de design com o Yan ANTES de qualquer migration.
- Último ADR registrado: `0156` (estrutura viva por chave + fórmulas-grafo + estado excluída +
  generalização do diário/undo — v5.3.0)
- ⚠️ **Aditiva nova ainda precisa de `npm run db:migrate -- --aditiva --fora-de-ordem`** + cópias
  untracked das 0950–0954 (v5.4.0/PR #191 ocupam o topo do remoto), **removidas antes do merge** —
  até a v5.4.0 renumerá-las. (As cópias estão POSICIONADAS na worktree da v5.3.0 agora, untracked.)
- **Paridade com o dashboard da controladoria auditada** (out-briefing): motor EXATO; divergências
  residuais = re-edições retroativas do Monde pós-15/07 (nomeadas). Oráculo congelado em
  `src/components/financeiro/dre/mockup-dados.ts` (nada no app o importa).
- **Vercel (infra, standing):** deploy de repo privado de org exige plano Pro — pendência de billing
  do Yan, herdada da v5.2.0.

## Bloqueios vigentes

- **v5.3.0 — aguarda CHECKPOINT FINAL do Yan (antes do merge):** (1) conferir os totalizadores da
  DRE vs o dashboard da controladoria (auditoria pronta no out-briefing); (2) testar o editor com
  dado real — mover categoria (ver efeito), classificar a órfã "Estacionamento Vaga Rotativa",
  salvar, desfazer pelo Histórico; (3) conferir a Composição colapsada intacta; (4) smoke do undo
  do Gerencial na UI (não regrediu — coberto por teste/REST, falta o olho); (5) conceder a área
  `financeiro/dre` às roles no editor de acessos; (6) decisão adiada: vencidos em aberto no Total
  do ano (o dado já viaja por linha). Out-briefing:
  `docs/briefings/WT_Finance_Out_Briefing_v5-3-0_DRE_Onda2.md`.
- **Faturamento roda em MODO TESTE** — o flip de produção (Asaas produção + `EMAIL_MODO=real`)
  é decisão do Yan, fora do código. A dupla trava do modo real está construída, não acionada.
- **Virada Monde APLICADA (v5.1.4):** as 7 funções PURA-mv leem o espelho Monde; cron `*/15` ATIVO.
  O upload de Excel é fallback dormente MAS ainda é a única fonte de: `get_mix_produto`/`get_cagr`
  (Performance) e as telas de Weddings (subsetor/pipeline/prejuízos). **NÃO parar o upload**
  (Scope B resolve — ver filas).
- **`SMTP_*` na Vercel** — sem eles, as notificações por e-mail degradam em silêncio.
- **% Rec no Cadastro de Metas** — alvos de %Rec nascem vazios; cards mostram "—" até o Yan digitar.
- Favicon/símbolo Janus adiado (reprovado no gate de legibilidade 16/32px).

## Filas ativas (próximos passos já decididos)

- **v5.3.x refino da DRE (pós-merge, com o Yan):** vencidos no Total do ano; satélites do modelo
  (comparativo anual, YTD/Δ%, colunas 2027/2028, linhas-chave, exportação); drag-and-drop no editor;
  guarda de saída para navegação por link; divisão ver/editar da permissão se precisar.
- **Renumeração das 0950–0954 (v5.4.0/PR #191)** + `migration repair` — no checklist de merge da
  v5.4.0; até lá, toda aditiva usa `--fora-de-ordem` + cópias untracked.
- **Monde — Scope B (APOSENTAR o upload manual de Vendas):** viável (item-level já no espelho);
  construir fato/mv item-level e repontar as 6 funções que leem `analytics.fato_venda` direto.
- **Saúde da sincronização Monde:** alerta ATIVO por e-mail; detectar falha SILENCIOSA (200 sem
  vendas).
- restore-test COMPLETO do backup-gate (follow-up ADR-0116).
- `CRON_SECRET` em comparação constant-time (BAIXO, v5.1.7).
- Casos de contrato pendentes de outras áreas: `solicitar_acesso_admin`, `monde_ingest_status`.
- Tokenização do `zinc` (follow-up v4.26) — **começou**: `--band`/`--band-soft` (v5.3.0) são o
  primeiro passo (bandas neutras); resto segue pendente.
- Consolidação das 3 pills de período (dívida opcional).
- Metas por Vendedor — próxima capacidade planejada (escopo a confirmar).

## Cuidados desta fase (o que uma sessão nova precisa saber AGORA)

- **Hooks do harness ATIVOS** (protecao-config / gate-stop / contexto-sessao). Config de gate é
  bloqueada; `WT_PERMITIR_CONFIG=1` só após checkpoint. Escape geral: `WT_DESLIGAR_HOOKS=1`.
- **`.claude/settings.json` versionado tem só `hooks`** — o `model` do orquestrador não é fixado.
- **Protocolo de revisão:** `revisor` (sempre) e `revisor-db` (se migration/RPC) ANTES dos gates
  e da auto-auditoria — na v5.3.0 o revisor-db pegou um ALTO real (venc sem COALESCE) ANTES do push.
- **Diário/undo agora é GENÉRICO** (`reverter_diario` lê `tabela_alvo` de cada entrada; allowlist =
  trigger anexado). Tabela editável nova: PK `id` + `CREATE TRIGGER ... fn_diario_alteracoes()` +
  wrappers de área própria (molde: `dre_estrutura_*`, 0206). O painel `historico-alteracoes.tsx`
  aceita fetchers/camposDiff por prop (defaults = Gerencial).
- **Estrutura da DRE é DADO** (`financeiro.dre_bloco`/`dre_categoria_map`): fórmulas por CHAVE,
  bandeja = dim sem map, excluída = estado explícito. Rename no Monde → id novo → cai na bandeja
  (seguro; ADR-0156).
- `monde.*` é a fonte viva das telas executivas/Metas; Weddings/mix/CAGR ainda vêm do upload.

---
Regra de manutenção: item resolvido SAI (não é log). Aprendizado permanente NÃO fica
aqui — vai para o CLAUDE.md pelo critério das três condições (permanente, transversal,
custou caro).
