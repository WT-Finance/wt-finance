# ADR-0060 — Aba Financeiro top-level com sub-abas

**Status:** Aceito
**Data:** Maio/2026
**Versão:** v4.0-m1

## Contexto

A v3.x concentrava toda a navegação analítica dentro de "Performance" com sub-abas (Weddings, Corporativo, Executiva). Com a v4.0, surgiu a necessidade de uma área dedicada a dados financeiros (Fluxo de Caixa, futuramente DRE e Conciliação). Inserir esses dados como mais uma sub-aba de Performance misturaria dados operacionais de vendas com dados financeiros de lançamentos, criando ambiguidade conceitual para o usuário.

## Decisão

Criar "Financeiro" como item top-level na sidebar, em paralelo a "Performance" — não como sub-aba. A estrutura inicial inclui a sub-aba "Fluxo de Caixa" como único item de navegação, com espaço reservado para DRE e Conciliação em versões futuras.

Implementação:
- Rota: `src/app/financeiro/` com sub-rota `fluxo-caixa/`
- Link na sidebar: `src/components/layout/sidebar.tsx` — item `/financeiro` com comportamento de toggle (expansão/colapso) análogo a Performance
- Estado de expansão persistido em `localStorage` com chave `sidebar-financeiro-open`
- Cor dinâmica da sidebar usa `var(--brand)` quando `/financeiro` está ativo, seguindo o padrão dos demais itens top-level

## Consequências

- Separação conceitual limpa: Performance trata dados operacionais de vendas; Financeiro trata lançamentos, contas bancárias e fluxo de caixa
- A sidebar fica mais longa com mais um item top-level expandível
- Sub-abas DRE e Conciliação referenciadas no briefing ainda não foram implementadas — ficam como dívida técnica de versões futuras
