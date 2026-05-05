# ADR 0018 — PerformanceContent como componente compartilhado

**Data:** 2026-05-05
**Status:** Aceito
**Versão:** v3.3-4

## Contexto

Com quatro rotas de Performance (`/performance`, `/performance/trips`, `/performance/weddings`, `/performance/corporativo`), era necessário exibir o mesmo conteúdo analítico em cada uma, filtrado para o respectivo setor. Duplicar o código da página em quatro arquivos criaria manutenção cara.

## Decisão

Extrair toda a lógica de dados e renderização para `PerformanceContent`, um **async Server Component** em `src/components/performance/performance-content.tsx`.

Interface:
```ts
interface Props {
  setor:        string          // 'todos' | 'Lazer' | 'Weddings' | 'Corporativo'
  searchParams: { preset?: string; from?: string; to?: string }
}
```

Cada `page.tsx` torna-se um wrapper fino de 15 linhas. O `SetorFilter` é exibido apenas quando `setor === 'todos'` — nas sub-abas o setor é determinado pela rota.

### Por que componente e não função utilitária?

Em Next.js App Router, a lógica de busca de dados pertence à árvore de Server Components. Extrair para um componente mantém o padrão de `async` + `await` direto no componente e permite uso de `Suspense` se necessário no futuro.

### Por que não rota dinâmica `[setor]/page.tsx`?

Os slugs de URL (`trips`, `weddings`, `corporativo`) diferem dos nomes internos dos setores (`Lazer`, `Weddings`, `Corporativo`). Rotas estáticas nomeadas evitam um mapa slug→setor em tempo de execução e tornam os erros de rota capturados em build time.

## Consequências

**Positivas:**
- Mudanças no layout de Performance aplicam-se automaticamente a todas as sub-abas
- Pages são triviais e fáceis de inspecionar

**Negativas / trade-offs:**
- `PerformanceContent` faz 8 chamadas paralelas ao banco — cada sub-aba é uma request completa (sem cache entre abas no mesmo render)
