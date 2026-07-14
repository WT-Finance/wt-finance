# Out-briefing — v5.1.2 · Ingestão da API do Monde (paralela, alimentar as Metas)

**Tipo:** PATCH · **migrations ADITIVAS 0178–0180** (schema espelho novo) · **ADR-0149** · base main @ v5.1.1
**Fronteira:** esta versão **NÃO vira a chave**. Entrega a ingestão paralela + a tela de comparação.
A fonte de produção das Metas **segue no upload**; a virada é o **PASSO 2** (runbook a parte).

---

## O que foi entregue (missões)

| Missão | Entrega |
|---|---|
| **M1** | **Migration 0178** — schema `monde` (separado, NÃO-exposto pelo PostgREST, como `analytics`), tabelas vivas `venda`/`venda_item` + staging + `ingest_control`, RPCs de ingestão **service_role-only** com **UPSERT idempotente por `venda_numero`+`raw_hash`**. Fora do TRUNCATE do upload; sem FK cruzada. |
| **M2** | Lib server-only `src/lib/monde/` — `client.ts` (HTTP `x-api-key`, paginação por `total`, timeout+retry, `cache:'no-store'`), `schemas.ts` (Zod **tolerante**: `.passthrough()`+defaults → API mudar não quebra), `sectors.ts` (mapa micro→macro provado; Welcome→null). |
| **M3** | `transform.ts` — exclusões (Welcome; setor fora do mapa; venda sem item ativo), vendedor de Weddings do custom_field, **síntese dos 3 flags** (documentada, ADR-0149). |
| **M4** | **Migration 0179** — `monde.mv_vendas_diarias` (mesma lógica da produção; só **itens ativos**). Não substitui a mv de produção. |
| **M5** | Núcleo `ingest.ts` (lista→detalhe c/ concorrência→transform→staging→promover→refresh) + **API Route** `/api/monde/ingest` (`runtime nodejs`, auth por `CRON_SECRET` **ou** sessão admin; modos incremental/window/backfill resumível por mês) + **`vercel.json`** (Cron **diário** `0 9 * * *` — plano-safe; ver nota abaixo). |
| **M6** | **Migration 0180** (RPC `monde_comparacao_mensal`, gate metas) + tela `/metas/comparacao` (só-leitura, sem virada) — upload × Monde mês a mês (Group + setores), Δ; link discreto no Acompanhamento. |
| **M7** | Auto-refresh do Modo TV **mapeado** (`src/components/metas/tv/tv-auto-refresh.tsx`, `setInterval router.refresh` 600s, isolado `[INTERIM DESCARTÁVEL]`). **NÃO removido** — remoção é do passo 2. |
| **M8** | v5.1.2 · CHANGELOG + CHANGELOG_DIRETORIA (sem prometer virada) · ADR-0149 · este out-briefing. |

## Decisão-mãe e mapeamento (do relatório-mapa)

- **`sales` cru** (não `kpis`, que é closed-only por micro). A API alimenta a BASE; a lógica da mv computa os totais → fonte única preservada.
- **`valor_total`** (faturamento) = `product.total_amount` dos itens **ativos**. **`receitas`** = `total_revenue` da VENDA (autoritativo) **distribuído** por valor entre os itens ativos (a soma dos componentes por produto NÃO reconstrói `total_revenue` — verificado ao vivo). Ambos casam com o upload no agregado.
- **Setor micro→macro** provado; **vendedor de Weddings** do custom_field "Vendedor(a) Responsável - Grupo".

## Exclusões (decisões do Yan) — verificadas na ingestão real

Amostra da ingestão de demonstração (jun/2025 + jun/2026, dados reais):

| Mês | Lista Monde | Espelháveis | Welcome fora | Sem item ativo (cancelados) | Erros |
|---|---:|---:|---:|---:|---:|
| 2025-06 | 800 | **769** | 5 | 26 | 0 |
| 2026-06 | 669 | **636** | 18 | 15 | 0 |

- **Welcome 5 / 18** batem EXATAMENTE com o relatório-mapa ("Welcome 5" jun/2025, "Welcome 18" jun/2026).
- Espelháveis **769 / 636** = "casadas 769" / "casadas 636" (= plataforma 636) do relatório. ✓
- **Idempotência PROVADA:** 2ª rodada de jun/2026 → `inseridas:0, atualizadas:0, ignoradas:636` (raw_hash igual = pula). Re-rodar não duplica.

## Comparação upload × Monde (dados reais do espelho)

**jun/2025 (mês FECHADO — reconcilia quase perfeito):**

