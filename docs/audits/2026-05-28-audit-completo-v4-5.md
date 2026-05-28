# WT Finance — Audit Completo v4.5

**Data:** 2026-05-28
**Branch:** `feat/v4-5` (estado pós M0–M5)
**Auditor:** Claude Sonnet 4.6 (subagente)
**Missão:** v4.5 — M7

## Resumo Executivo

| Métrica | Qtd |
|---|---|
| Achados totais | 18 |
| Resolvidos na missão | 2 |
| Registrados como pendência | 16 |

Estado geral do código é saudável: zero `@ts-ignore`/`@ts-expect-error`, zero erros `tsc --noEmit`, zero erros `--noUnusedLocals` após correção pontual, zero imports relativos profundos, zero hex hardcoded de subsetores fora dos tokens, e todas as 61 migrations com funções usam `SECURITY DEFINER`. Os achados restantes são em sua maioria pequenos refinamentos cosméticos e algumas RPCs órfãs que podem ser dropadas em missão futura. Há também vulnerabilidades conhecidas no `next` e `xlsx` que merecem decisão de upgrade.

---

## Dimensão 1 — Código Morto

### Resolvidos
Nenhum hex hardcoded de subsetor encontrado fora de `src/styles/tokens.css` e `src/app/admin/design-system/page.tsx` (ambos intencionais — definição e documentação).

Migration `0089` confirmada ausente (removida em M0). Sequência atual termina em `0091_alter_get_proximos_lancamentos_tipo.sql`.

### Pendências (v4.6+)

**RPCs órfãs no banco (não chamadas pelo front).** O cruzamento de `grep '.rpc(' src/` com `CREATE [OR REPLACE] FUNCTION` nas migrations identificou as seguintes funções existentes no DB mas sem caller no frontend:

| RPC | Última migration | Status sugerido |
|---|---|---|
| `get_config_numeric` | `0017_app_config_utils.sql` | Pode ser utilitária; investigar se outras funções a chamam internamente |
| `get_fluxo_caixa_kpis_b` | `0065_vw_fluxo_caixa_kpis_b.sql` | Substituída por `get_fluxo_caixa_kpis_diario` |
| `get_fluxo_caixa_mensal` | `0059_financeiro_views.sql` | Substituída por `get_fluxo_caixa_mensal_v3` |
| `get_fluxo_caixa_mensal_b` | `0065` | Idem |
| `get_historico_12m` (sem `_setores`) | `0023_historico_12m_setores.sql` | Substituída por `_setores` |
| `get_proximos_vencimentos` | `0066` | Substituída por `v2` |
| `get_proximos_vencimentos_v2` | `0066` | Não chamada — possivelmente foi substituída por `get_proximos_lancamentos` |

Recomendação: criar migration `00XX_drop_rpcs_obsoletas.sql` listando explicitamente cada `DROP FUNCTION IF EXISTS`. Confirmar antes com Yan que nenhuma é chamada por outra função DB.

---

## Dimensão 2 — TypeScript

### Resolvidos
- Removido import não usado `PeriodoCustomizado` em `src/components/shared/periodo-filter.tsx:5`.

### Pendências (v4.6+)

**Usos evitáveis de `any`:** apenas 2 fora dos casos esperados (`supabase.rpc as any` para RPCs não tipadas e `db as any` em pages admin):

1. `src/app/admin/contas-bancarias/page.tsx:41` — `(todasContas ?? []).map((c: any) => ({...`. Pode ser tipado com `Database['public']['Tables']['contas_bancarias']['Row']` quando esse tipo existir.
2. `src/components/charts/custom-tooltip.tsx:11` — `labelFormatter?: (label: any, payload?: any) => ReactNode`. Tooltip do recharts; é genérico e razoável manter, mas pode ser `unknown` se for refinado.

**Strict / `@ts-ignore`:** zero ocorrências. `npx tsc --noEmit` passa limpo.

---

## Dimensão 3 — Performance (análise estática)

### Pendências (v4.6+)

**Páginas Server Component sem `export const dynamic`.** Encontradas 2 páginas que fazem `db.rpc(...)` mas não declaram `dynamic`:

- `src/app/executiva/page.tsx`
- `src/app/financeiro/fluxo-caixa/page.tsx`

