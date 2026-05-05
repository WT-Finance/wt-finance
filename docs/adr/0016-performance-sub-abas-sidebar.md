# ADR 0016 — Sub-abas de Performance como dropdown na sidebar

**Data:** 2026-05-05
**Status:** Aceito
**Versão:** v3.3-2

## Contexto

A aba Performance exibe dados agregados de todos os setores, mas o roadmap prevê visualizações independentes por setor (Trips, Weddings, Corporativo). A v3.1-4 já implementou drill-down do Mix por Setor para Performance filtrada via `?setor=`. A v3.3 formaliza isso como rotas dedicadas.

## Decisão

Criar rotas aninhadas `/performance/trips`, `/performance/weddings`, `/performance/corporativo` e expô-las como **sub-menu dropdown na sidebar**, abaixo do item "Performance".

Comportamento:
- Clicar "Performance" **abre/fecha o sub-menu** — sem navegação direta
- Sub-menu abre automaticamente quando o pathname começa com `/performance`
- ChevronRight rotacionado indica estado aberto/fechado
- Sub-itens: **Geral** (`/performance`), **Trips**, **Weddings**, **Corporativo**

### Por que dropdown na sidebar em vez de tab bar horizontal na página?

A tab bar horizontal foi a primeira implementação (v3.3-2 inicial), mas o usuário preferiu o dropdown na sidebar para manter a navegação centralizada e consistente com o padrão da sidebar. Tab bars horizontais fragmentam a UX quando coexistem com a sidebar.

### Por que "Performance" não navega?

O item funciona como categoria, não como destino. Forçar navegação para `/performance` ao clicar no pai criaria ambiguidade com a aba "Geral" do sub-menu.

## Consequências

**Positivas:**
- Navegação hierárquica clara: sidebar gerencia a estrutura, sub-itens gerenciam o destino
- Extensível: novos setores entram como sub-itens sem alterar o layout

**Negativas / trade-offs:**
- Item "Performance" na sidebar não é linkável diretamente — usuários que conhecem a URL `/performance` ainda chegam lá via "Geral"
- `SidebarContent` agora precisa de `useState` — aumentou levemente a complexidade do componente
