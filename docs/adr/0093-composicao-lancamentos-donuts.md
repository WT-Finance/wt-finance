# ADR-0093 — Composição dos Lançamentos com donuts e drill-down

**Status:** Aceito
**Data:** 2026-05-29
**Contexto:** A Composição dos Lançamentos (Fluxo de Caixa) era uma lista dupla (Entradas/Saídas por grupo) densa, que não comunicava proporção visualmente. Além disso, a RPC `get_decomposicao_grupo` tinha um bug de agregação que repetia a mesma label de grupo nas Entradas.

## Decisão

Reformular para **dois gráficos de rosca (donut)** — Entradas e Saídas — agregados por Grupo de Categoria, com os grupos menores somados numa fatia "Outros" e drill-down por categoria ao clicar. Corrige também o bug de agregação.

## Comportamento dos donuts

- Dois donuts lado a lado: Entradas (esquerda) | Saídas (direita). Recharts `PieChart` com `innerRadius`.
- Centro do donut: total do lado (ex: "Entradas R$ 20,9 Mi").
- Fatias = grupos de categoria, ordenadas por proporção decrescente.
- Grupos pequenos (além do top 6 ou < 2%) agregados numa fatia "Outros". Entradas (3 grupos) não precisa; Saídas (12 grupos) sim.
- Legenda ao lado de cada donut: grupo + percentual, clicável.
- Cores: paleta dessaturada seguindo o design system (entradas viés positivo, saídas viés negativo). Sem cores berrantes.

## Drill-down

- Clica numa fatia / item de legenda de grupo → drill-down: lista das categorias daquele grupo (nome, valor, % dentro do grupo). **Lista, não segundo donut** — grupos como RH têm 21 categorias.
- Clica em "Outros" → expande mostrando os grupos agregados (lista).
- Exibição inline abaixo do donut, com botão de voltar para a visão de grupos.

## Correção de dados (migration 0098)

A agregação foi corrigida para agrupar corretamente por `Grupo_de_Categoria`. Dados de referência validados: 3 grupos de entrada (Receita de Vendas ~96,5%, Receitas Não Operacionais ~3,4%, Receitas e Rendimentos Financeiros ~0,1%); 12 grupos de saída (Repasse ~52,9%, Despesas Operacionais de RH ~22,9% dominantes, com cauda de 10 grupos menores). Drill-down de categorias por grupo via RPC adicional/estendida na mesma migration.

## Justificativa

Donut comunica proporção imediatamente — o que o usuário quer ver. "Outros" agregado resolve a cauda longa das saídas (12 grupos, 10 pequenos). Drill-down em lista (não donut) lida bem com grupos que têm muitas categorias. Construir o donut sobre dado corrigido era pré-requisito — corrigir a agregação fez parte do escopo.
