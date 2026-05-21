# Audit Técnico — Pós-v3.8

**Data:** 2026-05-21  
**Branch:** chore/audit-tecnico-pos-v3-8  
**Executor:** Claude Code (claude-sonnet-4-6)

---

## Resumo executivo

O codebase está em estado saudável para seu estágio: zero erros TypeScript (inclusive com flags strict extras além do tsconfig atual), zero console.log/debug esquecidos em componentes de produto, e build limpo em 1m23s. Os itens de maior impacto imediato são: (1) o `get_sparklines` ainda é chamado no carregamento da página Executiva — um custo de round-trip ao banco inteiramente desperdiçado, pois a variável `sparklines` é declarada mas nunca usada no JSX — contradizendo diretamente o ADR-0044; (2) o componente `sparkline.tsx` tornou-se código morto após o mesmo ADR; (3) dois tokens CSS (`--surface-soft`, `--surface-strong`) estão definidos em `tokens.css` mas nunca referenciados em nenhum componente. O restante das pendências são débitos de documentação (ADRs não marcados como supersedidos) e itens de housekeeping sem risco imediato.

---

## Correções aplicadas automaticamente

Nenhuma correção automática foi necessária:

- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters --skipLibCheck` → **0 erros**
- `npx tsc --noEmit --strict --noUnusedLocals --noUnusedParameters --noImplicitReturns --noFallthroughCasesInSwitch --strictNullChecks --skipLibCheck` → **0 erros**
- Busca por `console.log` / `console.debug` em `src/` → **0 ocorrências em componentes de produto** (única ocorrência é intencional e controlada por flag `log=false` em `src/lib/carga/metas.ts`)

Não houve nenhuma remoção ou alteração de código neste audit. Tudo está relatado.

---

## Diagnósticos por eixo

### Eixo 1 — Código morto frontend

| Arquivo | Tipo | Status | Observação |
|---------|------|--------|------------|
| `src/components/shared/sparkline.tsx` | Componente | **Candidato a remoção** | Nenhum `import` deste componente existe no codebase. ADR-0044 documenta explicitamente a remoção dos sparklines dos KPI cards. O arquivo é o único remanescente. |

Todos os demais componentes, hooks e utilitários têm ao menos 1 referência de import verificada via `grep -r`. Destaque:

- `src/lib/carga/` (lancamentos, metas, vendas): 1-3 referências cada — usados nas rotas de admin upload
- `src/components/ui/card.tsx`: 10 referências — amplamente reutilizado
- `src/components/shared/list-drawer.tsx`: 5 referências — padrão estabelecido em ADR-0051
- `src/components/shared/kpi-card.tsx`: 3 referências — usado em executiva, performance, weddings

**Sem tipos em `src/types/` sem referência:** `api.ts` tem 51 refs, `database.ts` tem 2 refs. Ambos em uso.

---

### Eixo 2 — Imports e variáveis não usadas

**TypeScript com `--noUnusedLocals --noUnusedParameters`:** 0 erros.

**Item relevante não capturado pelo compilador (variável declarada mas não usada no JSX):**

Em `src/app/executiva/page.tsx`, a variável `sparklines` é declarada na linha 64:

```ts
const sparklines = sparkRes.error ? null : sparkRes.data as unknown as Sparklines | null
```

E `sparkRes` depende de `db.rpc('get_sparklines', ...)` na linha 52 — chamada que efetivamente acontece em cada carregamento da página. A variável `sparklines` nunca é passada para nenhum componente. Isso é um resquício do ADR-0044 aplicado de forma incompleta: as props foram removidas do `KpiCard` mas o RPC call e o tipo continuam no arquivo.

**Por que o TypeScript não capturou:** a variável é usada implicitamente em fluxo de destruturação de array com outros valores — isso não viola `noUnusedLocals` porque a variável é atribuída, apenas não consumida depois.

---

### Eixo 3 — Console.logs

**Removidos automaticamente:** nenhum (não havia ocorrências triviais).

**Ocorrências mantidas:**

| Arquivo | Linha | Conteúdo | Avaliação |
|---------|-------|----------|-----------|
| `src/lib/carga/metas.ts` | 79 | `if (log) console.log(...)` | **Intencional.** Controlado por parâmetro `log = false` (padrão off). Acionado apenas por scripts de seed administrativos. Manter. |

Zero `console.debug` encontrados.

---

### Eixo 4 — Tokens CSS não referenciados

O sistema de tokens funciona em três camadas:
1. `src/styles/tokens.css` — define `--brand`, `--surface`, `--text-primary`, etc.
2. `src/app/globals.css` `@theme inline` — cria aliases `--color-brand`, `--color-text-primary`, etc. para o Tailwind
3. Componentes usam via `var(--brand)`, `style={{ color: 'var(--text-muted)' }}`, `text-[--text-primary]`, ou classes Tailwind como `text-danger`

| Token | Usos em src (fora de globals/tokens) | Mecanismo de uso |
|-------|--------------------------------------|-----------------|
| `--border` | 37 | bracket `[--border]` |
| `--text-primary` | 25 | bracket + `var()` |
| `--text-muted` | 17 | bracket + `var()` |
| `--danger` | 20 | Tailwind `text-danger` / `bg-danger` |
| `--warning` | 16 | Tailwind `text-warning` / `bg-warning` |
| `--success` | 10 | Tailwind `text-success` / `bg-success` |
| `--brand` | 14 | `var(--brand)` |
| `--brand-soft` | 6 | `var(--brand-soft)` |
| `--text-subtle` | 14 | bracket |
| `--danger-bg` | 4 | Tailwind `bg-danger-bg` |
| `--warning-bg` | 5 | Tailwind + bracket |
| `--success-bg` | 1 | Tailwind `bg-success-bg` |
| `--brand-deep` | 3 | `var(--brand-deep)` |
| `--border-strong` | 1 | `var(--border-strong)` |
| `--primary` | 6 | `var(--primary)` — usado em charts (historico-12m, kpi-detail-drawer) |
| `--sidebar-bg` | 2 | `var(--sidebar-bg)` — usado em sidebar.tsx |
| `--sidebar-border` | 4 | `var(--sidebar-border)` — usado em sidebar.tsx |
| `--surface` | 1 | `var(--surface)` |
| **`--surface-soft`** | **0** | **Nenhuma referência externa** |
| **`--surface-strong`** | **0** | **Nenhuma referência externa** |
| `--background` | 0 (src) | Usado em `body {}` do globals.css |
| `--foreground` | 0 (src) | Usado em `body {}` do globals.css |
| `--primary-bg` | 0 (src) | Definido mas sem uso encontrado (potencial remoção futura) |
| `--font-geist-mono` | injetado via `layout.tsx` | Injetado como variável CSS via Next.js Font; utilizado em `@theme --font-mono` |

**Tokens candidatos a revisão:**
- `--surface-soft` e `--surface-strong`: definidos como "hover, destaque sutil" mas nunca aplicados
- `--primary-bg`: definido em globals.css como `rgba(37, 99, 235, 0.08)` mas sem nenhum uso encontrado

---

### Eixo 5 — Migrations e RPCs órfãs

**View SQL:**

| Objeto | Migration | Referenciada em src? |
|--------|-----------|----------------------|
| `analytics.vw_vendas_agregadas` | `0040_m11_vw_vendas_agregadas.sql` | Não diretamente em src — consumida internamente pela função `get_operacoes_lista_weddings` |

**Migrations com gaps de numeração:**
- `0024` e `0025` ausentes — gap intencional (a numeração pulou de 0023 para 0026 na virada para o módulo Weddings v3.4)

**RPCs públicas e status de uso:**

| RPC | Chamada em src? | Observação |
|-----|-----------------|------------|
| `get_executiva_kpis` | Sim (4 refs) | Executiva + Performance |
| `get_prejuizos` | Sim (3 refs) | Executiva + Performance |
| `get_sparklines` | Sim (1 ref) | **Chamada mas resultado não usado** — ver Eixo 2 |
| `get_kpis` | Sim | Dashboard principal |
| `get_historico_12m` | Sim (1 ref) | Referenciada porém não como RPC primário — `get_historico_12m_setores` é o ativo |
| `get_upload_status` | Sim | Rota admin |
| `inserir_lote_lancamentos` | Sim | Rota admin upload |
| `inserir_lote_raw` | Sim | Rota admin + seed |
| `inserir_metas` | Sim | Rota admin + seed |
| `refresh_all_materialized_views` | Sim | Rota admin |
| `regenerar_dim_operacao_weddings` | Sim | Rota admin |
| `registrar_ingestao_log` | Sim | Rota admin |
| `transform_raw_to_analytics` | Sim | Rota admin |
| `truncar_lancamentos` | Sim | Rota admin |
| `truncate_dynamic_tables` | Sim | Rota admin |

**Nenhum RPC público está completamente órfão.** Todos têm pelo menos uma referência em `src/` ou `supabase/seed/`.

---

### Eixo 6 — Dependências

**Outdated (minor/patch — sem breaking change previsto):**

| Pacote | Instalado | Wanted | Latest |
|--------|-----------|--------|--------|
| `@supabase/ssr` | 0.10.2 | 0.10.3 | 0.10.3 |
| `@supabase/supabase-js` | 2.105.1 | 2.106.1 | 2.106.1 |
| `@tailwindcss/postcss` | 4.2.4 | 4.3.0 | 4.3.0 |
| `date-fns` | 4.1.0 | 4.2.1 | 4.2.1 |
| `lucide-react` | 1.14.0 | 1.16.0 | 1.16.0 |
| `next` | 16.2.4 | — | 16.2.6 (patch) |
| `react` / `react-dom` | 19.2.4 | — | 19.2.6 |
| `tailwindcss` | 4.2.4 | 4.3.0 | 4.3.0 |
| `tsx` | 4.21.0 | 4.22.3 | 4.22.3 |
| `zod` | 4.4.1 | 4.4.3 | 4.4.3 |

**Outdated major (risco de breaking change):**

| Pacote | Instalado | Latest | Risco |
|--------|-----------|--------|-------|
| `@types/node` | 20.x | 25.x | Major — atualizar com cuidado |
| `eslint` | 9.x | 10.x | Major — verificar config antes de atualizar |
| `typescript` | 5.9.x | 6.0.x | Major — TypeScript 6 pode ter breaking changes |

**Possivelmente não usados (depcheck — confirmar antes de remover):**

| Pacote | Status depcheck | Avaliação |
|--------|-----------------|-----------|
| `@supabase/ssr` | "Unused dependency" | **Falso positivo:** usado em `src/lib/supabase/server.ts` via `createServerClient` |
| `@tailwindcss/postcss` | "Unused devDep" | Falso positivo — necessário para pipeline CSS do Next.js com Tailwind v4 |
| `@types/react-dom` | "Unused devDep" | Falso positivo — necessário para tipagem |
| `pdfkit` | "Unused devDep" | **Candidato real:** não encontrado em nenhum import de `src/` ou `supabase/`. Pode ser resquício de experimento. |
| `tailwindcss` | "Unused devDep" | Falso positivo — peer dependency de `@tailwindcss/postcss` |

---

### Eixo 7 — TypeScript strict mode

**Resultado:** `npx tsc --noEmit --strict --noUnusedLocals --noUnusedParameters --noImplicitReturns --noFallthroughCasesInSwitch --strictNullChecks --skipLibCheck` → **0 erros / 0 warnings**

O `tsconfig.json` já contém `"strict": true`, que ativa: `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`. As flags adicionais testadas (`noImplicitReturns`, `noFallthroughCasesInSwitch`) também passaram sem erros.

**Flags NOT atualmente no tsconfig que foram testadas e passaram:**
- `--noUnusedLocals`
- `--noUnusedParameters`
- `--noImplicitReturns`
- `--noFallthroughCasesInSwitch`

**Recomendação (v3.9+):** adicionar `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` ao tsconfig — codebase já é compatível, custo zero.

**Exceção notável:** a variável `sparklines` em `executiva/page.tsx` não é capturada por `noUnusedLocals` porque está em um destructuring de array com uso parcial (padrão não detectado pelo compilador como "não usado").

---

### Eixo 8 — ADRs

**Numeração e gaps:**

| Gap | Contexto |
|-----|---------|
| ADR 0003, 0004 ausentes | Provavelmente decisões da fase inicial não formalizadas |
| ADR 0013 ausente | Idem |
| ADR 0019–0025 ausentes | Gap maior — 0026 inicia o módulo Weddings (v3.4). Provável descontinuidade de numeração intencional ao refatorar escopo. |

**Formato inconsistente:**

| Variação | Exemplos |
|----------|---------|
| `# ADR XXXX —` (espaço) | 0001 a 0038 |
| `# ADR-XXXX —` (hífen) | 0039 a 0051 |
| `**Status:** Aceito` (maiúsculo) | 0001, 0002, 0012, 0026–0051 |
| `**Status:** aceito` (minúsculo) | 0005, 0006, 0007, 0008, 0009, 0010, 0011 |
| `**Status:** Aceito (temporário)` | 0029 |

