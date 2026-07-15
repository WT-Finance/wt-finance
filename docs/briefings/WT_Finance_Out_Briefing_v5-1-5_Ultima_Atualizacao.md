# Out-briefing — v5.1.5 · "Última atualização" reflete o Monde

**Tipo:** PATCH · **SEM migration · SEM ADR** · base main @ **v5.1.4** · dobrado no **PR #183**
(mesmo PR que fez o catch-up do WORKING-CONTEXT da v5.1.4, a pedido do Yan — "aproveitar o PR aberto").

> Contexto: a **virada (v5.1.4) já foi APLICADA em produção** (confirmado ao vivo nesta sessão:
> as 7 funções PURA-mv leem `monde.mv_vendas_diarias_compat`, cron agendado, paridade Metas×Monde
> **ao centavo** em 2026-06/2026-07). Mas o rótulo "Última atualização" seguia apontando para o
> upload manual — enganoso pós-virada. Esta versão corrige isso.

---

## O que foi entregue

| # | Entrega |
|---|---|
| **1** | **Rótulo "Última atualização" → frescor do Monde.** A fonte única `carregarAcompanhamento` (usada por `/metas` **e** `/metas/tv`) passa a ler `monde_ingest_status.ultima_sync` (`MAX(sincronizado_em)` do espelho Monde) em vez de `get_upload_status.vendas.ultima_atualizacao` (`MAX(criado_em)` de `analytics.fato_venda` = upload manual). Corrige **as duas telas de uma vez**. **Sem migration** — a RPC `monde_ingest_status` já existia (0178, service-role). Tipagem frouxa (RPC fora do `database.ts` congelado). `fail-safe` preservado (erro → linha omitida). Comentário do tipo `AcompanhamentoData.ultimaAtualizacao` atualizado (achado MÉDIO do revisor). |
| **2** | **Correção do CLAUDE.md** (§Modelos por camada): o modelo do orquestrador **não é predefinido** em `.claude/settings.json` (que versiona só `hooks`) — decisão pendente da v5.1.3 **resolvida** pelo Yan: Opus recomendado, escolhido por sessão, não um default cravado. |
| **3** | **Catch-up do WORKING-CONTEXT da v5.1.4** (o furo original que abriu o PR #183): produção 5.1.4→5.1.5, flip aplicado, o que ainda depende do upload, e o bloqueio do cron 401 (abaixo). |

## Achado operacional — AÇÃO DO YAN (fora do código)

**O cron do Monde está retornando HTTP 401.** O `pg_cron` (`*/15`) dispara e o `net.http_post`
"succeeded" (só significa que a requisição foi **enfileirada**), mas a resposta real de
`/api/monde/ingest` é **401**: o `CRON_SECRET` esperado pela rota (env da Vercel) **não bate** com o
`monde_cron_secret` do Vault que o cron envia no `Bearer` (ambos os secrets existem; os **valores
divergem**). Consequência: **a ingestão do Monde está parada desde 14/07 22:03 UTC** — a fonte viva
de Metas/Performance mostra dado de ontem. **Fix:** igualar `CRON_SECRET` (Vercel) = `monde_cron_secret`
(Vault). O novo rótulo (entrega 1) agora torna essa defasagem **visível** — feature, não bug.

## Mapa (contexto da investigação — não é entrega desta versão)

**Ainda lê o upload (`analytics.fato_venda`) pós-virada:** `get_mix_produto`, `get_cagr` (Performance:
mix por produto / CAGR) e `get_pipeline_weddings`, `get_prejuizos`, `get_sumario_subsetor`,
`get_weddings_historico_subsetor` (Weddings: subsetor/produto/operação-própria). O dado item-level
para eliminá-los **já está no espelho** (`monde.venda_item`: produto/product_kind/fornecedor/passageiros;
`monde.venda`: setor_micro/operação-própria; **cobertura 2023→2026**) → **Scope B** = construir o
fato/mv item-level e repontar essas 6 funções, aí o upload pode ser aposentado. Colunas completas do
espelho registradas no WORKING-CONTEXT/memória.

## Gates

`npx tsc --noEmit` **0** · `npx eslint` (arquivos alterados) **0** · `npm test` **415/415** ·
`npx next build` **OK**. **Parecer do `revisor`:** APROVADO com ressalvas (0 CRÍTICO / 0 ALTO;
1 MÉDIO **endereçado** — comentário do tipo; 2 BAIXO — o nitpick de clareza do WORKING-CONTEXT
endereçado, e a ausência de teste de contrato p/ `monde_ingest_status.ultima_sync` **registrada**
como follow-up: mesmo padrão já existente do `get_sumario_subsetor`, degrada p/ `null` sem quebrar).
Sem migration → `revisor-db` não se aplica.

## Pendências do Yan

- **Reconciliar `CRON_SECRET` (Vercel) = `monde_cron_secret` (Vault)** — retoma a ingestão do Monde
  (hoje 401). É o que faz o Monde voltar a atualizar de 15 em 15 min.
- (seguem, de antes) `SMTP_*` na Vercel; `%Rec` no Cadastro de Metas.

## Follow-ups registrados (fora desta versão)

- Teste de contrato para `monde_ingest_status.ultima_sync` em `rpc-contrato.test.ts`.
- **Monde Scope B** (fato/mv item-level → vira `get_mix_produto`/`get_cagr` + as 4 de Weddings → aposenta o upload).
