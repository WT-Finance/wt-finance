# ADR-0043 — Sidebar com cor dinâmica por aba

**Status:** Aceito  
**Data:** 2026-05-19  
**Versão:** v3.7-M5

## Contexto

A sidebar usava `var(--primary)` como cor de destaque — azul fixo herdado do boilerplate. Com a introdução de múltiplas abas de setor (Weddings, Trips, Corporativo), cada setor tem identidade visual própria. A sidebar monocrômica não comunicava em qual contexto o usuário estava.

## Decisão

Substituir a cor fixa por `var(--brand)` na sidebar. O valor de `--brand` é definido pelo atributo `data-theme` no elemento `<html>`, que muda conforme a rota atual.

**Implementação:**

1. `ThemeProvider` — Client Component em `src/components/layout/theme-provider.tsx`:
   - Lê `usePathname()`
   - Em `useEffect`, chama `document.documentElement.setAttribute('data-theme', resolveTheme(pathname))`
   - Montado em `layout.tsx` antes do `AppShell`

2. Mapeamento de rotas para temas:
   - `/performance/weddings` → `weddings` (âmbar `#BD965C`)
   - `/performance/trips` → `trips` (teal `#0091B3`)
   - `/performance/corporativo` → `corporativo` (cinza `#75777B`)
   - demais rotas → `group` (âmbar padrão Welcome Trips)

3. `Sidebar` — substitui todas as referências a `var(--primary)` e `var(--primary-bg)` por `var(--brand)` e `var(--brand-soft)`

## Consequências

- Feedback visual imediato de contexto: o usuário sabe visualmente em qual setor está
- Zero re-render de componentes: a mudança é puramente CSS via custom property cascade
- `ThemeProvider` é um Client Component mínimo (sem estado, sem dados) — não afeta SSR
- `layout.tsx` permanece Server Component; `ThemeProvider` funciona como "ponte" para o DOM
