# WT Finance — Out-Briefing v4.8.1

**Data:** 2026-06-01 · **Branch:** `feat/v4-8-1` · **Versão:** 4.8.0 → **4.8.1**
**Tema:** Patch de refinamento visual sobre a v4.8 (drawers Weddings, padrão de gráficos, cards clicáveis). Sem capacidade nova — refina dentro dos ADRs 0095/0096. Executado em 1 wave de 4 subagentes editores (arquivos disjuntos).

---

## Ajustes implementados

| # | Ajuste | Arquivo(s) |
|---|--------|-----------|
| 1 | Eixo Y sem quebra (Faturamento por Subsetor + Comparação) | `kpi-principal-drawer.tsx` (ChartYAxisBRL width 76) |
| 2 | Comparação Ano Anterior com **receita** (4 linhas) — frontend puro | `kpi-principal-drawer.tsx` (+ token `--text-secondary`) |
| 3 | Tooltip nome à esquerda / valor à direita + `tabular-nums` | `custom-tooltip.tsx` (primitivo) + StackedTooltip em `kpi-principal-drawer.tsx` |
| 4 | Pills sticky grudadas ao cabeçalho (sem fresta) | `kpi-principal-drawer.tsx` |
| 5 | Caixa Acumulado: **Entradas e Saídas separadas** (toca backend) | `drilldown-drawer.tsx` + `api.ts` + **migration 0104** |
| 6 | Drawer de Operações mais clean (largura, KPIs sem borda, espaçamento) | `drilldown-drawer.tsx` |
| 7 | Hover cor-da-aba em cards clicáveis (convenção) | `weddings-kpis-section.tsx` + `globals.css` + `design-system/page.tsx` |

### Detalhes
- **#2:** `get_tendencia_margem` já retornava `receita` (atual em `data.tendencia`, ano anterior em `data.yoyTendencia`) — nenhuma migration. 4 `<Line>`: cor distingue métrica (Faturamento `var(--brand)` dourado, Receita `var(--text-secondary)` cinza-azulado), traço distingue período (atual sólido, ano anterior tracejado `5 4` 1,5px). Legenda 2×2. Título → "Comparação Ano Anterior".
- **#5 (migration 0104):** `CREATE OR REPLACE get_operacao_weddings` baseada na 0103, mudando só `acumulado_mensal` → por mês `{entrada_efetiva, entrada_projetada, saida_efetiva, saida_projetada, eh_futuro}` (running sums sobre série contínua; efetivo só liquidados/NULL futuro; projetado por COALESCE). Front: 2 linhas (Entradas verde / Saídas vermelho), efetiva sólida + projetada tracejada, marcador "hoje". **Aplicada + verificada via anon.**
- **#7:** utilitária `.card-clicavel`/`.card-clicavel-cta` keyed em `var(--brand)` (resolvida por `[data-theme]`) — abas futuras herdam pela var. Aplicada ao card KPI de Weddings; documentada na design-system.

---

## Migrations
- **0104** `get_operacao_weddings_caixa_entradas_saidas` — reescreve `acumulado_mensal`. CREATE OR REPLACE (não destrutiva), por operação (<3s). Aplicada + verificada.

## ADRs
Nenhum novo — refino dentro de ADR-0095 (gráficos) e ADR-0096 (drawer Operações).

## Gates
- ✅ build · ✅ tsc · ✅ lint **sem warnings novos** (comparado ao baseline do main, por arquivo).
- ✅ Smoke (REST anon) das RPCs afetadas.

## CLAUDE.md
- Adicionada linha em "Convenções de código": afordância de card clicável (hover na cor da aba). Permanente + transversal (ajuste 7).

## Observações
- **Merge ASAP:** a 0104 muda (pela 3ª vez) o contrato de `get_operacao_weddings` de forma incompatível com o drawer da v4.8 ainda em produção até o deploy do merge.
- **Aprendizado de processo:** um subagente (A) saiu do "arquivo único" para definir o token `--text-secondary` faltante em `tokens.css`/`globals.css`, criando sobreposição com o agente D (que também tocou `globals.css`). As duas edições coexistiram (sem clobber), mas reforça: ao paralelizar, instruir explicitamente que tokens/CSS globais são arquivos compartilhados — sequenciar ou designar um único dono.

## Arquivos
**Novos:** `supabase/migrations/0104_*.sql`; `docs/briefings/WT_Finance_Out_Briefing_v4-8-1.md`.
**Modificados:** `src/components/weddings/{kpi-principal-drawer.tsx,drilldown-drawer.tsx,weddings-kpis-section.tsx}`; `src/components/charts/custom-tooltip.tsx`; `src/types/api.ts`; `src/styles/tokens.css`; `src/app/globals.css`; `src/app/admin/design-system/page.tsx`; `package.json`; `CHANGELOG.md`; `CLAUDE.md`.
