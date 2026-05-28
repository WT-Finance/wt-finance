# ADR-0085 — Padrão único de Card no design system

**Status:** Aceito  
**Data:** 2026-05-27  
**Contexto:** Divergência visual entre Aba Weddings (com sombra) e Aba Financeira (sem sombra).

## Decisão

Unificar o padrão visual de Card em todo o produto usando `shadow-sm` (sem borda) como referência. O estilo flat com `border border-[--border]` introduzido temporariamente em v4.4 foi revertido — `shadow-sm` confere distinção visual discreta sem adicionar borda.

## Especificação do padrão único

```
background:    #FFFFFF (bg-white)
border:        none (variante padrão)
border-radius: 12px (rounded-xl)
padding:       1rem 1.25rem (px-5 py-4) — default; ajustável via className
box-shadow:    shadow-sm (Tailwind — ~0 1px 3px rgba(0,0,0,.12))
```

> **Nota histórica:** v4.4 introduziu erroneamente `border border-[--border]` no lugar de `shadow-sm`. Corrigido no Fix #1 da mesma versão.

## Variantes via props em Card

- **featured**: `border-2 border-[--brand]` — usar no card principal de KPIs
- **size sm**: `px-3 py-3.5 rounded-lg` — cards de subsetor e cards compactos

## Escopo da migração

Todos os cards do produto: KPI, gráfico, tabela, lista, drawer. Fonte canônica: `src/components/ui/card.tsx`.

## Justificativa

Padrão Financeiro mais alinhado com design contemporâneo (flat, editorial) e com a identidade Welcome (sofisticação discreta). Unificar previne que cada nova área invente seu próprio padrão.
