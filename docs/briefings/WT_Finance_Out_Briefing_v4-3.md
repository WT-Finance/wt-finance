# WT Finance — Out-Briefing v4.3

**Data:** 2026-05-27  
**Branch:** `feat/v4-3` (base: `feat/v4-2`)  
**Commits v4.3:** ~25 (M0–M7 + refinamentos pós-M7)  
**TypeScript:** limpo (`npx tsc --noEmit`)  
**Migrations aplicadas:** 0080–0086  
**ADRs registrados:** 0080–0083  

---

## Missões implementadas

### M0 — Auditoria: operações Weddings com Custos negativos

Levantamento das 57 operações identificadas no final da v4.2 com `Rec. Líq. > Rec. Bruta`. Classificação em 3 categorias: 37 parcialmente incompletas (ruído de timing — lançamentos carregados antes das vendas), 15 muito incompletas (vendas faltando no ERP), 5 sem vínculo `venda_no`. Análise dos padrões de Reembolso Fornecedor nas 37 parciais: hipótese confirmada para parte delas.

Entregável: relatório `docs/audits/2026-05-26-operacoes-custos-negativos.md` com tabela detalhada, categorização e sugestão de ação por operação. Zero alteração de código.

**Arquivos:** `docs/audits/2026-05-26-operacoes-custos-negativos.md`

---

### M1 — Paleta dessaturada + KPIs reorganizados + PeriodoFilterPillsUrl

Estabeleceu a fundação visual da Visão Geral.

