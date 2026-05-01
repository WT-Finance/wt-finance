# ADR 0009 — Lógica de período anterior proporcional

**Status:** aceito  
**Data:** 2026-05-01

## Contexto

Ao comparar o mês corrente (ex: 1–27/abr) com o mês anterior completo (1–31/mar), a variação inclui um efeito de duração: 27 dias vs 31 dias. Para a diretoria, isso pode parecer uma queda de desempenho quando na verdade é só diferença de tamanho do período.

O mesmo problema afeta o YoY: comparar 1–27/abr/26 com abr/25 inteiro distorce o resultado.

## Decisão

Quando o período selecionado ainda está **em curso** (data final ≥ hoje), os períodos de comparação são ajustados proporcionalmente:

- **Anterior:** recua exatamente `dias_decorridos` dias antes do início do período atual  
  (ex: hoje=27/abr → anterior = 1–27/mar, não 1–31/mar)
- **YoY:** vai de `(início − 1 ano)` até `(hoje − 1 ano)`  
  (ex: hoje=27/abr/26 → YoY = 1–27/abr/25)

Quando o período está **encerrado** (data final < hoje), o comportamento antigo é mantido: período anterior contíguo de mesma duração, YoY bloco idêntico do ano anterior.

A lógica vive inteiramente em TypeScript (`src/lib/periodo.ts`) nas funções:
- `calcularPeriodoAnteriorInteligente(periodo, hoje)`
- `calcularYoYInteligente(periodo, hoje)`
- `resolverPeriodoCompleto(params, hoje)`

O Server Component passa os períodos pré-calculados como parâmetros opcionais para `get_executiva_kpis` via `COALESCE`, sem alterar a lógica SQL.

## Por que não no SQL?

Manter no TypeScript permite testar a lógica em isolamento (sem banco), facilita debugging e mantém o SQL agnóstico ao contexto de exibição.

## Indicador visual

Quando `eParcial = true`, os KPI cards exibem o texto **"período proporcional"** em cinza claro (10px) abaixo do valor principal. Propositalmente discreto — informa sem poluir.

## Consequências

- **Positivo:** comparações justas para períodos abertos; diretoria não vê -44% artificial.
- **Positivo:** comportamento encerrado mantém compatibilidade com uso existente.
- **Negativo:** período proporcional não é intuitivo para todos — mitigado pelo label.
- **Negativo:** para "este ano" com 1 dia decorrido, a comparação é 1 dia vs 1 dia — estatisticamente frágil mas correto conceitualmente.
- **Decisão adiada:** toggle para desativar o ajuste proporcional — adiado para v3.1.