Em Next.js 16 o comportamento difere de versões anteriores (ver `node_modules/next/dist/docs/`). Antes de aplicar `export const dynamic = 'force-dynamic'`, verificar se as `searchParams` ou cookies já forçam render dinâmico implicitamente — provavelmente sim (ambas leem `searchParams`). Registrar como verificação de comportamento e não como bug.

**Imports do date-fns**: todos nominados (`import { format, parseISO } from 'date-fns'`). Sem `import * as dateFns`. OK.

**Server Actions vs Client Components**: as 4 ocorrências de `'use server'` estão em arquivos `actions.ts` isolados. OK.

---

## Dimensão 4 — Acessibilidade

### Pendências (v4.6+)

**Inputs sem `id`/`htmlFor`/`aria-label`** (15 ocorrências sobre as quais cabe pelo menos uma revisão):

| Arquivo | Linhas | Observação |
|---|---|---|
| `src/app/admin/uploads/page.tsx` | 177 | `type="file"` hidden — OK |
| `src/app/admin/contas-bancarias/contas-bancarias-form.tsx` | 63 | rever (form admin) |
| `src/components/weddings/kpi-principal-drawer.tsx` | 273, 282 | rever |
| `src/components/weddings/dropdown-operacao.tsx` | 76 | rever |
| `src/components/weddings/lista-operacoes.tsx` | 403, 411, 438 | rever |
| `src/app/admin/uploads/financeiro/page.tsx` | 99 | possível `file` hidden |
| `src/components/shared/periodo-filter-pills-url.tsx` | 167, 177 | inputs de data — adicionar `aria-label` |
| `src/components/shared/periodo-filter.tsx` | 130, 140 | idem |
| `src/components/shared/periodo-filter-url.tsx` | 79, 85 | idem |

Sugestão v4.6: adicionar `aria-label="Data inicial"` / `aria-label="Data final"` nos inputs date dos filtros (4 arquivos).

**`<div onClick>`:** apenas 1 ocorrência (`src/components/layout/sidebar.tsx:330`) e é um backdrop semântico para fechar drawer. Aceitável.

---

## Dimensão 5 — Inconsistências de Padrão

### Resolvidos
- `src/components/financeiro/proximos-lancamentos-lateral.tsx:314` — container de card migrou de `border border-[--border] bg-white` para `bg-white shadow-sm` (alinhado ao ADR-0085).

### Pendências (v4.6+)

**`border border-[--border] bg-white` residual em não-cards.** Restam 2 ocorrências em `src/components/weddings/dropdown-operacao.tsx` (linhas 55 e 74), mas são respectivamente um botão de trigger e um menu dropdown — sem necessidade de `shadow-sm`. OK manter.

**Hex hardcoded em gráficos (recharts):** 25+ ocorrências em `historico-12m-chart`, `mix-setor-chart`, `tendencia-margem-chart`, `acumulado-receb-pag-chart`, `drilldown-drawer`, `RitmoDiarioChart`, `HistoricoMensalChart`, `decomposicao-variacao-card`, `em-construcao`. São majoritariamente:

- Tons semânticos do Tailwind (`#a1a1aa`, `#52525b`, `#f1f5f9`, `#d1d5db`, `#e4e4e7`) usados como `tick fill` / `stroke` em axes e grids.
- Cores de série de gráfico (`#10b981` verde, `#f97316` laranja, `#16a34a`, `#dc2626`, `#94a3b8`, `#6366f1`).
- Cores de setor (`#378ADD` Lazer, `#0F6E56` Corporativo) que não são subsetores e por isso não estão em `tokens.css`.

Recomendação v4.6: criar `--chart-axis-tick`, `--chart-grid`, `--chart-success`, `--chart-warning`, `--chart-danger`, `--chart-neutral` em `tokens.css` e centralizar. Não é urgente.

---

## Dimensão 6 — Dependências

### Pendências (v4.6+)

**Vulnerabilidades reportadas por `npm audit`:**

