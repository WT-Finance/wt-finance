# ADR-0042 — Remoção de recolhibilidade individual de cards

**Status:** Aceito  
**Data:** 2026-05-19  
**Versão:** v3.7-M4

## Contexto

Na v3.6, cada card da seção Visão Geral tinha um botão de recolher individual (`<details>`/`<summary>` interno). A intenção era dar controle granular ao usuário. Na prática, criava fricção desnecessária: o usuário precisava recolher card a card para ter uma visão resumida, e o estado de cada card não era preservado entre navegações.

## Decisão

Remover a recolhibilidade individual de todos os cards. Manter apenas o `<details open>` de nível superior (`TopSection`) que recolhe seções inteiras ("Visão Geral" e "Visão Analítica por Operação").

## Consequências

- Interface mais limpa: sem botões de toggle em cada card
- O usuário ainda pode recolher seções inteiras — suficiente para o caso de uso real (diretoria quer ver apenas os KPIs)
- Estado de seção preservado pelo `open` padrão; o usuário recolhe clicando no header da seção
- Elimina código de estado desnecessário nos componentes de card
