# Escopo do Próximo Patch — Follow-ups pós-v4.12

**Data:** 2026-06-09 · **Baseline:** 4.12.0 · **Status:** Proposta — **nada implementado** (lista para priorização).

A v4.12 atacou a auditoria pós-v4.11. Três itens ficaram **parciais** (por tamanho/risco real, com aval do usuário) e um **achado novo** surgiu durante a implementação. Este documento registra o que sobra, para o próximo ciclo.

---

## Resumo

| # | Item | Origem | Severidade | Esforço |
|---|------|--------|-----------|---------|
| P1 | Divergência dos dois parsers de Vendas | **novo (v4.12)** | 🟠 Alta | Médio |
| P2 | F7 — expandir Zod às demais RPCs críticas | parcial (v4.12 = semente) | 🟡 Média | Médio |
| P3 | F9 — zerar o restante do React Compiler | parcial (v4.12 = escopado) | 🟡 Média | Médio-Alto |
| P4 | F1 — autenticação do admin/ingestão | adiado (v4.12) | 🔴 Crítica* | Alto |
| P5 | Testes e2e (Playwright) — fase 3 | adiado (ADR-0105) | 🟢 Baixa | Médio |

\* P4 é crítica em risco, mas foi **mantida conscientemente** (ADR-0029): produto interno, URL não-linkada, e a ingestão já é atômica (v4.12). Endurecer quando a exposição mudar.

---

## P1 — Divergência dos dois parsers de Vendas (achado novo)
- **Onde:** `src/lib/carga/vendas.ts` (usado pela API Route `upload-vendas`) **vs** `src/lib/carga/parse-vendas-produto.ts` (usado pela UI `/admin/uploads`).
- **Problema:** `parse-vendas-produto.ts` tem `normalizeHeader` (tolerante a acento/caixa) e as colunas `operacao_propria`/`passageiros`/`tipo_contrato`; `vendas.ts` tem COL_MAP **exato** (frágil a variação de cabeçalho) e **não** popula `operacao_propria`. Dois caminhos de ingestão de Vendas com comportamento diferente — risco de carga inconsistente conforme a via usada.
- **Direção:** unificar num único parser/normalização (preferir o tolerante), garantindo paridade de colunas. Testes de contrato/unit do parser unificado.

## P2 — F7: expandir Zod às demais RPCs críticas
- **Feito na v4.12:** padrão `parseRpc` (Zod + log, em `src/lib/schemas-rpc.ts`, integra o estado de erro do F5) + schema de `get_mix_produto` (semente).
- **Falta:** schemas + aplicação em `get_executiva_kpis`, `get_tendencia_margem`, `get_ranking_vendedores_range`, `get_vendas_em_aberto`, `get_vendas_receita_negativa`, `get_operacoes_weddings`, `get_carteira_weddings`.
- **Direção:** seguir o padrão pronto; um schema por RPC, validando shape e invariantes-chave. Baixo risco (degrada para null + log em drift).

## P3 — F9: zerar o restante do React Compiler
- **Feito na v4.12 (escopado):** zerado em `weddings-kpis-section`, `sidebar`, `design-system`. Baseline caiu de ~25 → 13.
- **Falta (~13 erros em ~9 telas):** `set-state-in-effect` de data-fetch em `calendario-liquidez`, `financeiro/gerencial/visualizacao-agregada-tab`, `admin/uploads/page`, `periodo-filter`, `periodo-filter-pills-url`, `kpi-principal-drawer` (useEffects de init), `mix-setor-chart`, `proximos-lancamentos-lateral`; `create-components-during-render` em `sumario-subsetor`; `weddings-mix-section`.
- **Direção:** refatorar os padrões de data-fetch client-side (init via `useState`/`useSyncExternalStore` ou mover para RSC) + extrair componentes definidos em render. Validar visual de cada tela (risco de regressão). Ao zerar, futuras falhas de lint viram sinal real — objetivo original do F9.

## P4 — F1: autenticação do admin/ingestão
- **Onde:** `/admin/uploads` + API Routes `upload-vendas`/`upload-lancamentos`/`gerencial/import` (sem auth; ADR-0029, reavaliado em jun/2026).
- **Direção:** auth real (Supabase Auth + `middleware.ts` protegendo `/admin/**` e `/api/admin/**`), ou no mínimo segredo de admin + allowlist + CSRF. Revisitar quando a exposição mudar.

## P5 — Testes e2e (Playwright)
- Fase 3 da estratégia de testes (ADR-0105): smoke e2e das telas vivas (carrega sem erro, KPIs renderizam). Hoje há unit + contrato.

---

## Sequência sugerida
1. **P1** (achado novo, alto risco de dado inconsistente) + **P2** (Zod, baixo risco, alto valor) — bom PATCH.
2. **P3** (saneamento React Compiler) — versão dedicada (risco de regressão em várias telas).
3. **P4** (auth) — decisão de produto/infra (MINOR). **P5** — quando houver fôlego.

*Insumo de priorização; nenhuma correção implementada.*
