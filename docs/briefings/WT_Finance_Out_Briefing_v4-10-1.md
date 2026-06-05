# WT Finance — Out-Briefing v4.10.1

**Data:** 2026-06-05 · **Branch:** `feat/v4-10-1` · **Versão:** 4.10.0 → **4.10.1** (PATCH)
**Tema:** Layout de Trips e Corporativo alinhado ao padrão de Weddings (card KPI principal único e clicável + disposição em "Visão Geral").

---

## Contexto

Na v4.10 as abas Trips e Corporativo foram ativadas reusando o `PerformanceContent`, mas o layout ficou com **6 KPIs soltos** num grid e várias seções analíticas separadas — diferente do padrão de Weddings, onde os KPIs principais ficam num **card único clicável** dentro de uma seção "Visão Geral". Esta versão fecha esse gap.

A aba **Geral** (`/performance`, setor `todos`) segue em construção (atrás de `?preview=1`) e herda o mesmo `PerformanceContent` — o novo layout vale para ela quando for ativada (ver pendências).

---

## Missões implementadas

| # | Missão | Resultado |
|---|--------|-----------|
| M1 | RPC receita negativa por setor (migration 0115) | `get_vendas_receita_negativa(p_setor, p_from, p_to)` — generaliza `get_vendas_prejuizo_weddings` (receita bruta < 0), mesmo padrão da 0114. Habilita o card de Weddings em Trips/Corp. |
| M2 | Card KPI principal genérico | `KpiColuna` extraído de `weddings-kpis-section` para `@/components/shared/kpi-coluna`. Novo `KpiPrincipalCard` (client) — 3 colunas Faturamento \| Receita Bruta \| Margem, clicável, abre `KpiPrincipalDrawer` por setor. Dados vêm do server (não depende do provider de período de Weddings). Weddings inalterado visualmente. |
| M3 | Layout `performance-content.tsx` | Uma única `TopSection "Visão Geral"` (recolhível): pills (+ SetorFilter no Geral) → `KpiPrincipalCard` → `MixProdutoTable` ("no período selecionado") \| `TopVendedoresCard` → `VendasEmAbertoCard` \| `VendasReceitaNegativaCard`. Fetch troca `get_prejuizos`→`get_vendas_receita_negativa`. Seções Mix por Setor / Tendência de Margem / Prejuízos ocultas atrás de `MOSTRAR_SECOES_LEGADAS` (código preservado). |
| M4 | Fechamento | version 4.10.1, CHANGELOG, este out-briefing, gates, smoke, PR. |

---

## Migration

| # | O quê | Estado |
|---|-------|--------|
| **0115** | `get_vendas_receita_negativa(p_setor text='todos', p_from date, p_to date)` — vendas com receita bruta < 0 na `vw_vendas_agregadas`, por setor. Retorna o shape `VendasReceitaNegativa` ({ total, vendas[] }) — reusa `VendasReceitaNegativaCard` sem alteração. `SECURITY DEFINER` + `REVOKE…PUBLIC` + `GRANT…anon/authenticated/service_role`. A RPC weddings antiga (`get_vendas_prejuizo_weddings`) é mantida (consumida pela aba Weddings). | _A aplicar com confirmação_ + verificar via REST (anon <3s) |

Aditiva (RPC nova). Aplicar **antes do merge** (Trips/Corp chamam a RPC ao deployar).

## ADR
- **Nenhum ADR novo.** A versão segue padrões já decididos: generalização de RPC por setor (padrão da 0114), card KPI clicável (v4.8.1) e seções por flag (padrão `MOSTRAR_CAGR`/`MOSTRAR_VENDAS_DIAGNOSTICO`).

---

## Decisões (do usuário)
1. **Seções extras → remover (código preservado):** Mix por Setor, Tendência de Margem e CAGR (já oculto) saem da visão de Trips/Corp, atrás de `MOSTRAR_SECOES_LEGADAS=false`. Recuperáveis; a Tendência de Margem também vive no drawer rico.
2. **Receita Negativa → card de Weddings fiel:** conceito "receita bruta negativa" (não "prejuízo/margem negativa"), via nova RPC por setor (0115).
3. **Pills dentro do "Visão Geral"** recolhível, como em Weddings.

---

## Gates
- ✅ `npx tsc --noEmit` zero erros.
- ✅ `npm run lint`: arquivos tocados sem problema NOVO. `weddings-kpis-section.tsx` mantém os 5 problemas pré-existentes do React Compiler (4 erros + 1 warning), idênticos ao baseline do `main` — só deslocados de linha pela extração do `KpiColuna`.
- ✅ `npx next build` limpo.
- ⏳ Smoke visual de `/performance/trips` e `/performance/corporativo` (preview do deploy) + verificação REST da 0115 — no fechamento/pós-merge.

## Pendências / follow-up
- **Aba Geral (`/performance`, setor `todos`):** ainda em construção (preview). Ao ativá-la, reavaliar se Mix por Setor (breakdown cross-setor) deve voltar — para `todos` ele faz mais sentido que para um setor único. Hoje está atrás de `MOSTRAR_SECOES_LEGADAS`.
- Pendências herdadas da v4.10: ranking de vendedores por range (RPC dedicada); qualidade do dado de Trips/Corp não auditada a fundo; dívida de cor incremental (`historico-12m`, `RitmoDiario`, `HistoricoMensal`); cor do drawer de operação ("Caixa Acumulado por Mês"); curadoria ERP (v4.9.x).

## CLAUDE.md
- Sem alteração — a versão não revelou aprendizado permanente novo (reuso de padrões já documentados).

## Arquivos
**Novos:** `supabase/migrations/0115_get_vendas_receita_negativa_por_setor.sql`; `src/components/shared/kpi-coluna.tsx`; `src/components/performance/kpi-principal-card.tsx`; `docs/briefings/WT_Finance_Out_Briefing_v4-10-1.md`.
**Modificados:** `src/components/performance/performance-content.tsx`; `src/components/weddings/weddings-kpis-section.tsx` (usa o `KpiColuna` compartilhado); `package.json`; `CHANGELOG.md`.