**Paleta dessaturada (ADR-0081):** tokens adicionados ao design system (`src/styles/tokens.css`):
- `--positive` / `--positive-soft` / `--positive-deep` — verde sage (#5F7A3D / #C4D5A6 / #3F5028)
- `--negative` / `--negative-soft` / `--negative-deep` — terracota (#A35442 / #E8C9C0 / #6B2D1F)
- `--neutral` / `--neutral-soft` — dourado pálido (#C99E5E / #F5E6CC)

**PeriodoFilterPillsUrl:** componente `PeriodoFilterPillsUrl` (v3.9) integrado na Visão Geral com `defaultPreset="este-ano"`. Pills: Este ano · Este mês · Mês anterior · Últimos 3m · Últimos 6m · Personalizado. Filtro fica DENTRO da seção Visão Geral, afeta apenas os KPIs (não os gráficos, que têm horizonte fixo).

**KPIs reorganizados:** 3 cards em linha (Entradas realizadas / Saídas realizadas / Resultado de caixa). Cada card com label uppercase + subtítulo "do período" em `var(--text-muted)`. Resultado colorido conforme sinal. KPI "A receber (previsto)" removido da Visão Geral — migrado para a seção Diário.

**Arquivos:** `src/styles/tokens.css`, `src/app/financeiro/fluxo-caixa/page.tsx`, `src/components/shared/periodo-filter-pills-url.tsx`

---

### M2 — Gráfico Fluxo Mensal padrão Weddings + Gráfico Acumulado novo

**FluxoMensalChart refatorado** para o padrão completo da Aba Weddings:
- 4 séries de barras lado a lado: Entrada efetivada / Entrada prevista / Saída efetivada / Saída prevista
- Cores: `var(--positive)` / `var(--positive-soft)` / `var(--negative)` / `var(--negative-soft)` com fillOpacity diferenciado (1.0 efetivado, 0.6 previsto)
- Linha de Resultado mensal sobreposta em `var(--text-primary)`, pontos em `var(--negative-deep)` para meses negativos
- Legenda com 6 itens no rodapé; tooltip CustomTooltip
- Horizonte: 24 meses passados + 18 futuros (fixo, ignora filtro de período)

**Migration 0080:** `get_fluxo_caixa_mensal_v3()` — retorna série completa do horizonte com 4 valores por mês (entradas/saídas × efetivado/previsto).

**FluxoAcumuladoChart novo:**
- BarChart com 4 séries acumuladas (mesmo esquema de cores)
- Linha tracejada vertical "Hoje" posicionada no mês corrente
- Acumulado calculado como soma crescente desde o início do horizonte por tipo

**Migration 0081:** `get_fluxo_caixa_acumulado_v1()` — retorna série acumulada do mesmo horizonte.

**Correções pós-implementação:** barras mais largas (ajuste `barSize`), acumulado como soma contínua corrigida, linha de total saídas adicionada.

**Arquivos:** `src/components/financeiro/fluxo-mensal-chart.tsx`, `src/components/financeiro/fluxo-acumulado-chart.tsx`, `supabase/migrations/0080_get_fluxo_caixa_mensal_v3.sql`, `supabase/migrations/0081_get_fluxo_caixa_acumulado_v1.sql`

---

### M3 — Composição do Período + Posição por Conta com agrupamento

**ComposicaoPeriodo:** dois blocos lado a lado (Entradas / Saídas), cada um listando Grupos de Categoria ordenados por valor absoluto descendente. Para cada grupo: nome + valor total + percentual + barra de progresso visual. Click no grupo expande as Categorias detalhadas. Botão "Ver mais" se houver mais de 5 grupos.

**PosicaoPorConta:** agrupamento por `tipo_conta` (Banco, Gateway, Cartão de Crédito, Caixa Físico, Outro, Investimento). Cada grupo: nome do tipo + total agregado + número de contas. Click expande contas individuais. Ícones Lucide por tipo. "Ver mais" nas contas individuais se houver mais de 5.

**Remoção:** seções Aging e Próximos Vencimentos removidas da Visão Geral (eram resíduo da v4.2; o equivalente passou para a seção Diário como lista Próximos Lançamentos).

**Arquivos:** `src/components/financeiro/composicao-periodo.tsx`, `src/components/financeiro/posicao-por-conta.tsx`

---

### M4 — Estrutura recolhível + KPIs da seção Diário

**TopSection (accordion):** componente `TopSection` para seções recolhíveis com chevron e título. Ambas as seções (Visão Geral e Fluxo de Caixa Diário) iniciam expandidas; estado local, não persistido.

**4 KPIs da seção Diário:**
- Saldo em Caixa — `SUM(saldo)` de contas bancárias excluindo `tipo_conta = 'cartao_credito'`
- A Receber / A Pagar — `SUM(valor_final)` dos títulos futuros nos próximos 10 dias
- NCG 10d = A Receber − A Pagar (colorido conforme sinal, tooltip explicativo)

**Migration 0082:** `get_fluxo_caixa_kpis_diario()` — retorna os 4 valores em um único objeto JSON.

**Arquivos:** `src/components/shared/top-section.tsx`, `supabase/migrations/0082_get_fluxo_caixa_kpis_diario.sql`

---

### M5 — Componente CalendárioLiquidez + drill-down

Componente Client novo `CalendarioLiquidez` (ADR-0082). Grid 7 colunas (Dom–Sáb) × semanas do mês. Cada célula mostra:
- Número do dia
- `+entradas_dia` (verde) e `-saidas_dia` (vermelho) em texto pequeno
- `saldo_dia` formatado com cor conforme sinal

**Cores das células:** `var(--positive-soft)` se `saldo_dia > 0`, `var(--negative-soft)` se `saldo_dia < 0`, sem cor se neutro. Dias fora do mês em opacidade 35%.

**Destaque "hoje":** outline `2px solid var(--brand)` na célula do dia atual.

**Navegação:** setas < e > para mês anterior/próximo; botão "Redefinir" centralizado abaixo da data para voltar ao mês corrente.

**Drill-down:** clique em qualquer célula abre `DrillDownModal` com lista de lançamentos do dia (pessoa, descrição, valor, status). Reutiliza padrão visual de `ProximosLancamentosLateral`.

**Migration 0083:** `get_calendario_liquidez(p_mes_referencia DATE)` — retorna array JSON com todos os dias do mês visível (incluindo dias adjacentes para completar semanas).

**Migration 0084:** `get_lancamentos_do_dia(p_data DATE)` — retorna lançamentos detalhados de uma data específica.

**Arquivos:** `src/components/financeiro/calendario-liquidez.tsx`, `supabase/migrations/0083_get_calendario_liquidez.sql`, `supabase/migrations/0084_get_lancamentos_do_dia.sql`

---

### M6 — Lista Próximos Lançamentos lateral

Componente `ProximosLancamentosLateral` ao lado do calendário em grid 5 colunas (3+2). Mostra os próximos lançamentos a vencer (status `'% Futuro'`) ordenados por data ascendente e valor descendente.

Para cada item: data formatada DD/MM com destaque âmbar se "hoje", pessoa, descrição (truncada), badge "A Receber" ou "A Pagar", valor em cor conforme tipo.

**Migration 0085:** `get_proximos_lancamentos_10d()` — retorna os lançamentos dos próximos 10 dias.

Layout responsivo: lado a lado no desktop (lg:grid-cols-5), empilhado no mobile.

**Arquivos:** `src/components/financeiro/proximos-lancamentos-lateral.tsx`, `supabase/migrations/0085_get_proximos_lancamentos_10d.sql`

---

### M7 — ADRs + versão 4.3.0 + build limpo

**ADRs registrados:**
- `docs/adr/0080-estrutura-dual-fluxo-de-caixa.md` — Visão Geral + Fluxo de Caixa Diário como seções independentes
- `docs/adr/0081-paleta-dessaturada-fluxo-de-caixa.md` — tokens verde sage / terracota no design system
- `docs/adr/0082-calendario-liquidez.md` — especificação do componente CalendárioLiquidez
- `docs/adr/0083-definicao-ncg.md` — NCG = A Receber − A Pagar nos próximos 10 dias

`package.json` atualizado para `"version": "4.3.0"` (sidebar exibe "version 4.3" via leitura dinâmica do `major.minor`).

---

## Refinamentos pós-M7

### Botão "⇅ Inverter saídas" no Fluxo de Caixa Mensal

Funcionalidade adicionada nos dois gráficos FluxoMensalChart: Weddings e Financeiro. Botão no header do card alterna entre exibir saídas como valores positivos (barras acima de zero) ou negativos (barras abaixo de zero, padrão financeiro).

Implementação: `useState<boolean>(invertida)`, função `toChartPoints(rows, invertida)` transforma os valores, YAxis formatter usa `Math.abs`, tooltip exibe `Math.abs`, radius das barras de saída inverte conforme o modo. Animação nas barras: `animationDuration={400}` e `animationEasing="ease-in-out"`.

**Arquivos:** `src/components/financeiro/fluxo-mensal-chart.tsx`, `src/components/weddings/fluxo-caixa-mensal-chart.tsx`

---

### Redesign CalendárioLiquidez

Três ajustes visuais pós-implementação:

1. **Título do card:** "Calendário de Liquidez" adicionado acima da navegação.
2. **Nav reformulado:** mês/ano ("Maio/2026") centralizado na mesma linha das setas, botão "Redefinir" em linha separada abaixo em `text-[9px]` sem borda.
3. **Cores binárias:** removida zona neutra — qualquer `saldo_dia > 0` é verde, qualquer `saldo_dia < 0` é vermelho. Legenda atualizada (apenas dois itens). Decisão: a zona neutra com magnitude relativa do briefing foi trocada por cores diretas — mais legível e mais simples de interpretar.

---

### ProximosLancamentosLateral: filtros + drawer + altura

Série de refinamentos na lista de próximos lançamentos:

**Filtros de período:** pills 5 dias / 10 dias / Personalizado. "Personalizado" abre popover com seletor De/Até (mesmo padrão do `PeriodoFilterPillsUrl`), botões Cancelar/Aplicar, pill exibe o intervalo aplicado após seleção. RPC `get_proximos_lancamentos(p_dias int)` parametric para buscar períodos maiores que 10 dias.

**Migration 0086:** `get_proximos_lancamentos(p_dias int DEFAULT 10)` — substitui e generaliza `get_proximos_lancamentos_10d`. Permissões: `REVOKE FROM PUBLIC`, `GRANT TO service_role`.

**Ver mais como drawer:** botão "Ver mais" (sem contagem, seguindo padrão de `ProximosCasamentosCard` do Weddings) abre `ListDrawer` com a lista completa do período selecionado.

**Reorganização UX:** pills de filtro movidas para dentro do drawer, saindo da visualização inicial do card. Card principal exibe apenas os primeiros 9 lançamentos (10d por padrão) sem distração de controles. Filtros ficam disponíveis no drawer para quem precisa explorar.

**Correção de TypeScript:** `get_proximos_lancamentos` adicionado ao tipo `Database['public']['Functions']` em `src/types/database.ts`.

---

### Equalização de alturas Calendário / Próximos Lançamentos

Após múltiplas tentativas com `overflow-hidden` + `h-full` (comportamento imprevisível no track sizing do CSS Grid em diferentes navegadores), a abordagem final usa layout simétrico puro:

- Ambos os wrappers de grid item têm `flex flex-col` (sem `overflow-hidden`)
- Ambos os cards dentro têm `flex-1` (em vez de `h-full`)
- O card de lancamentos mantém `flex-1 flex flex-col` internamente com `flex-1 overflow-y-auto min-h-0` na lista para scroll correto
- O calendário usa `flex-1` simples (sem `flex flex-col` adicional, conteúdo flui naturalmente)
- `paddingBottom: '21.5px'` removido do calendário (era hack de compensação)

O CSS Grid `align-items: stretch` (padrão) + `flex-1` em ambos os cards garante alturas iguais sem truques.

**Arquivos modificados:** `src/app/financeiro/fluxo-caixa/page.tsx`, `src/components/financeiro/calendario-liquidez.tsx`, `src/components/financeiro/proximos-lancamentos-lateral.tsx`

---

## Estado final do codebase

| Área | Status |
|------|--------|
| TypeScript (`npx tsc --noEmit`) | ✅ Limpo |
| Build (`npm run build`) | ✅ Sem erros |
| Migrations 0080–0086 | ✅ Aplicadas no remote |
| ADRs 0080–0083 | ✅ Documentados |
| Versão na sidebar | ✅ "version 4.3" |

---

## Pendências para v4.4

**Sub-aba DRE (candidato principal)**
- DRE evolutiva mensal — prioridade alta após conclusão da reformulação visual do Fluxo de Caixa
- Segregar Conta Investimento XP como Receitas Financeiras (separada de Operacionais)
- Comparativo mês atual vs média YTD
- Top despesas do mês

**Conectividade cross-section (v4.5+)**
- Clicar em conta na Posição filtra a Composição
- Aging e Próximos Vencimentos com conectividade entre seções (explicitamente fora do escopo da v4.3)
- Persistência do estado de expansão das seções em localStorage

**Pendências operacionais (não-código)**
- 20 operações Weddings graves (15 muito incompletas + 5 sem venda) — Yan corrige no ERP com base no relatório M0
- 725 títulos futuros sem Conta (Previsão) — pendência cadastral progressiva
- 554 lançamentos previstos sem Conta — pendência cadastral progressiva
- Demonstração da plataforma para gestora de Weddings (pendente desde v3.6)
- RPC `get_sparklines` morta no banco — limpar via migration de higiene

---

## Arquivos modificados ou criados na v4.3

```
src/styles/tokens.css                                              ← paleta dessaturada (--positive/--negative/--neutral + variantes)
src/app/financeiro/fluxo-caixa/page.tsx                           ← estrutura dual, todas as RPCs, grid calendário/lancamentos
src/components/shared/top-section.tsx                             ← novo: accordion recolhível
src/components/shared/periodo-filter-pills-url.tsx                ← adaptado para Financeiro
src/components/financeiro/fluxo-mensal-chart.tsx                  ← reescrito: padrão Weddings + botão Inverter saídas
src/components/financeiro/fluxo-acumulado-chart.tsx               ← novo: acumulado 4 séries + linha Hoje
src/components/financeiro/composicao-periodo.tsx                  ← novo: decomposição por grupo com expansão
src/components/financeiro/posicao-por-conta.tsx                   ← novo: agrupamento por tipo_conta com expansão
src/components/financeiro/calendario-liquidez.tsx                 ← novo: calendário navegável + drill-down modal
src/components/financeiro/proximos-lancamentos-lateral.tsx        ← novo: lista lateral + filtros + drawer Ver mais
src/components/weddings/fluxo-caixa-mensal-chart.tsx              ← botão "⇅ Inverter saídas"
src/types/database.ts                                             ← get_proximos_lancamentos adicionado
docs/adr/0080-estrutura-dual-fluxo-de-caixa.md                   ← novo
docs/adr/0081-paleta-dessaturada-fluxo-de-caixa.md               ← novo
docs/adr/0082-calendario-liquidez.md                              ← novo
docs/adr/0083-definicao-ncg.md                                    ← novo
docs/audits/2026-05-26-operacoes-custos-negativos.md              ← novo (M0)
supabase/migrations/0080_get_fluxo_caixa_mensal_v3.sql            ← horizonte 24m+18m, 4 séries
supabase/migrations/0081_get_fluxo_caixa_acumulado_v1.sql         ← acumulado mesmo horizonte
supabase/migrations/0082_get_fluxo_caixa_kpis_diario.sql          ← saldo_em_caixa, a_receber_10d, a_pagar_10d, ncg_10d
supabase/migrations/0083_get_calendario_liquidez.sql              ← grid de dias com entradas/saídas/saldo por dia
supabase/migrations/0084_get_lancamentos_do_dia.sql               ← drill-down: lançamentos de uma data
supabase/migrations/0085_get_proximos_lancamentos_10d.sql         ← lista fixa 10 dias (SSR da page)
supabase/migrations/0086_get_proximos_lancamentos.sql             ← parametric p_dias (drawer filtros)
```
