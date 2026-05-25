# WT Finance — Out-Briefing v4.0

**Data:** 2026-05-25  
**Branches:** `chore/v4.0-m0-drop-sparklines`, `fix/v4.0-m1-hotel-fallback`, `feat/v4.0-m2-schema-financeiro`, `feat/v4.0-m3-upload-pipeline`, `feat/v4.0-m4-aba-financeiro` (todos mergeados em `main`)  
**PRs mergeados:** #63, #64, #65, #66, #67  
**Commits pós-PRs (direto em main):** `09368c8`, `d0c8746`  
**TypeScript:** limpo (`npx tsc --noEmit --skipLibCheck`)  
**Migrations aplicadas:** 0053–0060  

---

## Missões implementadas

### M0 — Drop RPC `get_sparklines` no banco (ADR docs pendentes)

A v3.9 removeu a chamada `get_sparklines` do frontend (ADR-0054), mas a RPC permanecia ativa no banco. Migration 0053 faz o DROP definitivo.

**Arquivos:** `supabase/migrations/0053_drop_get_sparklines.sql`

---

### M1 — Fallback hotel + `dim_hotel` + FK (ADR-0064)

**Contexto:** A migration 0052 (v3.9) removeu o fallback via pagante e voltou ao caminho único `contrato=1`. Porém operações do tipo Diárias/Pacote nunca têm linha `contrato=1` — seu hotel vem da coluna "Fornecedor" diretamente. Essas operações ficavam sem hotel, gerando NULL.

**Solução em 3 migrations:**

**0054 — fallback via Diárias/Pacote** — Quando `contrato_info` é NULL (operação sem linha contrato linkada), `regenerar_dim_operacao_weddings()` busca o fornecedor diretamente da primeira linha do tipo `Diárias/Pacote` da venda. Cobre o caso em que o hotel aparece apenas como item de diária, não como contrato.

**0055 — `dim.dim_hotel`** — Nova tabela no schema `dim` com deduplica hotels por nome normalizado. Permite consultas analíticas por hotel sem repetição de strings.

**0056 — `hotel_id` FK em `fato_lancamento_operacao`** — Coluna `hotel_id` adicionada com FK para `dim.dim_hotel`. Função de backfill popula todos os registros existentes. `regenerar_dim_operacao_weddings()` atualizada para incluir o preenchimento do `hotel_id` nos futuros re-seeds.

**Resultado:** Operações Diárias/Pacote agora têm hotel preenchido. Operações sem qualquer indicação de hotel permanecem NULL (dado real ausente, sem fallback artificial).

**Arquivos:** `supabase/migrations/0054_hotel_fallback_diarias.sql`, `0055_create_dim_hotel.sql`, `0056_hotel_id_fk_backfill.sql`

---

### M2 — Schema financeiro: raw tables + dims + fato + views (ADRs 0060–0063)

Primeira versão do domínio Financeiro no banco. Três migrations:

**0057 — `raw.lancamentos`** — Tabela raw para ingestão direta do XLSX "Lançamentos por categoria". Campos: `arquivo_origem`, `numero`, `venda_no`, `emissao`, `vencimento`, `liquidacao`, `pessoa`, `descricao`, `descricao_categoria`, `valor` (NUMERIC 18,2), `categoria`, `grupo_categoria`, `conta`. O schema `raw` NÃO está exposto via PostgREST — acesso via RPCs SECURITY DEFINER apenas.

**0058 — `financeiro.dim_categoria`, `financeiro.dim_conta_bancaria`, `financeiro.fato_lancamentos`** — Tabela fato com FKs para as duas dims e para `raw.lancamentos`. Índices em `vencimento`, `liquidacao`, `categoria_id`. Função `regenerar_financeiro_lancamentos()` faz TRUNCATE + INSERT no fato a partir do raw, resolvendo dims via `INSERT … ON CONFLICT DO NOTHING`.

**0059 — 4 views + 4 RPCs públicas**

