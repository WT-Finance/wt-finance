# ADR 0005 — URL como fonte de verdade para filtros

**Status:** aceito  
**Data:** 2026-04-30

## Contexto

No v1 o estado dos filtros (setor, mês) era gerenciado via `useState` no Client Component da página. Isso impedia: compartilhar links filados, navegação via botão Voltar, e Server Components lerem os filtros para buscar dados no servidor.

## Decisão

A partir do v2, os filtros são codificados em search params da URL (`?setor=Lazer&ano=2025&mes=4`). Cada tab (`/metas`, `/executiva`, `/performance`) é uma Server Component Page que recebe `searchParams` como prop async, extrai os valores com defaults e passa para um Client Component filho que cuida da interatividade.

Mudança de filtro → `router.push(pathname + '?' + novosParams)` no Client Component.

## Consequências

- **Positivo:** links filtrados compartilháveis; botão Voltar navega entre estados; Server Components podem pré-computar dados com os filtros corretos.
- **Negativo:** cada mudança de filtro gera uma navegação e re-render do Server Component; `useEffect` com fetch client-side ainda necessário onde fetches são rápidos e dados não precisam de SSR.
- Pages que leem `searchParams` são dinamicamente renderizadas (não pré-geradas em build time).
