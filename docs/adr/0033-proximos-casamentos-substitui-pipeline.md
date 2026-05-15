# ADR 0033 — Próximos Casamentos substitui Pipeline

**Status:** Aceito  
**Data:** Maio/2026  
**Versão:** v3.5-m4

## Contexto

A v3.4 tinha um "Pipeline" que listava casamentos futuros com probabilidade de fechamento, receita esperada e cor (verde/amarelo/vermelho) baseada na margem média.

Após revisão com a gestora, o Pipeline foi considerado desnecessário por duas razões:
1. A Carteira Vendas×Entregas (ADR 0032) já mostra os compromisos futuros de forma mais clara.
2. A "probabilidade" no pipeline era implícita (todos os contratos confirmados têm 100% de probabilidade) — o campo não acrescentava informação real.

A necessidade operacional real é: **"Quais casamentos devo me preparar para entregar nos próximos meses?"**

## Decisão

**Remover o Pipeline; adicionar "Próximos Casamentos a Entregar" com horizonte configurável.**

- Fonte: `dim_operacao_weddings WHERE situacao = 'futuro' AND data_evento <= CURRENT_DATE + N months`
- Horizonte: 3 / 6 / 12 / 18 meses (toggle; dados de 18m carregados uma vez, filtrados client-side)
- Colunas: Data · Casal · Hotel · Faturamento · Receita Bruta · Margem % · RL Prevista
- **RL Prevista** = `receita_bruta × avg(resultado_caixa / receita_bruta)` para operações históricas com caixa plausível (ver abaixo)

### Critério de "caixa plausível" para RL Prevista

A razão histórica só usa operações onde `0 ≤ resultado_caixa ≤ receita_bruta`. Isso exclui operações com dados de caixa incompletos (lançamentos sem as saídas correspondentes), onde `(entradas − saídas) / receita_bruta >> 1` por falta de registro das saídas ao hotel.

Se nenhuma operação histórica passar no filtro, RL Prevista exibe "—" (honesto em vez de incorreto).

## Motivo

- Alinha com o uso real: a gestora quer saber "próximos 6 meses", não "pipeline probabilístico".
- A Carteira cobre a visão estratégica de compromisos multi-ano; Próximos Casamentos cobre a visão operacional de curto prazo.
- Carregar 18m no servidor e filtrar client-side evita múltiplas chamadas de rede ao mudar o horizonte.

## Consequências

- `pipeline-card.tsx` removido do repositório.
- RPC `get_pipeline_weddings` permanece no banco (backward compat) mas não é chamado pela UI.
- RL Prevista pode ser "—" para todos os casamentos futuros se o histórico de caixa for incompleto — isso é o comportamento correto.
- A coluna RL Prevista é exibida em itálico para indicar que é uma estimativa, não um valor realizado.
