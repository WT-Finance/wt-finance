# WT Finance — Out-Briefing v3.10 Hotfix

**Data:** 2026-05-22  
**Branch base:** `main` pós-PR #61 + PR #62  
**PRs:** #61 (merged) · #62 (aberto)  
**TypeScript:** limpo (`npx tsc --noEmit --skipLibCheck`)  
**Migrations aplicadas:** nenhuma

---

## Correções implementadas

### Fix 1 — Upload de Lançamentos: HTTP 413 (PR #61, merged)

**Problema**

Arquivos XLSX de Lançamentos por Operação (~6MB) falhavam com HTTP 413 na Vercel. A causa raiz é um limite de **4,5MB** imposto pela infraestrutura da Vercel (load balancer), que rejeita o request antes do código Next.js ser executado. O `serverActions.bodySizeLimit: '200mb'` no `next.config.ts` controla apenas o limite do Next.js — não sobrescreve o limite de plataforma.

**Solução: parse no cliente + Server Actions em lotes**

O arquivo deixa de ser enviado ao servidor. Em vez disso:

1. **`src/lib/carga/parse-lancamentos.ts`** (novo) — parser client-safe que roda no browser. Usa `xlsx` via `await import('xlsx')` (dynamic import, evita bundle SSR). Valida colunas obrigatórias e retorna `LancamentoRaw[]` ou `{ error: string }`.

2. **`src/app/admin/uploads/actions.ts`** — três Server Actions atômicas substituem `uploadLancamentosAction`:
   | Action | Responsabilidade |
   |---|---|
   | `getLancamentosStatusAction()` | Busca total atual do banco (para o preview) |
   | `inserirLoteLancamentosAction(lote, isFirst)` | Trunca na primeira chamada; insere o lote |
   | `finalizarLancamentosAction(totalAntes, total)` | Regenera `dim_operacao_weddings`; retorna resultado |

3. **`src/app/admin/uploads/page.tsx`** — fluxo de lançamentos reescrito:
   - Preview: `parseLancamentosFile(arquivo)` + `getLancamentosStatusAction()`, zero bytes trafegam ao servidor
   - Executar: lotes de 1.000 linhas (~250KB/lote) via `inserirLoteLancamentosAction`, seguido de `finalizarLancamentosAction`
   - Fluxo de vendas permanece inalterado (Server Action com arquivo completo)

---

### Fix 2 — Período Personalizado: ajustes visuais (PR #62, aberto)

**Problema 1 — Botão Aplicar invisível**

`bg-[--brand]` no Tailwind não expande CSS custom properties sem `var()`. O botão ficava com background transparente (invisível sobre fundo branco).

**Correção:** `style={{ background: 'var(--brand)' }}` — inline style garante resolução correta independente do Tailwind.

**Problema 2 — Fonte e cores fora do design system**

O popover usava `text-zinc-*` (cool gray genérico) e não forçava Avenir LT Std nos campos de formulário.

**Correções:**
- `font-sans` no container do popover → aplica `'Avenir LT Std'` a todos os filhos via herança (incluindo `<input type="date">`)
- Label "PERÍODO PERSONALIZADO" → "Selecione o período:" (sem `uppercase tracking-wide`)
- Cores trocadas para tokens semânticos: `var(--text-muted)` nos labels, `var(--text-primary)` nos valores
- Borda dos inputs: `zinc-300` (cool gray) → `var(--border)` (warm gray `#E8E0D2`, alinhado ao design system)
- Focus ring: `focus:ring-[--brand]` (bugado) → `--tw-ring-color: var(--brand)` via inline style

---

## Arquivos modificados

```
src/lib/carga/parse-lancamentos.ts          ← novo: parser client-safe para lançamentos
src/app/admin/uploads/actions.ts            ← 3 Server Actions atômicas + remove uploadLancamentosAction
src/app/admin/uploads/page.tsx              ← fluxo lançamentos client-side; vendas inalterado
src/components/shared/periodo-filter.tsx    ← label, botão Aplicar, fontes, cores design system
```

---

## Estado dos PRs

| PR | Título | Estado |
|----|--------|--------|
| #61 | fix(uploads): parse lançamentos no cliente — limite 4.5MB Vercel | ✅ Merged |
| #62 | style(periodo-filter): label, botão Aplicar dourado, design system | 🔄 Aberto |
