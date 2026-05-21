# ADR-0054 — get_sparklines RPC eliminada

**Status:** Aceito
**Data:** Maio/2026
**Versão:** v3.9-m0

## Contexto

ADR-0044 (v3.7) decidiu remover as sparklines dos KPI cards para simplificar a interface. A remoção foi apenas visual: o componente `sparkline.tsx` foi desativado do JSX, mas a RPC `get_sparklines` continuou sendo chamada em cada carregamento da Aba Executiva (linha 52 do arquivo original `src/app/executiva/page.tsx`), com o resultado atribuído à variável `sparklines` que nunca era usada. O audit técnico pós-v3.8 identificou isso como item crítico — round-trip desnecessário ao banco a cada visita.

## Decisão

Remover completamente:
- Chamada `db.rpc('get_sparklines', ...)` do `Promise.all` em `executiva/page.tsx`
- Variável `sparklines` e `sparkRes` do código
- Import do tipo `Sparklines` de `@/types/api`
- Interface `Sparklines` de `src/types/api.ts`
- Componente `src/components/shared/sparkline.tsx` (código morto)

A RPC `get_sparklines` permanece no banco (não é perigoso manter uma RPC ociosa; remoção da migration seria irreversível). Pode ser removida do banco em versão futura via migration de limpeza.

## Consequências

- Aba Executiva passa a fazer 7 chamadas paralelas ao banco em vez de 8
- Nenhuma mudança visual (sparklines já não eram exibidas desde v3.7)
- `src/types/database.ts` mantém a tipagem da RPC (arquivo gerado/gerenciado pelo Supabase — não tocar manualmente)
