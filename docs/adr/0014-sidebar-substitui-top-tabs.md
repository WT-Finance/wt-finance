# ADR 0014 — Sidebar lateral substitui top tabs

**Data:** 2026-05-05
**Status:** Aceito
**Versão:** v3.2-1

## Contexto

A navegação da v3.0/v3.1 usava top tabs no header (componente `LayoutHeader`). Com 3 abas (Executiva, Performance, Metas) o espaço era suficiente, mas o roadmap prevê:

- v3.3: sub-abas por setor na Performance
- v5.0: aba Custos / Lucratividade líquida

Adicionar mais itens ao top tabs comprimiria o espaço disponível para o conteúdo e criaria problemas de responsividade em telas menores.

## Decisão

Substituir o `LayoutHeader` por uma **sidebar lateral fixa** de 250px (200px em tablet, drawer em mobile).

Características implementadas:
- Ícones Lucide (LayoutDashboard, TrendingUp, Target) + label texto
- Item ativo: barra lateral azul `var(--primary)` + fundo `var(--primary-bg)` sutil
- Desktop: sidebar fixa via `sticky top-0 h-screen`
- Mobile: drawer controlado por `useState` em `AppShell`, abre com botão hambúrguer
- Botão `<` no header da sidebar recolhe em desktop; botão `>` na borda do conteúdo reabre
- Footer da sidebar reservado para avatar/logout (v4)

As rotas `/executiva`, `/performance`, `/metas` não foram alteradas. URLs existentes continuam válidas.

## Consequências

**Positivas:**
- Navegação escala sem custo visual — novos itens entram na lista vertical
- Sidebar permanece visível enquanto o usuário navega, reforçando contexto
- Componente `AppShell` centraliza estado de mobile/collapse — fácil de estender

**Negativas / trade-offs:**
- Sidebar ocupa 250px horizontais permanentemente em desktop — reduz levemente área útil
- Componente raiz (`layout.tsx`) agora depende de um Client Component (`AppShell`) no topo da árvore

## Alternativas consideradas

- **Top tabs com overflow/dropdown** para mais itens: descartado — degrada UX em mobile e não resolve o problema de escala
- **Sidebar colapsável por padrão (icon-only)**: descartado para v3.2 por complexidade; o botão `<` / `>` cobre essa necessidade
