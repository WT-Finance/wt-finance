# Out-briefing — v5.1.4 · A VIRADA (fonte de vendas passa a ser o Monde)

**Tipo:** PATCH · migration **0181** (flip reversível) + **0182** (agendamento) · **ADR-0151** ·
base main @ **v5.1.3** · **migrations NÃO aplicadas pelo Code** (o flip é gate do Yan).

> **A comunicação à diretoria PRECEDE o flip** (gate do runbook) — não é tarefa do Code.
> O que muda é a ORIGEM do dado, não a metodologia (alvos de 14% válidos).

---

## O que foi entregue (missões)

| Missão | Entrega |
|---|---|
| **M1** | **Migration 0181 (reversível)** — views-compat (`monde.mv_vendas_diarias_compat` c/ `setor_macro_id`; `monde.mv_vendas_mensais`) + `CREATE OR REPLACE` das **7 funções PURA-mv** com `FROM`→Monde (corpo idêntico ao vivo, só a tabela trocou — gerado das defs vivas com assert de reversibilidade). **DOWN explícito** (repoint de volta a `analytics.*` + DROP das views). Fato do upload **INTOCADO**. |
| **M2** | **Paridade PROVADA** — `src/lib/monde/virada-paridade.test.ts`: aplica o repoint numa transação, `get_executiva_kpis__nucleo` passa a retornar **exatamente** `monde.mv_vendas_diarias` (Group + 3 setores), `ROLLBACK`. Verde. Metas ≡ Performance por construção (mesma função); o teste fonte-única da v5.0 (`metas_ritmo_diario Σ == get_executiva_kpis`) segue verde (agnóstico de origem). |
| **M3** | **Migration 0182** — `pg_cron`+`pg_net` (~15min) → `/api/monde/ingest?mode=incremental`; `CRON_SECRET`+URL no **Vault** (nunca hardcoded). Idempotente. Substitui o Cron diário da Vercel (mantido **dormente/redundante** p/ não abrir gap). |
| **M4** | **Auto-refresh do Modo TV removido** — `TvAutoRefresh` (setInterval 600s) apagado + uso em `tv-tela.tsx`. `/metas/tv` reflete o último pull. |
| **M5** | **Upload = fallback dormente** — nada removido do pipeline; documentado no ADR-0151 e no CLAUDE.md (§Banco). Reverter a 0181 reativa. |
| **M6** | v5.1.4 · CHANGELOG · CHANGELOG_DIRETORIA (fonte→Monde, mesma metodologia) · ADR-0151 · este out-briefing. |

## Escopo (o ponto que o briefing sub-especificou — auto-auditoria)

O briefing dizia "repontar 2 funções". A classificação das definições vivas mostrou **7 funções
PURA-mv** (só leem a mv) — todas repontadas p/ não deixar split-brain (Executiva/Performance). E
**2 MISTAS** (`get_mix_produto`, `get_cagr`) que leem o **`fato_venda` DIRETO** (breakdown por
produto / anos completos): repontar só a parte-mv delas quebraria a coerência interna → **ficam no
upload** (internamente coerentes; em meses fechados Monde≈upload, resíduo ínfimo). Virá-las 100%
Monde exige alimentar o *fato* do Monde (**Scope B, futuro**). Decisão de escopo confirmada com o Yan.

## Prova de paridade (M2, dados reais, tx-rollback)

`get_executiva_kpis` (repontada, dentro da tx) para **2025-06** (mês fechado):

| Setor | fat. (upload→monde) | receita (upload→monde) | vendas |
|---|---|---|---|
| **Group** | 5.792.431,83 → **5.792.431,83** | 797.789,50 → 789.737,03 | 769 → **769** |
| Trips | 3.200.249,87 → **3.200.249,87** | 404.659,60 → 396.523,00 | 228 → 228 |
| Weddings | 1.418.508,79 → **1.418.508,79** (idênt.) | 242.435,88 → **242.435,88** (idênt.) | 111 → 111 |
| Corporativo | 1.173.673,17 → **1.173.673,17** | 150.694,02 → 150.778,15 | 430 → 430 |

Faturamento e vendas **idênticos** (mês fechado); receita com o ~1% do diagnóstico (currency, some
pós-flip). `get_executiva_kpis(monde)` == `monde.mv_vendas_diarias` em todos os setores. ROLLBACK →
produção intocada.

## Gates

`npx tsc --noEmit` 0 · `npx eslint` (arquivos alterados) 0 · `npx vitest run` verde (inclui a
paridade da virada) · `npx next build` OK. **Migrations 0181/0182 NÃO aplicadas** (flip = gate do Yan).

## Coordenação com a v5.1.3 (paralela)

A v5.1.3 (upgrade de harness) **mergeou primeiro** (origin/main @ 5.1.3). Esta versão senta em
cima dela **sem conflito**: ADR **0151** (a v5.1.3 tomou 0150), migrations **0181/0182** livres,
bump 5.1.3→5.1.4, CLAUDE.md editado por cima da versão da v5.1.3 (seção Banco, distinta das seções
de harness). `git log origin/main..HEAD` só contém a v5.1.4.

## Runbook do flip (sequência do Yan — a parte)

1. **Comunicar a diretoria** (gate 1) — o histórico muda levemente (mais completo/atual); avisar antes.
2. **Vault** (uma vez): `select vault.create_secret('<CRON_SECRET>','monde_cron_secret')` +
   `select vault.create_secret('https://<domínio-produção>','monde_app_url')`.
3. **Aplicar 0181 + 0182** em horário calmo (backup-gate verde). Se `CREATE EXTENSION` reprovar,
   habilitar pg_cron/pg_net no Dashboard → Extensions e reaplicar.
4. **Conferir** `/metas`, `/metas/tv`, `/performance` vs `/metas/comparacao`; confirmar o cron
   Supabase rodando (`select * from cron.job`); rollback claro (DOWN da 0181).
5. Quando o 15min estiver confirmado, remover o cron da Vercel (opcional; hoje dormente/redundante).

## Pendências do Yan (operacional)

- Aplicar **0181/0182** (flip) após comunicar a diretoria — **decisão de QUANDO é do Yan**.
- Criar os **secrets no Vault** (CRON_SECRET + URL de produção).
- Habilitar pg_cron/pg_net se o CREATE EXTENSION exigir (Dashboard).

## Fora desta versão

Aposentar o upload (fallback por ora); alimentar o *fato* do Monde (viraria mix_produto/cagr);
cancelamento como filtro na Performance; pagamentos/parcelas; Faturamento Corp; Metas por Vendedor.
