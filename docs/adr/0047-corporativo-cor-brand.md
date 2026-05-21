# ADR-0047 — Cor de marca do Corporativo: #4B4F54

**Status:** Aceito  
**Data:** 2026-05-20  
**Versão:** v3.8-M1

## Contexto

A aba Corporativo compartilhava o token de cor `[data-theme="group"]` com as páginas neutras do dashboard (home, executiva). Isso significava que ao navegar para a aba Corporativo, a sidebar não mudava de cor — feedback visual incorreto.

A cor anterior `#75777B` (Pantone Cool Gray 9) é a cor institucional do grupo Welcome Group, adequada para páginas neutras mas não como identidade do setor Corporativo especificamente.

## Decisão

Separar os dois tokens:
- `[data-theme="corporativo"]`: `#4B4F54` (Pantone 7540, cinza escuro com leve tom quente)
- `[data-theme="group"]`: `#75777B` (Pantone Cool Gray 9, mantido para páginas neutras)

O token `--brand-soft` e `--brand-deep` também são específicos por tema:
- Corporativo: soft `#E5E7EA`, deep `#2C3338`
- Group: soft `#EAE6DD`, deep `#4B4F54`

## Consequências

- Navegação para `/performance/corporativo` agora muda a sidebar para cinza mais escuro (#4B4F54).
- Páginas neutras (home, executiva, trips sem conteúdo específico) continuam com `#75777B`.
- Distinção visual clara entre "visão geral do grupo" e "aba Corporativo".
