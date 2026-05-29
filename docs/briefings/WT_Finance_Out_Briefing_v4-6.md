# WT Finance — Out-Briefing v4.6

**Data:** 2026-05-28  
**Branch:** `feat/v4-6` (base: `main` após merge de v4.5)  
**Commits:** 38 (M0–M10 + correções pós-revisão + patch logos)  
**TypeScript:** limpo (`npx tsc --noEmit`)  
**Migrations criadas:** 0093–0096  
**ADRs:** 0089 (novo), 0090 (novo)  
**Versão:** 4.6.1 (patch dos logos aplicado após 4.6.0)  
**PR:** #78  

---

## Missões implementadas

### M0 — Limpezas audit grupo 1: DROP RPCs órfãs + exclusão /admin/contas-bancarias

**Migration 0093** dropa 6 RPCs confirmadas como órfãs (zero callers no frontend): `get_fluxo_caixa_mensal`, `get_fluxo_caixa_mensal_b`, `get_historico_12m`, `get_proximos_vencimentos`, `get_proximos_vencimentos_v2`, `get_config_numeric`. `get_fluxo_caixa_kpis_b` foi excluída do DROP por ter 1 caller ativo em `page.tsx`.

Diretório `src/app/admin/contas-bancarias/` removido inteiramente (3 arquivos). Nenhum link na sidebar apontava para a rota. CHANGELOG atualizado com seção `[Unreleased]`.

**Arquivos:** `supabase/migrations/0093_drop_rpcs_orfas.sql`, `CHANGELOG.md`

---

### M1 — npm audit fix + migração xlsx → @e965/xlsx

`npm audit fix` aplicado — vulnerabilidades de `next`, `brace-expansion` e `ws` corrigidas. `xlsx` (fork sem manutenção, com vulnerabilidade high) removido do `package.json`. `@e965/xlsx ^0.20.3` (fork mantido) adicionado como substituto.

Todos os imports em `src/lib/carga/*.ts`, `src/components/weddings/lista-operacoes.tsx` e `supabase/seed/*.ts` atualizados de `'xlsx'` para `'@e965/xlsx'` (8 arquivos, imports estáticos e dinâmicos).

**Arquivos:** `package.json`, `src/lib/carga/*`, `supabase/seed/*`

---

### M2 — Acessibilidade + tipagem

`aria-label='Data inicial'` e `aria-label='Data final'` adicionados nos inputs date de 4 componentes de filtro de período: `periodo-filter-pills-url.tsx`, `periodo-filter.tsx`, `periodo-filter-url.tsx`, `kpi-principal-drawer.tsx`.

`labelFormatter` em `CustomTooltip` ajustado para `(label: any, payload?: any)` com `eslint-disable-next-line` — Recharts usa `any` internamente e não há como tipar sem conflito.

**Arquivos:** `src/components/shared/periodo-filter*.tsx`, `src/components/weddings/kpi-principal-drawer.tsx`, `src/components/charts/custom-tooltip.tsx`

---

### M3 — Tokens semânticos de gráfico (ADR-0090)

7 tokens novos em `src/styles/tokens.css`:
```css
--chart-axis-tick: #52525b;
--chart-grid:      #e4e4e7;
--chart-success:   #10b981;
--chart-warning:   #f97316;
--chart-danger:    #dc2626;
--chart-neutral:   #94a3b8;
--chart-info:      #6366f1;
```

25+ hex hardcoded substituídos em 10 componentes de gráfico Recharts. Página `/admin/design-system` seção 8 atualizada. ADR-0090 criado.

**Arquivos:** `src/styles/tokens.css`, `src/components/{dashboard,executiva,performance,financeiro,weddings}/*chart*.tsx`, `docs/adr/0090-tokens-grafico.md`

---

### M4 — Layout admin compartilhado

`src/app/admin/layout.tsx` criado como Server Component com header "Administração" e hook de comentário para futura proteção de acesso. Rotas `/admin/uploads` e `/admin/design-system` renderizam sob o novo layout sem regressão.

**Arquivos:** `src/app/admin/layout.tsx`

---

### M5 — Modelo de dados Gerencial (ADR-0089)