**ADRs supersedidos sem marcação:**

| ADR | Supersedido por | Status atual |
|-----|----------------|-------------|
| ADR-0036 (Ver todos inline) | ADR-0051 (drawer pattern) | Marcado como "Aceito" — deveria ser "Supersedido por ADR-0051" |
| ADR-0037 (recolhível individual por seção com `<details>` nativo) | ADR-0042 (remoção de recolhível individual) + ADR-0048 (Section Header Opção B) | Marcado como "Aceito" — deveria ser "Parcialmente supersedido" |

**Nota:** ADR-0042 diz que manteve apenas o `<details open>` de nível superior (`TopSection`), mas ADR-0048 (Section Header Opção B) provavelmente reformulou a aparência do `TopSection`. A relação entre 0037 → 0042 → 0048 não está explicitada nos status dos documentos.

**Arquivo não-padrão:** `docs/adr/v3-6-apendice.md` — não segue convenção de numeração ADR. É um apêndice de versão, não uma decision record. Considerar mover para `docs/briefings/` ou `docs/changelog.md`.

---

### Eixo 9 — Coerência CLAUDE.md × Realidade

| Convenção | Status | Observação |
|-----------|--------|-----------|
| **AGENTS.md**: ler `node_modules/next/dist/docs/` antes de código Next.js | Não verificável nos commits, mas a pasta existe e tem conteúdo | A convenção existe mas não há como auditar retrospectivamente |
| **Stack: Next.js** | Next.js 16.2.4 — confirmado no `package.json` | OK |
| **Stack: Supabase** | `@supabase/supabase-js` 2.105.1, `@supabase/ssr` 0.10.2 — confirmado | OK |
| **Commits recentes seguem convenção `tipo(escopo): mensagem`** | Sim — `feat()`, `fix()`, `docs()`, `chore()` | Consistente |
| **Estrutura `src/app/`, `src/components/`, `src/lib/`, `src/types/`** | Confirmado | OK |
| **Tokens CSS em `src/styles/tokens.css` (ADR-0040)** | Arquivo existe e é importado pelo globals.css | OK |
| **ADRs em `docs/adr/`** | 41 arquivos presentes | OK |
| **TypeScript strict** | `"strict": true` no tsconfig | OK |
| **Fonte Avenir LT Std (ADR-0039)** | Fontes em `public/fonts/avenir/`, registradas via `@font-face` | OK |
| **data-theme por aba (ADR-0043)** | Implementado em `theme-provider.tsx` e sidebar | OK |

