# ADR-0041 — Padrão universal de cards

**Status:** Aceito  
**Data:** 2026-05-19  
**Versão:** v3.7-M3

## Contexto

Cada componente definia seu próprio wrapper de card com variações sutis mas inconsistentes: alguns usavam `rounded-xl`, outros `rounded-lg`; alguns `border-zinc-200`, outros `border-zinc-100`; padding variava entre `p-4`, `p-5` e `p-6`. O resultado era um conjunto de cards visualmente desuniformes.

## Decisão

Adotar um wrapper único para todos os cards do dashboard:

```
bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)]
```

E um padrão de cabeçalho interno:

```tsx
<h2 className="text-base font-semibold text-[--text-primary] leading-snug mb-3">
  {titulo}
</h2>
```

Criado o componente `src/components/ui/card.tsx` para uso futuro, mas os componentes existentes foram atualizados diretamente para manter legibilidade local.

## Consequências

- Visual coeso: todos os cards têm a mesma elevação, cantos e borda
- Hierarquia de título padronizada em toda a aplicação
- A cor da borda (`--border`) e a sombra (`rgba(45,42,38,0.04)`) usam os tons terrosos do design system
- Não há "card component" obrigatório — o padrão é uma convenção de classes, não uma abstração forçada
