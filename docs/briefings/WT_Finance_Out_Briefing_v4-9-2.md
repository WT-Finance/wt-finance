# WT Finance — Out-Briefing v4.9.2

**Data:** 2026-06-04 · **Branch:** `feat/v4-9-2` · **Versão:** 4.9.1 → **4.9.2** (PATCH)
**Tema:** Faturamento/receita/hotel das operações Weddings via Operação Própria (fim da contaminação por `venda_n`). Follow-up da v4.9.1. ADR-0102. **Backend-only.**

---

## Contexto

A v4.9.1 corrigiu `data_evento` (Carteira/Lista) via Operação Própria, mas `faturamento`/`receita`/`hotel` da dim ainda saíam do `venda_n`. A investigação do follow-up mostrou contaminação grave:

- **`W - Darlene e Adnan`** exibia **R$ 375.523** — rastreado: os 31 `venda_n` dos lançamentos da Darlene pertencem **100% à `W - Daniella e Augusto`** (28 Weddings + 1 Produção + 2 WedMe). A Daniella era contada **duas vezes**. Faturamento real da Darlene: **R$ 8.999** (só o contrato).

Medição do impacto do re-base (operacao_propria vs venda_n): **214/231 operações idênticas**, só **~17** mudam (as contaminadas); total R$ 44,38 Mi → ~R$ 44,14 Mi (remove duplas contagens). Confirmado que **não há subcontagem**: onde o `venda_n` somava mais, o excedente era de outras operações.

---

## Implementado

| Migration | O quê |
|-----------|-------|
| **0112** | `regenerar_dim_operacao_weddings`: `faturamento`/`receita`/`hotel` da **dim** por `operacao_propria`. |
| **0113** | **RPCs** `get_operacoes_weddings` (`vendas_op`, `subsetor_op`, `tipo_contrato_cte`) e `get_operacao_weddings` (faturamento/receita, decomposição por subsetor, tipo_contrato) — todas por `operacao_propria`. |

**Descoberta que motivou a 0113:** a Lista e o drawer **não leem o faturamento da dim** — recalculavam via `venda_n`. Logo a 0112 sozinha não corrigia a coluna Faturamento visível (vale só pelo Hotel, que a Lista lê da dim). A 0113 conserta os cálculos nas RPCs. Após v4.9.2, o `venda_n` não alimenta mais nenhum dado de Vendas em Weddings.

**Mapa de fontes (decisão do usuário), conferido contra o código:**

| Métrica (Lista) | Fonte | Onde |
|---|---|---|
| Hotel, Data do Evento, Duração | Vendas (operacao_propria) | dim (0110/0112) |
| Conv. | Vendas (operacao_propria) | `contar_convidados` (0109) |
| Faturamento, Contrato, Subsetor | Vendas (operacao_propria) | RPCs (0113) |
| Resultado Previsto | Lançamentos | dim `resultado_caixa` (entradas−saídas) |
| Margem | Resultado Previsto ÷ Faturamento | RPC |
| Carteira: Vendas × Entrega | **exclusivamente Vendas** | `get_carteira_weddings` (0111) |

**Backend-only** — nenhuma mudança de frontend.

---

## Aplicação (pós-merge, com confirmação)

Não precisa de re-upload (a Operação Própria já está em `raw.vendas_excel`).
1. `db push` (aplica 0112 + 0113).
2. **Re-rodar** `SELECT public.regenerar_dim_operacao_weddings();` (repovoa a dim com o novo cálculo).
3. Validar via REST (anon): faturamento da Darlene = R$ 8.999; total Weddings ~R$ 44,14 Mi; spot-check de 2-3 operações não-contaminadas (devem ficar idênticas); `get_operacoes_weddings` e `get_operacao_weddings` cabem em <3s.

---

## ADRs
- **0102** — faturamento/receita/hotel/subsetor/contrato de Weddings via Operação Própria (dim 0112 + RPCs 0113).

## Gates
- ✅ `npx tsc --noEmit` · ✅ `npx next build` (sem mudança de código; versão deriva do package.json).
- ✅ 0113 montada por substituição exata das definições vivas (6 trocas, 1 ocorrência cada; **zero `venda_n`** restante na lógica das RPCs).
- ⏳ RPCs verificadas via REST após aplicar (re-rodar a regeneração antes).

## Pendências / curadoria ERP (registradas)
- `venda_n` trocados nos Lançamentos: **44374** (Paula e Fernando→Paula e Bruno), **44025** (Darlene→Daniella), **49444** (Larissa e Vitor→Larissa e Thiago).
- Nomes de operação defasados (ficam faturamento 0 / "sem data" na Lista até alinhar): *Camila e Bruno* `02SET23`→`02SEP23`; *Thelma de Denis* `DDMMAA`→data real.

## Arquivos
**Novos:** `supabase/migrations/0112_dim_faturamento_hotel_via_operacao_propria.sql`; `supabase/migrations/0113_rpcs_faturamento_subsetor_via_operacao_propria.sql`; `docs/adr/0102-dim-faturamento-hotel-via-operacao-propria.md`; `docs/briefings/WT_Finance_Out_Briefing_v4-9-2.md`.
**Modificados:** `package.json`; `CHANGELOG.md`.