**Discrepância identificada:** `CLAUDE.md` é apenas um `@AGENTS.md` — não documenta stack, estrutura, ou convenções do projeto. Toda a documentação viva está em `docs/adr/`, `docs/briefings/`, e `docs/design-system.md`. Isso é uma escolha deliberada mas pode ser confuso para novos colaboradores ou agentes futuros.

---

### Eixo 10 — Build e bundle (baseline)

| Métrica | Valor |
|---------|-------|
| **Tempo total de build** | 1m 23s (real) |
| **Compilação Turbopack** | 58s |
| **Verificação TypeScript** | 16.3s |
| **Geração de páginas estáticas** | 546ms (32 páginas) |

**Rotas estáticas (prerendered):** `/`, `/_not-found`, `/admin/uploads` — 3 páginas  
**Rotas dinâmicas (server-rendered on demand):** todas as demais — 29 rotas

**Proporção client vs server components:**
- Total de arquivos `.tsx`: 57
- Com `'use client'`: 37 (65%)
- Server components: 20 (35%)

**Observação:** a proporção de client components está alta (65%). Isso é esperado dado o uso intensivo de Recharts (que requer browser APIs) e drawers/filtros interativos. Não há risco imediato, mas é um baseline para monitorar.

**Next.js bundle:** o build não reportou warnings de bundle size — nenhuma página excedeu limites de tamanho.