| Macro | Fat. Upload | Fat. Monde | Δ Fat. | Rec. Upload | Rec. Monde |
|---|---:|---:|---:|---:|---:|
| Corporativo | 1.173.673,17 | 1.173.673,17 | **0,00** | 150.694,02 | 150.778,15 |
| Lazer (Trips) | 3.200.249,87 | 3.200.249,87 | **0,00** | 404.659,60 | 396.523,00 |
| Weddings | 1.418.508,79 | 1.418.508,79 | **0,00** | 242.435,88 | 242.435,88 |
| **GROUP** | **5.792.431,83** | **5.792.431,83** | **0,00** | 797.789,50 | 789.737,03 |

Faturamento **EXATO ao centavo** nos 3 setores; receita Δ ~1% (drift de edição). Vendas 769 = 769.

**jun/2026 (mês VIVO — delta de composição):** GROUP faturamento upload **6.610.726,33** (= gabarito) × Monde **6.838.656,04**; Weddings **exato** (1.932.211,50), Lazer Δ0,005%, Corporativo +228k. O Δ é **composição de conjunto** (Monde é mais completo — traz a cauda + `opened` que o snapshot do Excel não tinha), não erro de valor. É exatamente o que a tela de comparação existe para mostrar antes da virada.

**Receita:** a primeira versão da síntese usava `passenger.agency_fee` e subcontava ~2,3× — a auto-auditoria do checkpoint pegou (jun/2025 receita Monde ia a ~330k vs upload 797k); corrigido para `total_revenue` distribuído (`sum(item.receitas)` = `sum(venda.total_revenue)` ao centavo).

## Correção de premissa do briefing (auto-auditoria)

O briefing (M3) dizia que a transform de produção **descarta a linha** sem `contrato`/`taxa_servico`/`operacao_propria`. **Falso pelo código real** (migration 0011): esses são `COALESCE(...false)` e `operacao_propria` nem é coluna do fato. O que descarta é INNER JOIN por **vendedor/setor desconhecido** e valor/data NULL. **Impacto:** o espelho é auto-contido (guarda `setor_macro` direto, sem JOIN às dims de produção → nenhuma venda se perde), e a síntese dos 3 flags virou **completude/auditoria** (não "para não perder linha"). Não muda nenhum total.

## Gates

`npx tsc --noEmit` 0 · `npx eslint` (arquivos novos) 0 · `npx vitest run` (transform 12 + suíte) verde · `npx next build` OK · migrations aplicadas via `npm run db:migrate -- --aditiva` (**backup-gate VERDE**) e RPCs verificadas via REST (service role).

## Aprendizado permanente (CLAUDE.md)

**Nenhuma convenção nova promovida ao CLAUDE.md.** Os aprendizados desta versão estão no **ADR-0149**:
(a) padrão de **ingestão via API → schema espelho paralelo** (idempotente por content-hash, chave server-only, parser tolerante, cron+backfill) — se surgir uma 2ª integração de API, promover a CLAUDE.md;
(b) **`raw_hash` idempotência ≠ reprocesso**: mudança na LÓGICA da transform não é repescada por re-run (raw_hash igual) — exige TRUNCATE/bump de versão;
(c) **receita do Monde = `total_revenue` da venda**, não reconstrução por item.

## Pendências operacionais do Yan (fora do código)

- **`MONDE_API_KEY`** e **`CRON_SECRET`** no ambiente da **Vercel** (a chave já está no `.env.local`; o Cron precisa do secret p/ autenticar).
- **Backfill completo** 2023→hoje (≈29k) via `/api/monde/ingest?mode=backfill` (resumível por mês) — a demonstração populou só jun/2025 + jun/2026.
- **Cron:** o schedule commitado é **diário** (`0 9 * * *`) porque cron **sub-diário (`*/15`) é Pro-only** e o Vercel **rejeita o deploy inteiro** em Hobby se o `vercel.json` pedir isso (foi o que impediu o 1º deploy do branch). No **passo 2** (virada, quando a frescura importa e o plano permitir), subir para `*/15`. O cron **só funciona após o `CRON_SECRET`** estar na Vercel (sem ele, a rota retorna 401 — benigno).

## Passo 2 (a virada) — runbook a parte, decisão do Yan

Repontar `get_executiva_kpis`/`metas_ritmo_diario` para o espelho (ou promover o espelho ao fato de produção), comunicar a diretoria (o histórico sobe/ajusta), **remover o auto-refresh do Modo TV**, decidir o destino do upload. **FORA desta versão.**
