# Acumulado de Recebimentos e Pagamentos — Weddings

**Data:** 2026-05-19
**Seção:** Visão Analítica por Operação → abaixo de Lista de Operações
**Missão:** M8

---

## Objetivo

Gráfico de barras acumuladas mostrando o fluxo de caixa agregado do portfólio Weddings ao longo do tempo (24 meses passados + 18 futuros). Permite visualizar:

- Quando os recebimentos já efetivados cobrem o total de custos projetados (efetivados + futuros)
- A curva de crescimento de entradas vs saídas ao longo do tempo
- A separação clara entre o que já aconteceu (sólido) e o que está projetado (transparente)

---

## Fonte de dados

Tabela: `analytics.fato_lancamento_operacao`

Campos relevantes:
- `tipo`: `'Entrada'` | `'Saída'`
- `status`: `'Entrada'` | `'A Receber Futuro'` | `'Saída'` | `'A Pagar Futuro'`
- `liquidacao_dt`: data em que o lançamento foi efetivado (pode ser null para projetados)
- `vencimento_dt`: data de vencimento prevista
- `valor`: valor do lançamento em BRL

**Data canônica por lançamento:** `COALESCE(liquidacao_dt, vencimento_dt)` — para efetivados usa a data real; para projetados usa o vencimento previsto.

**Distinção passado/futuro por mês:** `eh_futuro = mes >= date_trunc('month', CURRENT_DATE)`. Meses anteriores ao mês atual são passado; mês atual e seguintes são futuro.

---

## Camada SQL

### Função: `public.get_acumulado_weddings`

```sql
get_acumulado_weddings(
  p_meses_passados int DEFAULT 24,
  p_meses_futuros  int DEFAULT 18
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
```

**Lógica:**
1. `generate_series` para gerar todos os meses da janela
2. `LEFT JOIN` com lançamentos agrupados por mês via `DATE_TRUNC('month', COALESCE(liquidacao_dt, vencimento_dt))`
3. Window function `SUM(...) OVER (ORDER BY mes)` para acumulados
4. `total_saidas`: `SUM(valor) WHERE tipo = 'Saída'` na mesma janela (limiar da linha de referência)

**Retorno JSON:**
```json
{
  "total_saidas": 26543210,
  "meses": [
    { "mes": "2024-05-01", "eh_futuro": false, "entrada_acum": 8234567, "saida_acum": 6987654 },
    { "mes": "2026-05-01", "eh_futuro": true,  "entrada_acum": 24100000, "saida_acum": 22800000 }
  ]
}
```

**Migração:** `supabase/migrations/0037_m8_acumulado_weddings.sql`

**Permissões:** REVOKE PUBLIC, GRANT anon/authenticated/service_role (padrão do projeto).

---

## Tipos TypeScript

Adicionar em `src/types/api.ts`:

```ts
export interface AcumuladoMensalWeddingsItem {
  mes:          string   // 'YYYY-MM-DD' (primeiro dia do mês)
  eh_futuro:    boolean
  entrada_acum: number
  saida_acum:   number
}

export interface AcumuladoWeddings {
  total_saidas: number
  meses:        AcumuladoMensalWeddingsItem[]
}
```

Adicionar entrada em `src/types/database.ts` na seção de RPCs públicos:

```ts
get_acumulado_weddings: {
  Args: { p_meses_passados?: number; p_meses_futuros?: number }
  Returns: Json
}
```

---

## Camada API

**Arquivo:** `src/app/api/dashboard/weddings/acumulado/route.ts`

```ts
GET /api/dashboard/weddings/acumulado
```

- Sem parâmetros de query (janela fixa: 24 + 18)
- Chama `get_acumulado_weddings({ p_meses_passados: 24, p_meses_futuros: 18 })`
- Retorna o JSONB diretamente como `AcumuladoWeddings`
- Erro → `{ error: message }` com status 500

---

## Componente

**Arquivo:** `src/components/weddings/acumulado-receb-pag-chart.tsx`

**Tipo:** Client Component (`'use client'`)

**Props:**
```ts
interface Props { data: AcumuladoWeddings }
```

**Biblioteca:** Recharts (`ComposedChart`)

### Elementos visuais

| Elemento | Recharts | Configuração |
|---|---|---|
| Barras de entrada | `<Bar dataKey="entrada_acum">` | fill `#3b82f6`; `<Cell fillOpacity={eh_futuro ? 0.35 : 1}>` |
| Barras de saída | `<Bar dataKey="saida_acum">` | fill `#f59e0b`; `<Cell fillOpacity={eh_futuro ? 0.35 : 1}>` |
| Linha limiar | `<ReferenceLine y={total_saidas}>` | stroke `#ef4444`, `strokeDasharray="6 4"`, strokeWidth 2 |
| Divisor "Hoje" | `<ReferenceLine x={mesAtual}>` | stroke `#a1a1aa`, `strokeDasharray="3 3"`, label "Hoje" |
| Eixo X | `<XAxis dataKey="mes">` | `tickFormatter` → `"MMM/YY"`, mostrar a cada 3 meses |
| Eixo Y | `<YAxis>` | `tickFormatter` → `fmtBRL` abreviado (R$ 10M / R$ 500k) |
| Tooltip | `<Tooltip>` | valores formatados em BRL completo; label = nome do mês |
| Legenda | inline manual | Entrada (azul) · Saída (âmbar) · Limiar (vermelho tracejado) |

### Estados

- Dados `null` (erro no SSR) → mensagem "Dados não disponíveis" sem quebrar a página
- Array vazio → mensagem "Sem lançamentos no período"

---

## Integração na página

**Arquivo:** `src/components/performance/weddings-content.tsx`

### 1. Adicionar ao `Promise.all`:

```ts
db.rpc('get_acumulado_weddings', { p_meses_passados: 24, p_meses_futuros: 18 }),
```

### 2. Extrair resultado:

```ts
const acumulado = acumuladoRes.error ? null : acumuladoRes.data as unknown as AcumuladoWeddings
```

### 3. Novo `<Section>` após Lista de Operações, dentro de `<TopSection titulo="Visão Analítica por Operação">`:

```tsx
<Section titulo="Acumulado de Recebimentos e Pagamentos">
  <AcumuladoRecebPagChart data={acumulado} />
</Section>
```

---

## Arquivos modificados

| Arquivo | Ação |
|---|---|
| `supabase/migrations/0037_m8_acumulado_weddings.sql` | Criar — RPC `get_acumulado_weddings` |
| `src/types/database.ts` | Editar — adicionar entrada RPC |
| `src/types/api.ts` | Editar — adicionar 2 interfaces |
| `src/app/api/dashboard/weddings/acumulado/route.ts` | Criar — rota GET |
| `src/components/weddings/acumulado-receb-pag-chart.tsx` | Criar — componente Recharts |
| `src/components/performance/weddings-content.tsx` | Editar — +1 rpc + +1 section |

---

## Fora de escopo

- Filtros no gráfico (janela fixa 24+18)
- Drill-down por operação individual (já existe no drawer)
- Configuração de granularidade (sempre mensal)
