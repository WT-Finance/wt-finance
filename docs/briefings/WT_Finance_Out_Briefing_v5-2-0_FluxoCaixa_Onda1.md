# Out-Briefing — v5.2.0 · Fluxo de Caixa · Onda 1

**Data:** 2026-07-17 · **Branch:** `feat/v5-2-0-fluxo-caixa-onda1` · **Base:** main @ v5.1.11
**Tipo:** MINOR (abre o arco do Fluxo de Caixa). **Migrations:** 0185–0192. **ADR:** 0154.

## Objetivo
Absorver a **Onda 1** do modelo "DRE por Fluxo de Caixa" da controladoria: o realizado muda de eixo
(**liquidação → data de MOVIMENTAÇÃO**) e a página `/financeiro/fluxo-caixa` é reformada (Projetado/
Realizado). Cirurgia por etapas, convivência antes de morte de base. **Os números da Visão Geral mudam
por definição, não por bug** — reconciliação explicável, não paridade.

## Missões implementadas

| Missão | Entrega | Commit |
|---|---|---|
| M1 | Bases `raw.lancamentos_movimentacao` + `raw.titulos_em_aberto` + parsers (normalizeHeader) + 2 cards de upload (substituem os antigos) | 409d99a |
| M2 | `financeiro.fato_fluxo` + `regenerar_fluxo_caixa()` — roteamento realizado/previsto/futuras→previsto/corte 2028 (tabela/função NOVAS; v1 intacta = convivência) | 1a86a11 |
| M3 | Repoint de 5 views + 5 RPCs `__nucleo` para `fato_fluxo` (Abordagem B natural; kpis_diario completo) | 825795c |
| M4/M5 backend | RPCs novas: `get_repasse_mensal`/`get_fluxo_horizonte`/`get_fluxo_runway_semanal`/`get_fluxo_ranking` + `gerencial_saldos.data_saldo` | 9ca1485 |
| M4/M5 frontend | Página Projetado/Realizado + 5 componentes novos + dedupe Gerencial + saldo por data/staleness + ADR-0154 | b481b30 |
| M6 | Aposentadoria (seed→bases novas, remoção de código morto) + 0192 DROP (destrutiva, Yan aplica) + versão/changelogs/out-briefing | (este) |

## Migrations
- **0185/0186** (M1, aditivas, aplicadas): bases raw novas + RPCs de upload (service_role).
- **0187** (M2, aditiva, aplicada): `fato_fluxo` + `regenerar_fluxo_caixa()`.
- **0188** (M3, aditiva, aplicada): repoint dos consumidores (CREATE OR REPLACE de views/RPCs).
- **0189** (M5, aditiva, aplicada): `gerencial_saldos.data_saldo` + `get_gerencial_saldos()` engordada + overload `update_gerencial_saldo(_,_,data)`.
- **0190** (M4, aditiva, aplicada): 4 RPCs novas + índice `(tipo,vencimento)`.
- **0191** (M4, aditiva, aplicada): horizonte "resto do ano" = futuro (parqueia vencidos).
- **0192** (M6, DESTRUTIVA): DROP das bases/RPCs antigas. ⚠️ **Aplicada — ACEITO pelo Yan.** (Foi
  aplicada sem intenção junto de 0193 via `db:migrate --aditiva` — `db push` empurra todo o pending;
  backup pré-push em `~/wt-finance-backups/2026-07-17-pre-migration-181849/`. O DROP era o end-state
  planejado e a Onda 1 está validada ao centavo, então o Yan aceitou. Lição durável: nunca deixar uma
  migration destrutiva pendente na pasta ao rodar `--aditiva`.)
- **0193** (M4 fix): `get_fluxo_runway_semanal` — bug `column t.idx` no ORDER BY (pego pelo contrato RPC).

## ADR
- **ADR-0154** — Fluxo de Caixa no eixo da movimentação: fato_fluxo (convivência/tabela nova),
  Abordagem B natural, repasse BRUTO (discussão líquida registrada), internas incluídas, dedupe Gerencial.

## Reconciliação (liquidação × movimentação) — o essencial p/ a diretoria
Contra o dashboard da controladoria (objeto `D`, base 15/07/2026), meu `fato_fluxo` (base 17/07):
- **Repasse mensal BRUTO bate AO CENTAVO** nos meses fechados: Jan 220.882,78 · Fev 939.731,05 · Mar
  −249.484,16 · Abr −1.973.357,27 · Mai −178.839,30 (idênticos a D). Jun/Jul divergem só pelos ~2 dias
  de data-base (o modelo é diário).
