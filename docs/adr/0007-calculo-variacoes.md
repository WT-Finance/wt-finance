# ADR 0007 — Cálculo de variações (período anterior e YoY)

**Status:** aceito  
**Data:** 2026-04-30

## Contexto

A Aba Executiva exibe, para cada KPI, a variação percentual contra dois períodos de referência: o período anterior contíguo de mesma duração, e o mesmo período do ano anterior (YoY). As regras de cálculo precisam ser explícitas para evitar ambiguidade em casos extremos.

## Decisões

### Período anterior contíguo

Definição: dado período `[from, to]` com duração `d = to - from + 1` dias (inclusive), o período anterior é `[from - d, from - 1]`.

Exemplos:
- `[01/abr, 30/abr]` (30 dias) → `[02/mar, 31/mar]`
- `[01/jan, 27/abr]` (117 dias YTD) → `[06/set/25, 31/dez/25]`

### Variação YoY

`subYears(from, 1)` e `subYears(to, 1)` via `date-fns` — lida corretamente com 29/fev em anos bissextos.

### Variação de margem em p.p.

Margem é um percentual, não uma grandeza monetária. Sua variação é expressa em **pontos percentuais** (diferença absoluta), não em variação relativa. Exemplo: 13,5% → 14,0% = `+0,5 p.p.`, não `+3,7%`. A flag `is_pp: true` no retorno da API instrui a UI a exibir o sufixo correto.

### Edge cases

| Situação | Comportamento |
|---|---|
| `valor_anterior = 0`, `valor_atual > 0` | `variacao = null` (novo período com dados) |
| `valor_anterior = 0`, `valor_atual = 0` | `variacao = null` (sem dados em ambos) |
| `valor_anterior < 0` (receita negativa) | Variação relativa pode ser enganosa; usar com cautela |
| `|variação| < 0,5 p.p. ou %` | UI exibe sem setinha (neutro) |

### Cálculo no banco (SECURITY DEFINER)

Toda a aritmética de variações acontece dentro da função `get_executiva_kpis` no Postgres, evitando múltiplas queries e round trips. A função retorna os três períodos (atual, anterior, YoY) já calculados no JSON de resposta, junto com os valores brutos de cada período para auditoria.

## Consequências

- UI não precisa calcular variações — recebe valores prontos.
- Edge cases de divisão por zero são tratados no SQL (`CASE WHEN ... > 0 THEN ... ELSE NULL`).
- Adicionar novas métricas requer apenas estender o JSON retornado pela função SQL.
