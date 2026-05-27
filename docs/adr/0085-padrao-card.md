# ADR-0085 — Padrão único de Card no design system

**Status:** Aceito  
**Data:** 2026-05-27  
**Contexto:** Divergência visual entre Aba Weddings (com sombra) e Aba Financeira (sem sombra).

## Decisão

Unificar o padrão visual de Card em todo o produto, adotando o estilo da Aba Financeira como referência. O estilo Weddings (com sombra, borda mais pronunciada) é deprecado.

## Especificação do padrão único

```
background:    #FFFFFF (bg-white)
border:        1px solid var(--border) (#E8E0D2)
border-radius: 12px (rounded-xl)
padding:       1rem 1.25rem (px-5 py-4) — default; ajustável via className
box-shadow:    none
```

## Variantes via props em Card

- **featured**: `border-2 border-[--brand]` — usar no card principal de KPIs
- **size sm**: `px-3 py-3.5 rounded-lg` — cards de subsetor e cards compactos

## Escopo da migração

Todos os cards do produto: KPI, gráfico, tabela, lista, drawer. Fonte canônica: `src/components/ui/card.tsx`.

## Justificativa

Padrão Financeiro mais alinhado com design contemporâneo (flat, editorial) e com a identidade Welcome (sofisticação discreta). Unificar previne que cada nova área invente seu próprio padrão.