**Migration 0094** cria:
- `analytics.gerencial_lancamentos` — tabela principal com constraints CHECK, índices, trigger `BEFORE UPDATE` para `atualizado_em` e permissões `service_role`
- `analytics.gerencial_saldos` — tabela de saldos iniciais com seed: Itaú, Asaas, Blimboo, Clara (saldo 0)

ADR-0089 documenta a decisão arquitetural: primeira escrita persistente da plataforma, modelo de dados próprio independente do ERP.

**Arquivos:** `supabase/migrations/0094_create_gerencial_tables.sql`, `docs/adr/0089-fluxo-caixa-gerencial.md`

---

### M6 — Parser Excel + Server Actions de importação

`src/lib/gerencial/parser.ts` — parser da planilha Excel:
- Usa `await import('@e965/xlsx')` **dinâmico** (não estático) para evitar falha no ambiente serverless
- Usa a primeira aba disponível (sem exigir nome fixo)
- Detecção de colunas **case-insensitive** com trim
- Chave de duplicata: `tipo|pessoa.toLowerCase()|valor.toFixed(2)|vencimento`

`src/app/financeiro/fluxo-caixa/gerencial/actions.ts` — Server Actions:
- `computeImportDiff(planilha)` — compara planilha com banco via `get_gerencial_lancamentos_planilha`, retorna 4 listas (adicionar/remover/atualizar/manter)
- `commitImport(planilha)` — executa `batch_gerencial_import` RPC atomicamente com lote_id UUID

`src/components/financeiro/gerencial/import-drawer.tsx` — UI de 3 etapas (upload → preview diff → confirmação). Parsing executa **no browser** (`await direto sem useTransition`), diff e commit via Server Actions.

**Arquivos:** `src/lib/gerencial/parser.ts`, `src/app/financeiro/fluxo-caixa/gerencial/actions.ts`, `src/components/financeiro/gerencial/import-drawer.tsx`

---

### M7 — Tab Base de Dados (CRUD inline)

`src/components/financeiro/gerencial/base-dados-tab.tsx` — tabela editável com:
- Edição inline por célula (clica → edita → `onBlur` salva via Server Action)
- Pills de filtro: Tipo (Todos/A pagar/A receber) + Origem (Todos/Planilha/Manual)
- Busca por Pessoa com debounce 300ms
- Botão "Nova linha" → linha vazia inline, salva como `origem='manual'`
- Botão "Importar Planilha" → abre `ImportDrawer`
- `LancamentoRow` com estados visual de saving/saved/error por célula

**Arquivos:** `src/components/financeiro/gerencial/base-dados-tab.tsx`, `src/components/financeiro/gerencial/lancamento-row.tsx`

---

### M8 — Tab Visualização Agregada + saldos editáveis

`src/components/financeiro/gerencial/visualizacao-agregada-tab.tsx` — projeção diária:
- Saldos iniciais editáveis inline (Itaú, Asaas, Blimboo, Clara)
- Tabela de projeção: Dia | A Receber | A Pagar | Resultado | Saldo Itaú | Saldo Consolidado | Consolidado+Clara
- Cálculo acumulado idêntico à planilha de curadoria
- Dia atual destacado, saldos negativos em `var(--negative-deep)`

**Migration 0095** — RPC `get_gerencial_projecao_diaria(p_dias INT DEFAULT 90)` — projeção diária com LEFT JOIN em `analytics.gerencial_lancamentos`.

**Arquivos:** `src/components/financeiro/gerencial/visualizacao-agregada-tab.tsx`, `supabase/migrations/0095_get_gerencial_projecao_diaria.sql`

---

### M9 — Integração na sub-aba Fluxo de Caixa

`src/app/financeiro/fluxo-caixa/page.tsx` — terceira `TopSection` adicionada:
- "Fluxo de Caixa Gerencial" com subtítulo "Baseado em planilha de previsão curada manualmente"
- Tabs internos via `GerencialSection`: Visualização Agregada | Base de Dados
- Fetches gerenciais isolados em `Promise.allSettled` separado com try/catch

`src/components/shared/top-section.tsx` — adicionada prop `subtitulo?: string`.

