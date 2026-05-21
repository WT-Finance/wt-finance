# WT Finance — Out-Briefing v3.7

**Data:** 2026-05-20  
**Branch:** `feat/v3-7-design-system` → mergeado via PR #55  
**Commits:** 11 (histórico limpo, squash aplicado)

---

## O que foi entregue

### Design System completo (M1–M7)

A v3.7 estabelece a fundação visual que as versões anteriores não tinham. Todo o trabalho de interface agora parte de um vocabulário visual único e consistente.

**M1 — Fonte Avenir LT Std** (ADR-0039)  
A fonte corporativa da Welcome Trips foi carregada como fonte primária do dashboard via `@font-face` auto-hospedada. Cinco pesos disponíveis (Light a Heavy). O dashboard agora tem a mesma identidade tipográfica dos materiais impressos.

**M2 — Sistema de tokens CSS** (ADR-0040)  
Criado `src/styles/tokens.css` com três camadas semânticas:
- Tokens globais: texto, superfície, borda (`--text-primary`, `--border`, etc.)
- Tokens de feedback: `--success`, `--warning`, `--danger` com suas variantes de fundo (`-bg`)
- Tokens de marca por aba: `--brand` muda conforme `[data-theme]` no `<html>`

Todos expostos como utilities Tailwind (`text-success`, `bg-warning-bg`, etc.) via `@theme inline`.

**M3 — Padrão universal de cards** (ADR-0041)  
Todos os cards do dashboard usam o mesmo wrapper, a mesma borda, a mesma sombra e o mesmo padrão de título. Antes havia variações em ~20 componentes.

**M4 — Remoção de recolhibilidade individual** (ADR-0042)  
Cards não recolhem mais individualmente. Apenas as seções de nível superior (`TopSection`) têm `<details open>` — suficiente para o caso de uso real.

**M5 — Sidebar com cor dinâmica por aba** (ADR-0043)  
`ThemeProvider` (Client Component) seta `data-theme` no `<html>` ao navegar. A sidebar lê `var(--brand)` — cor muda automaticamente: âmbar em Weddings, teal em Trips, cinza em Corporativo. Zero re-render de componentes.

**M6 — Remoção de sparklines** (ADR-0044)  
Sparklines removidas dos KPI cards. Área disponível era pequena demais para comunicar tendência com precisão; as variações numéricas (vs anterior, YoY) já fazem esse trabalho melhor. Eliminada uma chamada de banco por carregamento.

**M7 — Cores de feedback em todo o codebase**  
`text-emerald-*`, `text-red-*`, `text-amber-*` substituídos pelos tokens semânticos em todos os componentes. A paleta terrosa do design system agora é consistente em todo lugar: `text-success` (verde oliva), `text-warning` (âmbar terra), `text-danger` (vermelho terra).

---

### Correções pós-review

**Composição por Subsetor — redesign completo**  
O layout side-by-side (gráfico Recharts à esquerda + tabela à direita) foi eliminado. Problema: impossível alinhar barras do gráfico com linhas da tabela por serem dois sistemas de coordenadas independentes. Solução: tabela única com coluna "Distribuição" contendo barras CSS proporcionais inline. Alinhamento garantido por estrutura. Recharts removido deste componente.

**Fixes de cores esquecidos no M7**  
- `pontos-atencao-card.tsx`: `bg-red-50/amber-50` → `bg-danger-bg/bg-warning-bg`
- `cagr-card.tsx`: `text-emerald-600/red-500` → `text-success/text-danger`

---

### Nova visualização — Fluxo de Caixa Mensal

Componente `FluxoCaixaMensal` adicionado na seção "Visão Analítica por Operação" da aba Weddings (entre a Lista de Operações e o Acumulado de Recebimentos).

Layout: barras divergentes — entradas sobem acima do eixo X, saídas descem abaixo. Uma linha conecta o resultado mensal (entrada − saída). Efetivado em cor sólida, previsto em 35% opacidade.

**Limitação conhecida:** os valores mensais são derivados do acumulado existente (`entrada_acum[i] − entrada_acum[i-1]`). A distinção efetivado/previsto é por mês inteiro via `eh_futuro` — não há granularidade dentro de um mesmo mês. Para separar efetivado de previsto intra-mês, seria necessária uma nova RPC com `entrada_efetivado` e `entrada_previsto` como campos separados.

---

## Estado do codebase

| Área | Status |
|------|--------|
| TypeScript (`npx tsc --noEmit`) | ✅ Limpo |
| Tokens CSS semânticos | ✅ Aplicados em todo o codebase |
| Cores hardcoded (emerald/red/amber) | ✅ Eliminadas |
| Fonte Avenir | ✅ Carregada e aplicada |
| Sidebar dinâmica | ✅ Funcionando nas 3 abas |
| Tabela Subsetor | ✅ Sem overflow, barras alinhadas |

---

## Decisões pendentes para v3.8+

**Fluxo de Caixa Mensal — dados granulares**  
Se a gestora de Weddings pedir distinção efetivado/previsto intra-mês, criar RPC `get_fluxo_caixa_mensal_weddings` com campos separados. A base de dados já tem a informação necessária (data do lançamento vs data do evento).

**Tooltips dos gráficos Recharts**  
Todos os `<Tooltip />` usam o estilo padrão do Recharts (branco, sombra genérica). Um `contentStyle` customizado com `var(--surface)`, `var(--border)` e fonte Avenir unificaria a experiência em todos os charts. Estimativa: ~30 min, impacto visual alto.

**Aba Performance — seções desatualizadas**  
`performance-content.tsx` usa o componente `Section` antigo (sem o estilo de borda/brand do `TopSection` da aba Weddings). Se quisermos paridade visual entre abas, a atualização é direta.

**Trips e Corporativo**  
Ainda sem conteúdo específico de setor. Exibem a mesma `PerformanceContent` genérica. Roadmap ainda a definir com a diretoria.

**Compartilhamento com a gestora de Weddings**  
Pendente desde v3.6. A v3.7 melhorou significativamente a apresentação visual — momento oportuno para agendar uma demonstração e coletar feedback estruturado antes de continuar adicionando features.

---

## Arquivos-chave modificados ou criados na v3.7

```
src/styles/tokens.css                           ← novo: todos os tokens semânticos
src/components/layout/theme-provider.tsx        ← novo: ThemeProvider para data-theme
src/components/weddings/fluxo-caixa-mensal.tsx  ← novo: Fluxo de Caixa Mensal
src/app/globals.css                             ← @font-face Avenir + @theme inline tokens
src/components/layout/sidebar.tsx               ← var(--brand) em vez de var(--primary)
src/components/weddings/sumario-subsetor.tsx    ← tabela com barras CSS inline (sem Recharts)
src/lib/config.ts                               ← margemColor com tokens semânticos
src/components/shared/kpi-card.tsx              ← sem sparklines, tokens de feedback
```