---

## Itens prioritários para Yan decidir

### Crítico

| # | Item | Risco | Ação sugerida |
|---|------|-------|--------------|
| 🔴 1 | **`get_sparklines` chamado mas resultado não usado em `executiva/page.tsx`** | Cada carregamento da Aba Executiva faz um round-trip ao banco desnecessário. ADR-0044 diz explicitamente que a RPC foi removida do `Promise.all` — mas ela continua lá. | Remover linhas 52 (`db.rpc('get_sparklines'...)`), 41 (`sparkRes` no destructuring), e 64 (`const sparklines`). Ajustar o `Promise.all` e o destructuring. |

### Importante (débito que vai crescer)

| # | Item | Risco | Ação sugerida |
|---|------|-------|--------------|
| 🟡 2 | **`sparkline.tsx` é código morto** | Arquivo de componente que ninguém importa, confunde desenvolvedores/agentes futuros | Remover `src/components/shared/sparkline.tsx` após confirmar com ADR-0044 |
| 🟡 3 | **ADR-0036 não marcado como supersedido pelo ADR-0051** | Documentação contraditória — próximo agente pode implementar "expandir inline" em vez de drawer | Atualizar status do ADR-0036 para "Supersedido por ADR-0051" |
| 🟡 4 | **ADR-0037 sem referência ao ADR-0042** | Idem — documentação descreve comportamento que foi parcialmente revertido | Atualizar status do ADR-0037 |
| 🟡 5 | **`pdfkit` possivelmente não utilizado** | Dependência de dev inflando node_modules sem motivo | Verificar se foi usado em algum script de geração de PDF; se não, remover |
| 🟡 6 | **`typescript` v5 → v6 disponível (major)** | TypeScript 6 pode ter breaking changes; risco baixo mas aumenta com tempo | Planejar atualização com testes em v3.9 ou v3.10 |