**Arquivos:** `src/app/financeiro/fluxo-caixa/page.tsx`, `src/components/shared/top-section.tsx`, `src/components/financeiro/gerencial/gerencial-section.tsx`

---

### M10 — Fechamento

- `package.json` → `4.6.0` (depois `4.6.1`)
- `CHANGELOG.md` entrada `[4.6.0]` completa
- ADRs 0089–0090 registrados
- TypeScript limpo, build limpo

---

### Migrations

| Nº | Descrição | Status |
|----|-----------|--------|
| 0093 | DROP 6 RPCs órfãs | ✅ Aplicada |
| 0094 | CREATE `analytics.gerencial_lancamentos` + `gerencial_saldos` + trigger | ✅ Aplicada |
| 0095 | RPC `get_gerencial_projecao_diaria` | ✅ Aplicada |
| 0096 | RPCs CRUD gerencial: `get_gerencial_lancamentos`, `get_gerencial_saldos`, `create_gerencial_lancamento`, `update_gerencial_lancamento`, `delete_gerencial_lancamento`, `update_gerencial_saldo`, `batch_gerencial_import`, `get_gerencial_lancamentos_planilha` | ✅ Aplicada |

---

## Correções pós-revisão

### Logos e ícones (patch 4.6.1)

- Logos SVG Welcome Group + Welcome Weddings adicionados em `public/logos/` com versões @1x/@2x/@3x
- Ícones do browser migrados para convenção Next.js 16 (`src/app/favicon.ico`, `icon.svg`, `apple-icon.png`)
- `icon.svg` com dark mode via `@media (prefers-color-scheme: dark)` — cor branca (`#FFFFFF`) no dark
- `layout.tsx` atualizado: removidas referências manuais a `/apple-touch-icon.png` e `/favicon.ico`
- Sidebar atualizada para usar `.svg` em vez de `.png`
- Logo sidebar: `object-cover` → `object-contain` + `origin-left` corrige corte à esquerda no SVG

### Schema analytics não exposto na API Supabase

Causa: o schema `analytics` não está listado nos schemas expostos pelo PostgREST do Supabase (apenas `public` e `graphql_public`). Chamadas diretas `.schema('analytics').from(...)` retornavam PGRST106.

Solução: 8 RPCs `SECURITY DEFINER` criadas no schema `public` para todo o acesso às tabelas gerenciais (migration 0096) — mesmo padrão do restante do codebase.

### Migrations 0088 e 0092 (overload PGRST203)

`get_proximos_lancamentos` teve dois overloads conflitantes após migration 0091. `0092_drop_get_proximos_lancamentos_v1.sql` remove o overload antigo. `0088` corrigida com `ctid` em vez de `id`.

---

## Investigação: importação de planilha Gerencial (PEND-001)

**Sintoma:** "An error occurred in the Server Components render" ao tentar importar a planilha via `import-drawer.tsx`.

**O que foi testado e descartado:**

1. **Schema analytics não exposto (PGRST106)** → Resolvido com RPCs SECURITY DEFINER (migration 0096). Não era a causa do erro de Server Component.

2. **`import { randomUUID } from 'crypto'`** → Substituído por `crypto.randomUUID()` global. Não era a causa.

3. **`useTransition` misturado com dynamic import** → `parseGerencialExcel` e `computeImportDiff` separados em etapas independentes. Não resolveu.

4. **`useTransition` em geral** → Removido completamente; usando `await` direto (padrão de `uploads/page.tsx`). Não resolveu.

5. **`Promise.all` sem proteção** → Substituído por `Promise.allSettled` em `page.tsx`. Não resolveu.

6. **Fetches gerenciais crashando page.tsx** → Isolados em `Promise.allSettled` separado com try/catch. Não resolveu.

7. **`GerencialSection` causando o crash** → Confirmado: ao remover `GerencialSection` da página, o erro desaparece. Com ela presente, o erro ocorre.

8. **`ImportDrawer` com `next/dynamic ssr:false`** → `@e965/xlsx` falha no SSR do Next.js. Isolar `ImportDrawer` do SSR foi o fix correto para o crash da página. Mas o erro de importação **ainda persiste ao usar a funcionalidade**.

