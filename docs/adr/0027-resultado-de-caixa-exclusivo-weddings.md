# ADR 0027 — Resultado de Caixa como métrica exclusiva de Weddings

**Status:** Aceito  
**Data:** Maio/2026  
**Versão:** v3.4-1

## Contexto

Weddings tem uma planilha de Lançamentos por Operação (38k linhas, 226 operações) com entradas e saídas financeiras por casamento. Essa estrutura não existe para Trips ou Corporativo.

A gestora anterior calculava "2ª Receita" classificando custos internos por categoria (Comissões, Assessoria, etc.). Essa classificação era subjetiva e inconsistente.

## Decisão

**Resultado de Caixa = Entradas Totais − Saídas Totais por operação.** Métrica exclusiva de Weddings. Não será generalizada para outros setores.

## Motivo

- Derivada diretamente dos lançamentos, sem classificação subjetiva.
- Simples de calcular e auditar: `resultado_caixa = entradas_total - saidas_total` (coluna GENERATED no banco).
- Outros setores não têm estrutura de dados equivalente — generalizar seria criar uma métrica vazia ou enganosa.
- Elimina a necessidade de "2ª Receita" da gestora antiga, que era complexa e não documentada.

## Consequências

- Resultado de Caixa só aparece na aba Weddings (Bloco 2.3 drill-down e Bloco 2.2 lista de operações).
- NCG (Necessidade de Capital de Giro = A Pagar − A Receber) também é derivada dos lançamentos e exclusiva de Weddings.
- Decomposição de custo por subsetor **não é implementada** (rateio seria arbitrário).