| View | RPC | Retorno |
|------|-----|---------|
| `vw_fluxo_caixa_mensal` | `get_fluxo_caixa_mensal(p_from, p_to)` | `JSON_AGG` — `[{mes, grupo_categoria, tipo, valor_total, lancamentos_count}]` |
| `vw_proximos_vencimentos` | `get_proximos_vencimentos(p_limite, p_offset)` | `{items: [{id, numero, vencimento, …, aging}], total: N}` |
| `vw_posicao_por_conta` | `get_posicao_por_conta()` | `JSON_AGG` — `[{conta, tipo_conta, saldo}]` |
| `vw_decomposicao_grupo` | `get_decomposicao_grupo(p_from, p_to)` | `JSON_AGG` — `[{mes, grupo_categoria, sinal, valor_total, lancamentos_count}]` |

Todas RPCs: `REVOKE EXECUTE FROM PUBLIC; GRANT TO service_role` — não acessíveis por `anon`/`authenticated`.

**Arquivos:** `supabase/migrations/0057_financeiro_schema_raw_tables.sql`, `0058_financeiro_dims_fato.sql`, `0059_financeiro_views.sql`

---

### M3 — Upload pipeline padronizado: 4 fontes client-side

Refatora a página de uploads para seguir padrão uniforme em todas as fontes. Client Components lêem o arquivo no browser, fazem parse, e chamam Server Actions em lotes.

**Fontes suportadas:**
1. **Lançamentos financeiros** — `parse-lancamentos-financeiro.ts` → RPCs `truncar/inserir_lote/contar_lancamentos_financeiro`
2. **Vendas por forma de pagamento** — `parse-vendas-pagamento.ts` → `raw.vendas_pagamento`
3. **Contas a pagar/receber (CAP/CAR)** — `parse-contas-pagar-receber.ts` → `raw.contas_pagar_receber`
4. **Vendas por produto** — `parse-vendas-produto.ts` (fonte pré-existente, integrada ao mesmo padrão visual)

**Padrão de upload:** barra de progresso, status badge (Aguardando / Processando / Concluído / Erro), exibe total de linhas inseridas e última atualização.

**Arquivos novos/modificados:**  
`src/app/admin/uploads/financeiro/page.tsx`, `src/app/admin/uploads/financeiro/actions.ts`, `src/app/admin/uploads/page.tsx`, `src/app/admin/uploads/actions.ts`, `src/lib/carga/parse-lancamentos-financeiro.ts`, `src/lib/carga/parse-vendas-pagamento.ts`, `src/lib/carga/parse-contas-pagar-receber.ts`, `src/lib/carga/parse-vendas-produto.ts`

---

### M4 — Aba Financeiro + sub-aba Fluxo de Caixa (ADR-0060)

Primeiro top-level fora de Performance. Sidebar recebe item "Financeiro" (ícone Wallet) com sub-aba "Fluxo de Caixa" (ícone BarChart3), expansível com persistência em localStorage (`sidebar-financeiro-open`), seguindo o mesmo padrão da seção Performance.

**Rotas criadas:**
- `src/app/financeiro/page.tsx` — redireciona para `/financeiro/fluxo-caixa`
- `src/app/financeiro/layout.tsx` — wraps `PeriodoFilterProvider`
- `src/app/financeiro/fluxo-caixa/page.tsx` — Server Component com 4 chamadas RPC em `Promise.all`

**Componentes:**
- `src/components/financeiro/fluxo-mensal-chart.tsx` — Client Component Recharts `ComposedChart` com dois `Bar` (entrada `#0091B3`, saída `#D9A23F`). Agrega `FluxoMensalRow[]` por mês antes de renderizar.

**KPIs exibidos:**
- Entradas realizadas / Saídas realizadas / Saldo líquido / A receber (em aberto)

**Seções:**
- Fluxo de Caixa Mensal (gráfico de barras)
- Composição do Período (decomposição por grupo, entradas e saídas)
- Posição por Conta (saldo realizado por conta bancária)
- Títulos em Aberto por Aging (agregado por faixa: a vencer / vencido ≤30d / 30–90d / >90d)

**Filtro de período:** `PeriodoFilterUrl` (URL params, `defaultPreset="este-ano"`).

---

## Correções pós-merge (commits diretos em main)

### `09368c8` — RPCs públicas `raw.lancamentos` + parser fix + seed script