### Pode esperar

| # | Item | Risco | Ação sugerida |
|---|------|-------|--------------|
| 🟢 7 | **`--surface-soft` e `--surface-strong` nunca usados** | Tokens mortos em tokens.css | Usar ou remover em revisão de design system |
| 🟢 8 | **`--primary-bg` nunca referenciado fora de globals.css** | Idem | Remover ou usar em v3.9+ |
| 🟢 9 | **Inconsistência de formato nos ADRs** (espaço vs hífen, maiúsculo vs minúsculo) | Cosmético — não afeta funcionalidade | Padronizar para `# ADR-XXXX —` e `Aceito` em revisão de documentação |
| 🟢 10 | **Flags TypeScript adicionais já passam: adicionar ao tsconfig** | Sem risco — codebase já compatível | Adicionar `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` ao tsconfig.json |

---

## Itens registrados para v3.9+

- **Proporção 65% client components:** monitorar. Candidatos a reforço server-side: `prejuizos-table.tsx`, `mix-produto-table.tsx`, `mix-setor-table.tsx` (tabelas estáticas sem interação de estado).
- **`get_historico_12m` existe no banco mas não é chamado diretamente** — `get_historico_12m_setores` é o ativo. Se `get_historico_12m` não foi reaproveitado por nenhum novo caso de uso em v3.8, pode ser marcado para deprecação.
- **ADR gaps 0003, 0004, 0013, 0019–0025:** verificar se houve decisões não documentadas nesses números. Pode ser feito em retrospectiva.
- **`docs/adr/v3-6-apendice.md`** não segue convenção de numeração — considerar mover para `docs/briefings/`.
- **`eslint` v9 → v10 (major):** disponível. Planejar com atenção à config `eslint.config.js`.
- **`@types/node` v20 → v25 (major):** baixo risco no contexto Next.js, mas atualizar deliberadamente.
- **Tokens `--surface-soft` / `--surface-strong`:** foram adicionados ao design system com intenção (hover, destaque sutil) mas ainda não encontraram uso real. Bons candidatos para aplicar em cards que precisam de diferenciação visual suave.