- Entrada de Clientes YTD 17.79M (D 17.61M) e Pagamento ao Fornecedor −17.70M (D −17.69M) — delta ~1%,
  = os 2 dias a mais de movimentação (17/07 vs 15/07). **É a diferença de data-base, não bug.**
- Horizonte "Resto de 2026" (futuro) −2,85M ≈ D −2,92M; 2027/2028/pós-2028 dentro de ~2%.
- Roteamento provado: realizado 21.866 / futuras→previsto 16 / em_aberto 37.257 / pós-corte 13.707.

**Amostra é SÓ-2026** — os comparativos multi-ano (margem do ano anterior no repasse; ranking YTD×YTD;
histórico de 24 meses; anual 2024/2025) só populam com o **upload de produção com histórico 2024+**. As
RPCs estão corretas para o histórico completo.

## Parecer da revisão
- **revisor-db** (por migration, antes de cada aplicação): 0185/0186 aprovadas (só MÉDIO: NOTIFY +
  índice liquidação — endereçados). 0187 — ALTO (dedup de dim_categoria multi-fonte) + 2 MÉDIO
  endereçados. 0188 — CRÍTICO (`get_fluxo_caixa_kpis_diario` com fonte mista) + ALTO/MÉDIO (pos_corte
  em decomposição/próximos) endereçados. 0189/0190 — 2 ALTO (0189 editava função morta; runway
  parqueando vencidos silenciosamente) + MÉDIOs endereçados. **Nenhum CRÍTICO/ALTO pendente.**
- **revisor (contexto)**: pendente — rodar sobre o conjunto final antes do checkpoint (registrado abaixo).

## Pendências / follow-ups (registrados, não implementados)
- **Cobertura em `rpc-contrato.test.ts`** das 4 RPCs novas (schemas vivem em `src/lib/fluxo/rpc-fluxo.ts`,
  não no `schemas-rpc.ts` central) — as RPCs são gated (exigir_acesso), então o teste de contrato precisaria
  de contexto autenticado.
- **`src/types/api.ts` `GerencialSaldo`** — interface órfã e defasada (sem `data_saldo`/`papel`/…); não usada.
- **Duplicação** de `rotuloStaleness`/`diasDesde` entre `saldo-caixa-kpi.tsx` e `contas-cards.tsx` — candidata a helper compartilhado.
- **Próximos Lançamentos (lista lateral)** saiu da página (a grade Projetado é Calendário | Runway, per mockup) — confirmar no checkpoint se a lista deve voltar em algum lugar.
- **Onda 2:** página "DRE Gerencial" (struct de 159 linhas como seed). **Parqueados:** vencidos em aberto, aderência/qualidade da previsão, maturação/ledger, leitura líquida do repasse, aposentar `gerencial_lancamentos`, parser comendo o formato cru do Monde.

## CHECKPOINT do Yan (antes do merge)
1. Subir as 2 bases reais de produção (com histórico 2024+) pelos cards novos de Upload.
2. Conferir a Visão Geral reformada contra o dashboard da controladoria (mesma base ~15-16/07):
   entradas/saídas/repasse bruto; calendário + KPIs 10d; horizonte com divisor 27/28; ranking; drill de saldos com staleness.
3. Confirmar que a rota própria `/financeiro/fluxo-caixa/gerencial` segue intacta.
4. Entender a reconciliação liquidação × movimentação (para explicar à diretoria).
5. ~~Aplicar a migration 0192 (DESTRUTIVA) em TTY~~ — **JÁ APLICADA (aceito pelo Yan);** não há passo destrutivo pendente. Backup pré-push disponível se precisar restaurar as bases antigas.

## Arquivos (resumo)
Migrations 0185–0192. `src/lib/carga/parse-lancamentos-movimentacao.ts`, `parse-titulos-em-aberto.ts`,
`parse-fluxo-caixa-onda1.test.ts`. `src/lib/fluxo/rpc-fluxo.ts`. `src/components/financeiro/`:
`runway-semanal`, `horizonte-previsto`, `repasse-mensal`, `ranking-caixa`, `saldo-caixa-kpi` (novos);
`gerencial/tipos`, `gerencial/contas-cards` (M5). `src/app/financeiro/fluxo-caixa/page.tsx` (reforma),
`.../gerencial/actions.ts` (M5). `src/app/admin/uploads/{page,actions}.ts` + `parse.worker.ts` (cards
novos + aposentadoria). `supabase/seed/` (bases novas). `docs/adr/0154-*`. Versão/CHANGELOGs.
