# ADR-0065 — Abordagem B: KPIs em regime caixa-bancário

**Status:** Aceito
**Data:** 2026-05-26
**Versão:** v4.1

## Contexto

WT Finance v4.0 calculava KPIs de Fluxo de Caixa usando Lançamentos puro (regime contábil). Gastos via cartão de crédito eram contabilizados no momento do gasto individual no cartão, não quando o banco debitou a fatura.

## Decisão

KPIs do topo do Fluxo de Caixa e o gráfico Fluxo Mensal passam a usar Abordagem B (regime caixa-banco). A regra:

**Passado liquidado (Bloco 1 — regra refinada em migration 0068):**
- Entradas (valor > 0) em **qualquer conta**: SEMPRE incluídas, mesmo que a conta seja cartão de crédito.
- Saídas (valor < 0) em contas **não-cartão**: incluídas normalmente.
- Saídas (valor < 0) em contas **cartão**: EXCLUÍDAS do Bloco 1 — contabilizadas via Fatura-cartão no Bloco 2.

**Por que entradas em cartão são incluídas:** Lançamentos com valor > 0 em contas-cartão (Reembolso Fornecedor, Desconto Obtido, Incentivo, Reversão de Perdas Financeiras, etc.) representam receita real que chegou no balanço do cartão. A CAP/CAR registra Faturas-cartão **sempre com Tipo='Saída'** — confirmado empiricamente na Investigação 3 do checkpoint M5 (34 faturas inspecionadas, nenhuma com Tipo='Entrada'). Portanto não há contrapartida possível como "Fatura-Entrada" e o risco de dupla contagem é zero.

**Passado liquidado (Bloco 2):**
- `CAP/CAR.ValorFinal WHERE Status IN ('Entrada','Saída') AND descricao LIKE 'Fatura %cartão%'`

**Futuro previsto:**
- Entradas: `CAP/CAR.ValorFinal WHERE Status='A Receber Futuro' AND (conta_previsao IS NULL OR NOT cartão)`
- Saídas: `CAP/CAR.ValorFinal WHERE Status='A Pagar Futuro' AND (conta_previsao IS NULL OR NOT cartão)`
- Mais: `CAP/CAR.ValorFinal WHERE Status='A Pagar Futuro' AND descricao LIKE 'Fatura %'`

Implementado via: `financeiro.vw_fluxo_caixa_kpis_b` (4 blocos UNION ALL) + RPCs `get_fluxo_caixa_kpis_b` e `get_fluxo_caixa_mensal_b` (migrations 0065 + 0068).

## Consequências

**Positivas:**
- KPIs refletem "quanto saiu do banco neste mês" — pergunta operacional real de tesouraria
- Diferença vs Abordagem A (Lançamentos puro): ~R$40K (~5%) — defasagem do ciclo de cartão

**Negativas / trade-offs:**
- KPIs (Abordagem B) ≠ Decomposição por Grupo de Categoria (Lançamentos puro). Diferença documentada via tooltip na UI
- Faturas-cartão consolidadas não têm Grupo de Categoria contábil → harmonização em B foi descartada
- 725 títulos futuros sem Conta (Previsão) na CAP/CAR são tratados como não-cartão (Risco 3, impacto <2%)

**Validação numérica (jan-mai 2026):** Abordagem B → Entradas R$12,69M | Saídas R$13,57M | Saldo ~−R$880K

_Nota: spec original usava ~R$13,50M para saídas. A diferença de R$70K (0,5%) corresponde às saídas de TBO e Conta Investimento XP, ausentes de `dim_conta_bancaria` no momento da validação do spec e corretamente incluídas após migration 0067. O saldo levemente acima de −R$813K é consequência direta dessa correção._
