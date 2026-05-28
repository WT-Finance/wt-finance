# WT Finance — Out-Briefing v4.5

**Data:** 2026-05-28  
**Branch:** `feat/v4-5` (base: `main` após merge de v4.4)  
**Commits:** 25 (M0–M8 + refinamentos pós-revisão)  
**TypeScript:** limpo (`npx tsc --noEmit`)  
**Build:** limpo (`npx next build`)  
**Migrations criadas:** 0090–0091  
**ADRs:** 0087 (novo), 0088 (novo), 0081 (atualizado)  
**PR:** #74  

---

## Missões implementadas

### M0 — Limpezas pontuais

Fechamento de débitos técnicos pós-v4.4:

- **Migration 0090** — `DROP FUNCTION IF EXISTS public.get_sparklines CASCADE`. RPC morta no frontend desde v3.9; confirmação por grep + pg_stat_user_functions.
- **Migration 0089 descartada** — arquivo removido do repositório via `git rm`. Drawer KPI principal usa RPCs existentes; `get_kpi_weddings_drawer` nunca foi necessária.
- **ADR-0081 atualizado** — nota retroativa documenta que pontos negativos do gráfico Fluxo Mensal Financeiro usam `var(--danger)` (#B85C5C) em vez de `var(--negative-deep)` (correção aplicada na v4.4, agora formalizada).
- **CHANGELOG.md** — seção `[4.5.0] — Unreleased` criada.
- **Migrations 0087/0088** — confirmadas presentes no repositório (prontas para aplicar no remote).

**Arquivos:** `supabase/migrations/0090_drop_get_sparklines.sql`, `CHANGELOG.md`, `docs/adr/0081-paleta-dessaturada-fluxo-de-caixa.md`

---

### M1 — Consolidação design system + ADR-0087 + `/admin/design-system`

**M1.1 — Tokens semânticos de subsetores**

Adicionados 5 tokens a `src/styles/tokens.css`:
```css
--subsetor-comercial:    #8C857B;
--subsetor-planejamento: #8F7E35;
--subsetor-producao:     #874B52;
--subsetor-hospedagens:  #4B4F54;
--subsetor-extras:       #7A8289;
```

Todas as ocorrências de hex hardcoded em `weddings-kpis-section.tsx` e `sumario-subsetor.tsx` substituídas por `var(--subsetor-*)`.

**M1.2 — ADR-0087**

Documenta a decisão de centralização de tokens, convenção de nomenclatura `--{categoria}-{nome}[-{variante}]`, catálogo visual e justificativa.

**M1.3 — Página `/admin/design-system`**

Catálogo visual estático com 10 seções e navegação por âncoras:
1. Paleta Brand Welcome
2. Paleta Dessaturada (Fluxo de Caixa)
3. Cores de Subsetores Weddings
4. Tipografia
5. Cards (default / featured / size sm)
6. Pills e Botões de Filtro
7. Tabelas e Listas
8. Gráficos — Referência de Cores
9. Drawers — Padrão Estrutural
10. Componentes Compartilhados

Acesso administrativo apenas (`/admin/`). `export const dynamic = 'force-dynamic'`.

**Arquivos:** `src/styles/tokens.css`, `src/components/weddings/sumario-subsetor.tsx`, `src/components/weddings/weddings-kpis-section.tsx`, `src/app/admin/design-system/page.tsx`, `docs/adr/0087-tokens-semanticos-consolidados.md`

---

### M2 — Refinamento margens KPI principal Weddings

Padding do card principal reduzido de `py-4` para `pt-4 pb-2` e margem do "Ver mais ›" de `mt-3` para `mt-2`. Elimina o vazio vertical excessivo abaixo das variações YoY.

**Arquivos:** `src/components/weddings/weddings-kpis-section.tsx`

---

### M3 — Remover MoM dos cards Weddings

Variação MoM (`varAnt`) removida do componente `KpiColuna`. Cards Weddings (principal + subsetores) exibem apenas YoY, que tem significado consistente em qualquer filtro de período. YoY nos cards de subsetor aguarda extensão da RPC `get_sumario_subsetor` (pendência M3b — implementada separadamente nesta sessão via segunda chamada paralela à RPC).

**Arquivos:** `src/components/weddings/weddings-kpis-section.tsx`

---

### M4 — Composição dos Lançamentos: rename + subtítulo

`composicao-periodo.tsx` → `composicao-lancamentos.tsx`. Título visual atualizado para "Composição dos Lançamentos" com subtítulo "no período selecionado" via `<CardTitle subtitulo>`. Padrão idêntico a Mix por Produto e Composição por Subsetor de Weddings. Import atualizado em `fluxo-caixa/page.tsx`.

**Arquivos:** `src/components/financeiro/composicao-lancamentos.tsx`, `src/app/financeiro/fluxo-caixa/page.tsx`

---

### M5 — Próximos Lançamentos reformulado (ADR-0088)

Reformulação completa do componente com três frentes:

**M5.1 — Vista lateral (card)**
- Título `text-base font-semibold` — alinhado ao Calendário de Liquidez
- Pills de tipo no header: Todos / A receber / A pagar (toggle exclusivo)
- Formato tabular com 4 colunas: ícone + data | pessoa | valor
- Cabeçalho de coluna `Data | Pessoa | Valor`
- LIMITE_INICIAL = 11 linhas
- Ícone separado em coluna própria; data sempre numérica (sem badge HOJE)
- Descrição exibida sempre que não-nula (filtro `!== 'Pagamento venda'` removido)

**M5.2 — Drawer "Ver mais"**
- Subtítulo "Próximos lançamentos de contas a pagar e a receber." via prop `subtitulo` do `ListDrawer` — acima da linha divisória (padrão documentado no design system)
- Pills de tipo e período sticky no topo
- Cabeçalhos de coluna sorteáveis (`SortTh`): Data ▲▼ / Pessoa ▲▼ / Valor ▲▼
- Sort client-side: `vencimento:asc` (default), `pessoa:asc`, `valor_final:asc/desc`

**M5.3 — Migration 0091**
```sql
ALTER FUNCTION public.get_proximos_lancamentos(INT) →
CREATE OR REPLACE FUNCTION public.get_proximos_lancamentos(
  p_dias INT DEFAULT 10,
  p_tipo TEXT DEFAULT NULL  -- 'A Receber Futuro' / 'A Pagar Futuro' / NULL para ambos
)
```

**Arquivos:** `src/components/financeiro/proximos-lancamentos-lateral.tsx`, `supabase/migrations/0091_alter_get_proximos_lancamentos_tipo.sql`, `docs/adr/0088-padrao-proximos-lancamentos.md`

---

### M6 — Investigação operações sem duração

**Causa raiz identificada:** dupla — problema de dados (campo `data_venda_contrato` NULL para operações sem linha de contrato no ERP) e bug de código (timezone unsafe + exibição de durações negativas).

**Correção aplicada em `lista-operacoes.tsx`:**
- `new Date('YYYY-MM-DD')` → `Date.UTC()` com string split (timezone-safe)
- `return dias >= 0 ? dias : null` — silencia durações negativas (erros de cadastro)

**Pendência operacional:** Yan corrige `data_venda_contrato` no ERP para Natalhia/Vinicius, Isabela/Fabiano e outras operações afetadas, depois executa `SELECT public.regenerar_dim_operacao_weddings()`.

**Arquivos:** `src/components/weddings/lista-operacoes.tsx`, `docs/audits/2026-05-28-duracao-operacoes-weddings.md`

---

### M7 — Audit completo (8 dimensões)

18 achados auditados, 2 resolvidos inline:
- Import não usado `PeriodoCustomizado` removido em `periodo-filter.tsx`
- Card residual `border border-[--border]` migrado para `shadow-sm` em `proximos-lancamentos-lateral.tsx`

16 pendências registradas para v4.6+. Ver relatório completo em `docs/audits/2026-05-28-audit-completo-v4-5.md`.

**Estado saudável confirmado:** zero hex hardcoded de subsetores, zero erros TypeScript, zero `@ts-ignore`, 61/61 RPCs com `SECURITY DEFINER`, zero service role key em código client.

---

### M8 — Fechamento

- `package.json` → `version: "4.5.0"`
- `src/lib/version.ts` atualizado para `'4.5.0'`
- `CHANGELOG.md` com entrada `[4.5.0]` completa

---

## Refinamentos pós-revisão

### Cards de subsetor Weddings — YoY em 3 métricas

YoY adicionado aos 5 cards de subsetor via segunda chamada paralela a `get_sumario_subsetor` com datas YoY (sem migration). Layout com coluna de 56px de largura fixa para alinhamento vertical:

```
COMERCIAL
                         YoY    ← cabeçalho da coluna
R$ 130,3k          ↑8.3%
─────────────────────────
Receita   R$ 126k   ↑5.2%
Margem    96.8%    +1.2 p.p.
```

- Faturamento e Receita: variação percentual `↑/↓X.X%`
- Margem: diferença absoluta em pontos percentuais `+/−X.X p.p.`

**Arquivos:** `src/app/performance/weddings/actions.ts`, `src/components/weddings/weddings-kpis-section.tsx`

---

### Pills — padrão design system unificado

Pills de Próximos Lançamentos (tipo + período) alinhadas ao padrão das pills de Visão Geral:

| Estado | Estilo |
|--------|--------|
| Ativo | `background: var(--brand-soft)` · `borderColor: var(--brand)` · `color: var(--brand-deep)` |
| Inativo | `border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50` |

Dois tamanhos documentados:
- **`md`** — `px-3 py-1 text-xs`: Visão Geral, drawers analíticos
- **`sm`** — `px-2.5 py-0.5 text-[11px]`: Próximos Lançamentos, filtros inline

Padrão atualizado no catálogo `/admin/design-system` (seção 6).

---

### Drawer Próximos Lançamentos — melhorias incrementais

- Subtítulo movido para prop `subtitulo` do `ListDrawer` (acima da linha divisória, padrão documentado no design system seção 9)
- Descrição "Pagamento venda" volta a ser exibida (filtro condicional removido)
- Cabeçalho coluna "Pessoa" sem sublabel "Descrição"
- Cabeçalhos de coluna sorteáveis com `SortTh` (padrão de Lista de Operações)
- Pills com tamanho `sm` e estilo brand-soft ativo
- Títulos de coluna `text-xs` no drawer (maiores que no card lateral)

---

## Migrations

| Nº | Descrição | Status |
|----|-----------|--------|
| 0090 | DROP `get_sparklines` (morta desde v3.9) | Aplicar no remote |
| 0091 | ALTER `get_proximos_lancamentos` — parâmetro `p_tipo TEXT DEFAULT NULL` | Aplicar no remote |
| 0089 | ~~Descartada~~ — removida do repositório | — |

---

## Estado final do codebase

| Área | Status |
|------|--------|
| TypeScript (`npx tsc --noEmit`) | ✅ Limpo |
| Build (`npx next build`) | ✅ Sem erros |
| Migrations 0090–0091 | ✅ Prontas para aplicar no remote |
| ADRs 0087, 0088, 0081 | ✅ Documentados/atualizados |
| Audit completo 8 dimensões | ✅ Relatório em `docs/audits/` |
| PR #74 | ✅ Aberto, pronto para merge |

---

## Pendências para v4.6

**Do audit M7:**
- 7 RPCs órfãs no banco (`get_fluxo_caixa_kpis_b`, `get_historico_12m`, etc.)
- Middleware de proteção `/admin/*` (depende de proteção upstream)
- `export const dynamic` em 2 páginas sem fetch de dados
- 2 usos de `any` evitáveis em Server Actions
- Vulnerabilidades npm (next + xlsx — sem fix oficial disponível)
- Ver relatório completo: `docs/audits/2026-05-28-audit-completo-v4-5.md`

**M3b — YoY nos cards de subsetor via RPC:**
Implementado via segunda chamada a `get_sumario_subsetor`. Se no futuro o volume de dados crescer e o custo de 2 chamadas paralelas for perceptível, considerar estender a RPC com parâmetros `p_yoy_from`/`p_yoy_to`.

**Demonstração para a gestora de Weddings:**
Pendente desde v3.6. Momento ideal com v4.5: cards de subsetor com YoY, drawer analítico funcionando, design consolidado.

**DRE evolutiva:**
Reservada para v4.6 — terceira versão consecutiva de adiamento deliberado para priorizar base sólida.

---

## Arquivos modificados ou criados na v4.5

```
src/styles/tokens.css                                              ← 5 tokens --subsetor-*
src/app/admin/design-system/page.tsx                              ← novo: catálogo visual 10 seções
src/app/performance/weddings/actions.ts                           ← 2ª chamada get_sumario_subsetor (YoY)
src/app/financeiro/fluxo-caixa/page.tsx                          ← import composicao-lancamentos
src/components/weddings/weddings-kpis-section.tsx                ← M2, M3, YoY subsetores
src/components/weddings/sumario-subsetor.tsx                     ← var(--subsetor-*)
src/components/weddings/lista-operacoes.tsx                      ← fix calcularDuracao
src/components/financeiro/composicao-lancamentos.tsx             ← renomeado de composicao-periodo.tsx
src/components/financeiro/proximos-lancamentos-lateral.tsx       ← M5 completo + refinamentos
CHANGELOG.md                                                      ← entrada v4.5.0
docs/adr/0081-paleta-dessaturada-fluxo-de-caixa.md               ← nota retroativa --danger
docs/adr/0087-tokens-semanticos-consolidados.md                  ← novo
docs/adr/0088-padrao-proximos-lancamentos.md                     ← novo
docs/audits/2026-05-28-duracao-operacoes-weddings.md             ← novo
docs/audits/2026-05-28-audit-completo-v4-5.md                   ← novo
supabase/migrations/0090_drop_get_sparklines.sql                 ← novo (aplicar)
supabase/migrations/0091_alter_get_proximos_lancamentos_tipo.sql ← novo (aplicar)
```
