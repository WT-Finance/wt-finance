# ADR 0008 — Granularidade adaptativa na Tendência de Margem

**Status:** aceito  
**Data:** 2026-04-30

## Contexto

O gráfico de Tendência de Margem precisa ser legível para intervalos muito distintos — de uma semana até vários anos. Pontos diários num intervalo de 2 anos resultariam em ~700 pontos ilegíveis; pontos mensais numa semana resultariam em 1 ponto inútil.

## Decisão

A granularidade é calculada automaticamente pela função SQL `get_tendencia_margem` com base no número de dias do intervalo:

| Intervalo | Granularidade |
|-----------|--------------|
| ≤ 30 dias | diária |
| 31 – 90 dias | semanal (ISO week) |
| ≥ 91 dias | mensal |

A resposta inclui o campo `granularidade` para que o frontend possa exibir o rótulo sem recalcular.

## Consequências

- **Positivo:** UI sempre legível sem configuração do usuário.
- **Positivo:** Lógica centralizada no banco; componente React é passivo.
- **Negativo:** Usuário não pode escolher granularidade manualmente (aceito por ora — escopo v2).
- **Negativo:** Semana ISO pode começar segunda-feira, o que pode ser contra-intuitivo para alguns usuários brasileiros (aceitável — label mostra a data de início da semana).