**Hipótese mais provável não testada:** a chamada `computeImportDiff` como Server Action, quando combinada com o re-render automático que Next.js 16 dispara após Server Actions, causa falha no RSC update. O re-render tenta serializar dados que estão em estado intermediário ou encontra um componente no import chain que ainda tem problema com SSR.

**Estado final:** a página carrega normalmente. A seção Gerencial renderiza. O CRUD inline (adicionar/editar/remover linhas) e a Visualização Agregada funcionam. Apenas a funcionalidade de importação via planilha Excel está quebrada em produção.

---

## Estado final do codebase

| Área | Status |
|------|--------|
| TypeScript (`npx tsc --noEmit`) | ✅ Limpo |
| Build (`npx next build`) | ✅ Sem erros |
| Migrations 0093–0096 | ✅ Aplicadas no remote |
| ADRs 0089–0090 | ✅ Documentados |
| Importação de planilha Excel | ⚠️ PEND-001 — não funciona em produção |
| PR #78 | ✅ Pronto para merge |

---

## Pendências para v4.7

### PEND-001 — Importação de planilha Gerencial (alta prioridade)

Registrar no início da v4.7 como primeira missão. Investigar:
- Verificar se `computeImportDiff` dispara RSC re-render automático no Next.js 16 mesmo sem `revalidatePath`
- Tentar mover `computeImportDiff` para um Server Action em um arquivo separado (fora de `actions.ts`)
- Considerar alternativa: enviar o arquivo para uma API Route (`/api/gerencial/import`) em vez de Server Action
- Verificar se algum componente no import chain de `GerencialSection` ainda tem problema com SSR

### Composição dos Lançamentos + Posição por Conta
Revisão maior adiada para v4.7.

### DRE evolutiva
Reservada para v4.8 (6º adiamento consecutivo).

### Outros do audit
Ver pendências completas em `docs/audits/2026-05-28-audit-completo-v4-5.md`.

---

## Arquivos modificados ou criados na v4.6

```
src/app/admin/layout.tsx                                       ← novo: layout compartilhado
src/app/financeiro/fluxo-caixa/page.tsx                       ← Gerencial + Promise.allSettled
src/app/financeiro/fluxo-caixa/gerencial/actions.ts           ← novo: Server Actions CRUD + import
src/app/layout.tsx                                            ← remover ícones manuais
src/styles/tokens.css                                         ← 7 tokens --chart-*
src/components/shared/top-section.tsx                         ← prop subtitulo
src/components/shared/em-construcao.tsx                       ← cor link Weddings
src/components/charts/custom-tooltip.tsx                      ← any em labelFormatter
src/components/layout/sidebar.tsx                             ← logos SVG + object-contain
src/components/financeiro/gerencial/gerencial-section.tsx     ← novo: tabs Gerencial
src/components/financeiro/gerencial/base-dados-tab.tsx        ← novo: CRUD inline
src/components/financeiro/gerencial/lancamento-row.tsx        ← novo: linha editável
src/components/financeiro/gerencial/visualizacao-agregada-tab.tsx ← novo: projeção diária
src/components/financeiro/gerencial/import-drawer.tsx         ← novo: drawer importação
src/lib/gerencial/parser.ts                                   ← novo: parser Excel
src/lib/gerencial/gerencial-section.tsx                       ← (via gerencial-section acima)
public/logos/welcome-group.svg + @2x + @3x                    ← novo
public/logos/welcome-weddings.svg + @2x + @3x                 ← novo
src/app/favicon.ico                                           ← novo
src/app/icon.svg                                              ← novo: dark mode #FFF
src/app/apple-icon.png                                        ← novo
src/app/icon0.png (192×192) + icon1.png (512×512)             ← novo
docs/adr/0089-fluxo-caixa-gerencial.md                       ← novo
docs/adr/0090-tokens-grafico.md                              ← novo
supabase/migrations/0093_drop_rpcs_orfas.sql                  ← novo
supabase/migrations/0094_create_gerencial_tables.sql          ← novo
supabase/migrations/0095_get_gerencial_projecao_diaria.sql    ← novo
supabase/migrations/0096_rpcs_gerencial_crud.sql              ← novo
```