| Pacote | Severidade | Notas |
|---|---|---|
| `next` 16.2.4 | **high** | 10 advisories (DoS via Server Components, middleware bypass, cache poisoning, XSS via CSP nonces). `npm audit fix` disponível |
| `xlsx` 0.18.5 | **high** | Prototype Pollution + ReDoS. **Sem fix disponível no npm registry oficial.** Solução: migrar para `@e965/xlsx` ou minimizar superfície (apenas leitura de uploads admin) |
| `brace-expansion` | moderate | Transitiva via `@typescript-eslint`. `npm audit fix` resolve |
| `ws` | (transitiva) | `npm audit fix` resolve |

Total: 5 vulnerabilidades (3 moderate, 2 high).

Recomendação v4.6: subir patch do Next.js (`npm audit fix` resolve a maioria sem breaking changes esperados em patch). Avaliar substituir `xlsx` por fork mantido em uma missão dedicada.

**Dependências em uso:** todas as 12 (deps + devDeps externos) verificadas e usadas:
- `xlsx` em `lib/carga/*` e `weddings/lista-operacoes`
- `lucide-react` em 21 arquivos
- `zod` nos route handlers de `api/dashboard/*`
- `dotenv` em seeds

---

## Dimensão 7 — Segurança

### Pendências (v4.6+)

**Sem `middleware.ts` no projeto.** Não existe `src/middleware.ts` nem nenhum middleware Next.js. As páginas `/admin/*` (uploads, contas-bancarias, design-system) dependem da camada de RLS do Supabase para autorização. Para projeto privado/interno isso é viável, mas considerar adicionar:

```ts
// src/middleware.ts
export const config = { matcher: ['/admin/:path*'] }
```

para gating explícito antes do RLS, especialmente para `/admin/uploads` que aceita arquivos.

**`SUPABASE_SERVICE_ROLE_KEY`:** zero ocorrências em código de cliente. OK.

**`SECURITY DEFINER`:** 61/61 migrations com funções declaram `SECURITY DEFINER`. OK.

**`src/app/admin/` sem `layout.tsx`:** as 3 áreas admin (uploads, contas-bancarias, design-system) não compartilham layout. Não é problema de segurança per se, mas dificulta evolução (ex.: adicionar guard `<RequireAdmin>` central). Considerar criar `src/app/admin/layout.tsx` em v4.6.

---

## Dimensão 8 — Estrutura

### Pendências
Nenhuma encontrada.

**Componentes Weddings em pasta correta**: os 10 arquivos fora de `src/components/weddings/` que mencionam "weddings/Weddings" são apenas imports (`@/components/weddings/...`), referências em comentários (`use apenas em Weddings`) ou keys de map de setores (`'Weddings'`). Sem lógica vazada.

**Imports relativos longos**: zero ocorrências de `../../../`. Todos os imports cruzando módulos usam alias `@/*` (configurado em `tsconfig.json:21`).

**Arquivos de seed**: todos `.ts` em `supabase/seed/` estão commitados; `supabase/seed/data/*` está corretamente em `.gitignore` exceto `.gitkeep`. OK.

---

## Pendências Consolidadas para v4.6+

Ordenadas por prioridade sugerida:

### Alta
1. **Vulnerabilidades npm**: rodar `npm audit fix` para resolver next + brace-expansion + ws. Avaliar plano de migração de `xlsx`.
2. **RPCs órfãs no DB**: criar migration de DROP para 7 funções obsoletas (`get_fluxo_caixa_kpis_b`, `get_fluxo_caixa_mensal`, `get_fluxo_caixa_mensal_b`, `get_historico_12m`, `get_proximos_vencimentos`, `get_proximos_vencimentos_v2`, e investigar `get_config_numeric`).

### Média
3. **`export const dynamic` explícito** em `executiva/page.tsx` e `financeiro/fluxo-caixa/page.tsx` (verificar comportamento atual antes).
4. **Acessibilidade dos inputs date** nos 4 arquivos de filtro de período (adicionar `aria-label`).
5. **Middleware `/admin/*`**: criar `src/middleware.ts` para gating explícito e/ou `src/app/admin/layout.tsx` com guard server-side.

### Baixa
6. **Tokens de gráfico**: extrair cores semânticas de recharts (`--chart-axis-tick`, `--chart-grid`, `--chart-success`, `--chart-warning`, `--chart-danger`) para `tokens.css`.
7. **Tipagem fina**: substituir `(c: any)` em `admin/contas-bancarias/page.tsx:41` por tipo gerado.
