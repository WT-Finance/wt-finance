# WT Finance — Out-Briefing v4.8

**Data:** 2026-06-01 · **Branch:** `feat/v4-8` · **Versão:** 4.7.1 → **4.8.0**
**Tema:** Consolidação da área de dados + padrão de gráficos + reformulações Weddings.

Dois temas paralelos independentes (Track A dados ∥ Track B visual) + faxina. Execução em duas waves de subagentes editores (arquivos disjuntos), com o orquestrador serializando git/build/migrations.

---

## Missões implementadas

| # | Missão | Status |
|---|--------|--------|
| M1 | Aviso forte uniforme + explicação por base na área de upload | ✅ |
| M2 | CAP/CAR e Lançamentos por Categoria no menu unificado `/admin/uploads` | ✅ |
| M3 | Remover base morta "Vendas por Forma de Pagamento" | ✅ |
| M4 | Primitivos e padrão de gráficos do design system | ✅ |
| M5 | Polish do drawer "Análise Histórica" | ✅ |
| M6 | Redesenho do drawer da Lista de Operações | ✅ |
| M7 | Faxina (#1 investigado, #3 e #4 executados) | ✅ |
| M8 | Fechamento (version, CHANGELOG, ADRs, smoke, out-briefing, PR) | ✅ |

### Track A — área de dados
- **M1/M2/M3** (commit `d5c436b`): `/admin/uploads` agora é **dirigido por configuração** com **4 bases** (Vendas por Produto, Lançamentos por Operação, Lançamentos por Categoria, CAP/CAR), todas com **aviso forte** (modal `ModalConfirmacaoUpload` reutilizável, contagem antes/depois) e **texto explicativo por base**. Parsers e RPCs financeiros existentes foram **reusados** (não reescritos). **Decisão do usuário: unificar** → `/admin/uploads/financeiro` agora **redireciona** para `/admin/uploads`. Base morta Forma de Pagamento removida do código.

### Track B — visual
- **M4** (commit `114dc0d`): primitivos em `@/components/charts` (tema central, grade/eixos/linha-do-zero, `ChartLegend`, `CustomTooltip` estendido, `fillMonths`) + formatadores de eixo (`fmtAxisBRL/Pct/Mes`) + cores de setor/subsetor consolidadas em `config.ts`. Documentado na `/admin/design-system` §8 (showcase + convenção sólido/tracejado). Migração dos gráficos legados é **incremental**.
- **M5** (commit `8dd3307`): legenda dos subsetores movida para **entre** os dois gráficos stacked; **escala Y independente** na Receita (frase "mesma escala" removida); faixa de KPIs 3×2 sem vazio à direita; eixos sem quebra via primitivos M4.
- **M6** (commit `dcd0f5c`): drawer da operação redesenhado — cabeçalho empilhado sem badge; Informações Gerais 3×2 (Duração/Tipo de Contrato/Convidados + Faturamento/Receita Bruta/Margem Bruta dourado); Fluxo de Caixa com **NCG = A pagar − A receber** (vermelho/verde, sem rótulo); **Composição por Subsetor** reusando `SumarioSubsetorCard`; **Caixa Acumulado Efetivo (sólido) + Projetado (tracejado)** com marcador "hoje" e eixo contínuo. **Removidos**: Equação Financeira (Custos Internos não confiáveis), Receita por Subsetor antiga, Detalhamento dos Lançamentos.

### M7 — Faxina
- **#1 (kpis_b → _diario):** investigado. **Achado:** `get_fluxo_caixa_kpis_b(from,to)` (KPIs de período da Visão Geral) e `get_fluxo_caixa_kpis_diario()` (posição atual + 10 dias) **não são equivalentes** e a página `fluxo-caixa` usa **as duas**. Migrar/dropar quebraria os 3 cards de período. **Decisão do usuário: NÃO dropar a `_b`.** Nenhuma mudança.
- **#3** (commit `513ca35`): action órfão `fetchWeddingsComposicao` removido (zero callers).
- **#4** (migration 0102): RPCs órfãs `*_contas_pagar_receber` dropadas (tabela já fora desde a v4.2/0075).

---

## Migrations (aplicadas em produção + verificadas via REST com anon key)

- **0102** `cleanup_vendas_pagamento_e_cpr_orfas` — DROP `raw.vendas_pagamento` + 3 RPCs (M3) + 3 RPCs órfãs `contas_pagar_receber` (faxina #4). Verificado: tabela e 6 RPCs ausentes.
- **0103** `get_operacao_weddings_v48_drawer` — estende `get_operacao_weddings`: `tipo_contrato`, `convidados`, `data_venda_contrato`, `decomposicao_subsetor` no formato SumarioSubsetor, `acumulado_mensal` contínuo (saldo_efetivo/saldo_projetado/eh_futuro); remove `lancamentos_recentes`. Verificado via anon: **1,2s / HTTP 200**, campos corretos. Join por texto (índice da 0101) + função `contar_convidados_operacao` indexada → leve.

---

## ADRs

- **0094** — Substituição total uniforme na área de upload.
- **0095** — Padrão de gráficos do design system.
- **0096** — Reformulação do drawer da Lista de Operações.

(Numeração real verificada: `docs/adr/` ia até 0093.)

---

## Gates (Definition of Done)

- ✅ `npm run build` limpo (todas as rotas compilam; `/admin/uploads/financeiro` como redirect).
- ✅ `npx tsc --noEmit` zero erros.
- ✅ `npm run lint` **sem warnings novos** (os 24 problemas pré-existentes — regras React-compiler — já estão no `main`; M6 introduziu 1 erro `immutability` que foi corrigido na hora).
- ✅ Smoke (REST anon) das RPCs das áreas afetadas, todas <3s / 200.
- ✅ Migrations aplicadas + verificadas.
- ✅ ADRs, CHANGELOG, version 4.8.0 (package.json; `version.ts` deriva).
- ✅ Out-briefing gerado.

---

## Pendências / follow-ups

- **Merge ASAP:** a 0103 mudou o retorno de `get_operacao_weddings` de forma incompatível com o drawer **antigo** ainda em produção — janela de incompatibilidade até o deploy do merge (decisão: aplicar agora + mergear logo).
- **Custos Internos não confiáveis** — motivo da remoção da Equação Financeira; revisar a fórmula no futuro (integridade de dado).
- **Detalhamento dos Lançamentos** removido do drawer — reavaliar se a gestora sentir falta da visão lançamento a lançamento.
- **Migração incremental dos gráficos legados** para os primitivos do M4 (quando tocados).
- **RPA** (atualização automática de dados) e **DRE** seguem fora de escopo (reservadas).

---

## Arquivos (resumo)

**Novos:** `src/components/admin/modal-confirmacao-upload.tsx`; `src/components/charts/{chart-theme.ts,chart-primitives.tsx,chart-legend.tsx,fill-months.ts,index.ts}`; `src/app/admin/design-system/chart-showcase.tsx`; `supabase/migrations/{0102,0103}_*.sql`; `docs/adr/{0094,0095,0096}-*.md`.
**Modificados:** `src/app/admin/uploads/{page.tsx,actions.ts}`; `src/app/admin/uploads/financeiro/page.tsx` (→ redirect); `src/types/{database.ts,api.ts}`; `src/lib/{config.ts,fmt.ts}`; `src/styles/tokens.css`; `src/components/charts/custom-tooltip.tsx`; `src/app/admin/design-system/page.tsx`; `src/components/weddings/{kpi-principal-drawer.tsx,drilldown-drawer.tsx}`; `src/app/performance/weddings/actions.ts`; `src/app/financeiro/fluxo-caixa/page.tsx`; `package.json`; `CHANGELOG.md`; `CLAUDE.md`.
**Removidos:** `src/app/admin/uploads/financeiro/actions.ts`; `src/lib/carga/parse-vendas-pagamento.ts`.

---

## CLAUDE.md — avaliação de aprendizado permanente

Adicionada uma linha em "Convenções de código": gráficos devem usar os primitivos de `@/components/charts` (ADR-0095) — convenção permanente e transversal a features futuras. Demais aprendizados são específicos da versão (ficam neste out-briefing).
