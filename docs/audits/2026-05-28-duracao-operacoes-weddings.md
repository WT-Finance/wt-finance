# Auditoria — Duração de Operações Weddings

**Data:** 2026-05-28
**Objetivo:** Investigar por que algumas operações não exibem o campo Duração

## Causa Raiz

Causa dupla: problema de dados (primário) + bug de código (secundário).

### 1. Problema de dados — `data_venda_contrato` nula (causa principal)

O campo `data_venda_contrato` é extraído de `raw.vendas_excel.data_venda` onde `contrato = true`,
via JOIN em `analytics.fato_lancamento_operacao`. Operações sem linha com `contrato = true` no ERP
recebem `data_venda_contrato = NULL` em `analytics.dim_operacao_weddings`, e portanto `calcularDuracao`
retorna `null`, exibindo `—`.

Isso afeta operações cujos dados foram importados sem a flag `contrato = 1` ativa, ou em que o vínculo
`fato_lancamento_operacao.venda_n → raw.vendas_excel` não existe. A função `regenerar_dim_operacao_weddings`
já inclui um fallback via `pagante = nome_casal` (migration 0042), mas ele também exige `contrato = true`.

### 2. Bug de código — duração negativa não filtrada (causa secundária)

A função `calcularDuracao` original usava `new Date('YYYY-MM-DD')`, que:
- Parseia como UTC midnight — pode gerar imprecisão de ±1 dia em fusos negativos (UTC-3), embora
  o cancelamento simétrico dos dois operandos torne isso improvável na prática.
- Não filtrava valores negativos: se `data_venda_contrato > data_evento` (erro de cadastro),
  a coluna exibia `-45 dias` em vez de `—`.

## Escopo

Operações afetadas são as que atendem a **qualquer** dos critérios:
- Não têm linha `contrato = true` em `raw.vendas_excel` vinculada via `venda_n`
- Não têm correspondência pelo fallback `pagante = nome_casal AND contrato = true`
- Têm `data_venda_contrato > data_evento` (inverso cronológico — erro de cadastro)

Sem acesso direto ao banco de produção, não é possível enumerar as operações exatas.
Exemplos mencionados: Natalhia e Vinicius, Isabela e Fabiano.

## Correção Aplicada

**Arquivo:** `src/components/weddings/lista-operacoes.tsx` — função `calcularDuracao`

Duas mudanças:

1. **Timezone-safe**: substituiu `new Date('YYYY-MM-DD').getTime()` por `Date.UTC(y, m-1, d)`
   usando string split, eliminando qualquer ambiguidade de fuso horário.

2. **Filtro de duração negativa**: adicionado `return dias >= 0 ? dias : null` — duração negativa
   (data de venda posterior à data do evento) agora exibe `—` em vez de um valor negativo.

```ts
function calcularDuracao(dataVenda: string | null, dataEvento: string | null): number | null {
  if (!dataVenda || !dataEvento) return null
  const [yv, mv, dv] = dataVenda.split('-').map(Number)
  const [ye, me, de] = dataEvento.split('-').map(Number)
  const msVenda  = Date.UTC(yv, mv - 1, dv)
  const msEvento = Date.UTC(ye, me - 1, de)
  const dias = Math.round((msEvento - msVenda) / (1000 * 60 * 60 * 24))
  return dias >= 0 ? dias : null
}
```

## Pendências Operacionais

O campo Duração continuará exibindo `—` para operações sem `data_venda_contrato` no banco.
Para corrigi-las:

1. **Yan deve verificar no ERP** se as operações afetadas (ex: Natalhia e Vinicius, Isabela e Fabiano)
   possuem uma venda com `contrato = 1` e data de venda preenchida.

2. Caso não existam no ERP, a data de assinatura do contrato deve ser cadastrada.

3. Após correção no ERP, executar `SELECT public.regenerar_dim_operacao_weddings()` para atualizar
   `analytics.dim_operacao_weddings` com os novos dados.

A coluna Duração só exibirá valores para operações que tenham `data_venda_contrato` preenchida na
tabela `analytics.dim_operacao_weddings`.
