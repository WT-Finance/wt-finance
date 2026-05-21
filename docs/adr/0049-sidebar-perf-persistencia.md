# ADR-0049 — Sidebar Performance: estado persistente via localStorage

**Status:** Aceito  
**Data:** 2026-05-20  
**Versão:** v3.8-M3

## Contexto

O sub-menu de Performance na sidebar abria/fechava em cada navegação — estado efêmero. Usuários que preferem manter o menu fechado tinham que recolhê-lo a cada carregamento de página.

## Decisão

Persitir o estado aberto/fechado do sub-menu Performance em `localStorage` com a chave `sidebar-perf-open`.

- Valor inicial: `true` (aberto por padrão)
- Leitura do localStorage em `useEffect` (pós-hidratação, evita mismatch SSR)
- Escrita em `localStorage` a cada toggle

## Consequências

- Preferência do usuário sobrevive a navegações e recarregamentos.
- Nenhum estado de servidor envolvido — implementação puramente client-side.
- Custo de localStorage: negligível para um boolean.
- Se o usuário limpar localStorage, volta ao padrão (aberto).