**Problema 1 — `Invalid schema: raw`:**  
`raw.lancamentos` não está no `exposed-schemas` do PostgREST (apenas `public, graphql_public`). O código de M4 e M3 tentava acessar `supabase.schema('raw').from('lancamentos')` diretamente, gerando erro 400.

**Fix:** Migration 0060 cria 3 RPCs SECURITY DEFINER no schema `public`:
- `truncar_lancamentos_financeiro()` — TRUNCATE `financeiro.fato_lancamentos, raw.lancamentos RESTART IDENTITY` (ordem importa: FK `fato → raw`)
- `inserir_lote_lancamentos_financeiro(p_linhas JSONB)` — INSERT em lote via `jsonb_array_elements`
- `contar_lancamentos_financeiro()` → BIGINT

`src/app/admin/uploads/financeiro/actions.ts` atualizado para usar as RPCs.

**Problema 2 — parser `numero` sempre NULL:**  
O XLSX do ERP usa hierarquia visual de 3 níveis. O header "Número" está na col A, mas os números reais das transações ficam em col C (`__EMPTY_1`). Parser adicionou `'__EMPTY_1': 'numero'` como primeiro mapeamento no COL_MAP e refinou `toNum()` para suportar o formato "-R$ 8,840.00" (notação contábil do ERP).

**Seed script:** `supabase/seed/seed-lancamentos-financeiro.ts` — carrega o XLSX server-side com SheetJS (`header:1`, `cellDates: true, raw: true`), insere em lotes de 1000, chama `regenerar_financeiro_lancamentos()` e reporta CP-2 KPIs.

---

### `d0c8746` — Corrige shapes das RPCs e crash `TypeError .filter`

**Problema:** Página `/financeiro/fluxo-caixa` crashava com `TypeError: z.filter is not a function` porque os shapes das RPCs foram mal assumidos:

1. `get_proximos_vencimentos` retorna `{ items: [...], total: N }` — não um array flat. O código tratava `data` direto como array e chamava `.filter()` sobre o objeto.
2. `get_posicao_por_conta` retorna rows com campo `tipo_conta` — a interface tinha `tipo`.
3. `ProximoVencimento` interface estava modelada como agregado por tipo_movimento (que não existe na view) — refatorada para refletir as linhas individuais reais da view.

**Fix:**
- Extrai `vencimentosPayload?.items ?? []` do payload paginado
- Interface `PosicaoConta`: `tipo` → `tipo_conta`; TIPO_CONTA_LABEL lookup corrigido
- `ProximoVencimento`: shape completo com `id, numero, vencimento, venda_no, pessoa, descricao, valor, categoria, grupo_categoria, conta, tipo_conta, aging`
- Tabela aging: agrega no cliente por bucket (`agingMap`), exibe A Receber / A Pagar por faixa com sinal de `valor` como proxy

---

## CP-2 — KPIs validados (2026-01-01 → 2026-05-23)

Baseado em **19.093 lançamentos** do arquivo "Lançamentos por categoria 2026.xlsx":

| KPI | Valor |
|-----|-------|
| Entradas realizadas | R$ 12.436.715,87 |
| Saídas realizadas   | R$ 13.466.897,30 |
| Saldo líquido       | R$ −1.030.181,43 |
| Saldo por contas    | R$  2.261.198,39 |

---

## Estado final do codebase

| Área | Status |
|------|--------|
| TypeScript (`npx tsc --noEmit --skipLibCheck`) | ✅ Limpo |
| Migrations 0053–0060 | ✅ Aplicadas no remote |
| Seed `raw.lancamentos` (19.093 lançamentos) | ✅ Carregado em produção |
| CP-2 KPIs validados | ✅ |
| Página `/financeiro/fluxo-caixa` | ✅ Funcional (pós-hotfix d0c8746) |
| ADR docs 0060–0064 | ⚠️ Referenciados no código mas arquivos `.md` ainda não escritos |

---

## Padrão obrigatório — acesso ao raw schema

`raw` NÃO está exposto via PostgREST. Toda escrita/leitura em `raw.lancamentos` deve usar as RPCs públicas SECURITY DEFINER:

