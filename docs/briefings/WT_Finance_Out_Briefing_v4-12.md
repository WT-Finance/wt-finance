# WT Finance — Out-Briefing v4.12

**Data:** 2026-06-09 · **Branch:** `feat/v4-12` · **Versão:** 4.11.0 → **4.12.0** (MINOR)
**Tema:** Saneamento técnico pós-auditoria v4.11 — ingestão resistente a falha, rede de testes, confiabilidade do dado, fim do fan-out. Fonte: `docs/audits/2026-06-08-escopo-patch-pos-v4-11.md`. **F1 (auth) fora** por decisão do usuário.

---

## Missões implementadas

| # | Missão | Resultado |
|---|--------|-----------|
| M2 | Rede de testes (F4) | **Vitest** + `npm test` (gate novo). Unit dos helpers (`fmt`, `periodo`, `decomposicao-variacao`, `normalizeHeader`/`toIsoDate`) + contrato das RPCs críticas via REST (shape + invariantes), `skipIf` offline. **35 testes**. ADR-0105. |
| M3 | Confiabilidade do dado (F5/F6/F8) | `unwrapRpc`/`unwrapRpcComErro` (erro logado, não silencioso) + `ErroCarregamento` (estado discreto); KPI principal mostra erro em vez de skeleton eterno. `parseLocalDate` (datas sem fuso) em 3 componentes. Truncamento "X de N" nos drawers de vendas. |
| M1 | Ingestão atômica (F2) + headers (F10) | **Migration 0116**: staging → `validar_carga_staging` (range vs `dim_data` + contagem, antes de truncar) → `promover_carga_vendas` (swap numa transação; falha → rollback → base nunca vazia). RPCs antigas coexistem; `carregarVendas` migrado. Headers de segurança no `next.config` + `bodySizeLimit` 200mb→25mb. ADR-0104 + nota no ADR-0029. |
| M4 | Ranking por range (F3) | **Migration 0117**: `get_ranking_vendedores_range` agrega no banco. Top Vendedores em **1 chamada** (era até 36). RPC mensal mantida (API route). |
| M5 | Qualidade (F7/F9/F11/F12/F13) | F7: padrão `parseRpc` (Zod+log) + `get_mix_produto` (semente). F9 (escopado): React Compiler zerado em weddings-kpis-section/sidebar/design-system (baseline **~25→13**). F12: 3 flags `MOSTRAR_*` documentadas. F13: changelogs legados congelados, raiz canônica. F11: logos via `mask-image` aceito. |
| M6 | Fechamento | 4.12.0, CHANGELOG, CHANGELOG_DIRETORIA, ADRs, este out-briefing, gates, PR. |

---

## Migrations (aplicadas + verificadas via REST)

| # | O quê | Verificação |
|---|-------|-------------|
| **0116** | Ingestão atômica de Vendas (staging + pré-validação + swap transacional). Aditiva (1 tabela + 4 RPCs novas; antigas intactas). | ✅ `validar_carga_staging` rejeita staging vazia; `limpar_staging_vendas` HTTP 204 (não-destrutivas). `promover_carga_vendas` **não** rodado em produção (destrutivo) — coberto por lógica + rollback. |
| **0117** | `get_ranking_vendedores_range(p_from,p_to,p_setor,p_limite)`. | ✅ via REST **anon**: Weddings 1060ms · Lazer 582ms · Corp 156ms — dentro dos 3s. |

## ADRs
- **0104** — Ingestão atômica (staging + swap). **0105** — Estratégia de testes (Vitest; unit + contrato; e2e fora). Nota de reavaliação no **0029** (auth admin mantida conscientemente; F1 fora).

## Decisões (do usuário)
- **F1 (auth) FORA** — só a nota de reavaliação no ADR-0029.
- **M1: staging + swap atômico** (vs RPC única com jsonb gigante).
- **F9 escopado** — o baseline real do React Compiler era ~25 erros em ~12 arquivos (não os 2-3 do briefing); corrigidos os do briefing + triviais; o restante vira follow-up.

## Relatório — orçamento de 3s das RPCs de listagem (pedido do M4)
- **OK (medido):** `get_ranking_vendedores_range` (≤1,1s), `get_mix_produto`, `get_vendas_em_aberto`, `get_executiva_kpis` (contrato verde).
- **A monitorar conforme o dado cresce:** RPCs de listagem com agregação por linha / JOINs em views não-materializadas. Sem correção nesta versão (relatório apenas). Recomenda-se medir periodicamente pelo front (anon), não só service role.

## Pendências / follow-up
- **F9 restante** (~13 erros React Compiler em ~9 telas: `calendario-liquidez`, `gerencial`, `admin/uploads`, `periodo-filter*`, `kpi-principal-drawer`, `sumario-subsetor`, `weddings-mix-section`, `mix-setor-chart`, `proximos-lancamentos-lateral`) — saneamento de `set-state-in-effect`/`create-components`; versão dedicada.
- **F7 expansão** — aplicar `parseRpc`+Zod às demais RPCs críticas (KPIs, tendência, ranking, vendas, operações, carteira); padrão pronto.
- **Divergência de parsers de Vendas** (achado novo): `vendas.ts` (API route) não tem `normalizeHeader` nem `operacao_propria`/`passageiros`, enquanto `parse-vendas-produto.ts` (client) tem. Unificar.
- **F1 (auth admin)** — endurecimento permanece recomendado (ADR-0029).
- E2e (Playwright) — fase 3 dos testes.

## Gates
- ✅ `npm test` 35 verdes · ✅ `npx tsc --noEmit` zero erros · ✅ `npx next build` limpo.
- ✅ `npm run lint`: sem problema NOVO; baseline do React Compiler **reduzido de ~25 → 13** (restante registrado como follow-up).

## CLAUDE.md
- Gate `npm test` adicionado (comandos, validação, DoD).

## Arquivos
**Novos:** `vitest.config.ts`, `vitest.setup.ts`, `src/lib/{rpc,schemas-rpc}.ts`, `src/components/shared/erro-carregamento.tsx`, `src/lib/**/*.test.ts` (5), `supabase/migrations/{0116,0117}_*.sql`, `docs/adr/{0104,0105}-*.md`, este out-briefing.
**Modificados:** `package.json`, `next.config.ts`, `CHANGELOG.md`, `CLAUDE.md`, `src/data/changelog-diretoria.ts`, `src/lib/{fmt,carga/vendas,carga/parse-vendas-produto}.ts`, `src/components/performance/{performance-content,weddings-content}.tsx`, `src/components/weddings/{kpi-principal-drawer,proximos-casamentos-card,lista-operacoes,vendas-em-aberto-card,vendas-receita-negativa-card,weddings-kpis-section}.tsx`, `src/components/layout/sidebar.tsx`, `src/app/{executiva/page,financeiro/fluxo-caixa/page,performance/weddings/actions,admin/design-system/page}.{tsx,ts}`, `docs/adr/0029-*.md`, `docs/{changelog,bugs-resolvidos}.md`.