```
truncar_lancamentos_financeiro()
inserir_lote_lancamentos_financeiro(p_linhas JSONB)
contar_lancamentos_financeiro() → BIGINT
```

Padrão idêntico ao existente para `raw.vendas_excel` (`inserir_lote_raw`, `truncate_dynamic_tables`).

---

## Pendências para v4.1+

**ADR docs 0060–0064 não escritos**  
Os ADRs foram referenciados no código e nas migrations mas os arquivos `docs/adr/006x-*.md` não foram criados. Escrever antes de iniciar v4.1.

**Sub-abas DRE, Conciliação e Indicadores**  
Foram deliberadamente excluídas do escopo v4.0. `src/app/financeiro/layout.tsx` e o sidebar já têm a estrutura de expansão pronta para adicionar sub-abas.

**Tabela aging — agregação no banco**  
Atualmente agrega no cliente com `agingMap`. Para volumes maiores, considerar view `vw_aging_summary` com GROUP BY no banco.

**`vw_proximos_vencimentos` — paginação no cliente**  
A RPC recebe `p_limite/p_offset` mas a página requisita sempre 200 registros. Implementar paginação real quando o volume de títulos em aberto crescer.

**A Receber vs A Pagar — proxy por sinal de valor**  
A view não tem campo `tipo_movimento`. O critério atual `valor >= 0 → A Receber` funciona para os dados atuais mas pode precisar de revisão se o ERP exportar ambos os tipos com valor absoluto.

**Demonstração para a gestora de Weddings**  
Pendente desde v3.6.

---

## Arquivos modificados ou criados na v4.0

```
src/app/admin/uploads/actions.ts                              ← integra fonte vendas-produto ao padrão
src/app/admin/uploads/financeiro/actions.ts                   ← novo: Server Actions lançamentos financeiros
src/app/admin/uploads/financeiro/page.tsx                     ← novo: UI upload lançamentos financeiros
src/app/admin/uploads/page.tsx                                ← refatora para 4 fontes + padrão uniforme
src/app/financeiro/fluxo-caixa/page.tsx                       ← novo: Server Component Fluxo de Caixa
src/app/financeiro/layout.tsx                                 ← novo: wraps PeriodoFilterProvider
src/app/financeiro/page.tsx                                   ← novo: redirect → /financeiro/fluxo-caixa
src/components/financeiro/fluxo-mensal-chart.tsx              ← novo: Client Component Recharts barras
src/components/layout/sidebar.tsx                             ← adiciona item Financeiro + sub-aba
src/lib/carga/parse-contas-pagar-receber.ts                   ← novo: parser XLSX CAP/CAR
src/lib/carga/parse-lancamentos-financeiro.ts                 ← fix: __EMPTY_1 → numero + toNum BRL
src/lib/carga/parse-vendas-pagamento.ts                       ← novo: parser XLSX vendas por pagamento
src/lib/carga/parse-vendas-produto.ts                         ← integrado ao pipeline unificado
src/types/database.ts                                         ← adiciona raw.lancamentos, financeiro schema, RPCs
supabase/migrations/0053_drop_get_sparklines.sql              ← novo: DROP FUNCTION get_sparklines
supabase/migrations/0054_hotel_fallback_diarias.sql           ← novo: fallback hotel via Diárias/Pacote
supabase/migrations/0055_create_dim_hotel.sql                 ← novo: dim.dim_hotel
supabase/migrations/0056_hotel_id_fk_backfill.sql             ← novo: hotel_id FK + backfill
supabase/migrations/0057_financeiro_schema_raw_tables.sql     ← novo: schema financeiro + raw.lancamentos
supabase/migrations/0058_financeiro_dims_fato.sql             ← novo: dims + fato + regenerar RPC
supabase/migrations/0059_financeiro_views.sql                 ← novo: 4 views + 4 RPCs públicas
supabase/migrations/0060_financeiro_raw_rpcs.sql              ← novo: RPCs SECURITY DEFINER raw access
supabase/seed/seed-lancamentos-financeiro.ts                  ← novo: carrega XLSX + reporta CP-2
```
