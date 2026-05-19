# Acumulado de Recebimentos e Pagamentos (Weddings) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar gráfico de barras acumuladas (24 meses passados + 18 futuros) mostrando entradas e saídas Weddings, com linha de referência no total de custos e marcador "Hoje" separando efetivado de projetado.

**Architecture:** Nova função SQL `get_acumulado_weddings` buscada no servidor em `weddings-content.tsx` e passada como prop para um componente Recharts client-only. Nenhuma rota API extra (dados estáticos não dependem de filtros do cliente).

**Tech Stack:** PostgreSQL (plpgsql, window functions, generate_series), Recharts v3 (`ComposedChart`, `Bar`, `Cell`, `ReferenceLine`), Next.js 16 Server Components, TypeScript.

**Spec:** `docs/superpowers/specs/2026-05-19-acumulado-weddings-design.md`

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/0037_m8_acumulado_weddings.sql` | Criar | RPC `get_acumulado_weddings` |
| `src/types/database.ts` | Editar | Registrar RPC no tipo Supabase |
| `src/types/api.ts` | Editar | Tipos `AcumuladoMensalWeddingsItem` + `AcumuladoWeddings` |
| `src/components/weddings/acumulado-receb-pag-chart.tsx` | Criar | Componente Recharts client-only |
| `src/components/performance/weddings-content.tsx` | Editar | +1 rpc no Promise.all + novo `<Section>` |

> **Sem rota `/api`**: dados buscados server-side em `weddings-content.tsx`, mesma estratégia de `get_carteira_weddings` e `get_proximos_casamentos`.

---

## Task 1: Migração SQL

**Files:**
- Create: `supabase/migrations/0037_m8_acumulado_weddings.sql`

- [ ] **Passo 1 — Criar o arquivo de migração**

```sql
-- supabase/migrations/0037_m8_acumulado_weddings.sql
-- ---------------------------------------------------------------------------
-- 0037 — get_acumulado_weddings
-- Retorna série mensal acumulada de entradas e saídas Weddings.
-- Janela padrão: 24 meses passados + 18 futuros a partir do mês atual.
-- eh_futuro = true para mes >= date_trunc('month', CURRENT_DATE).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_acumulado_weddings(
  p_meses_passados int DEFAULT 24,
  p_meses_futuros  int DEFAULT 18
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mes_atual      date := date_trunc('month', CURRENT_DATE)::date;
  v_inicio         date;
  v_fim_exclusivo  date;
  v_result         jsonb;
BEGIN
  v_inicio        := (v_mes_atual - (p_meses_passados * interval '1 month'))::date;
  v_fim_exclusivo := (v_mes_atual + ((p_meses_futuros + 1) * interval '1 month'))::date;

  WITH meses_serie AS (
    SELECT (v_inicio + (n * interval '1 month'))::date AS mes
    FROM generate_series(0, p_meses_passados + p_meses_futuros) n
  ),
  lancamentos_agrupados AS (
    SELECT
      date_trunc('month', COALESCE(liquidacao_dt, vencimento_dt))::date AS mes,
      COALESCE(SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE 0 END), 0) AS entrada_mes,
      COALESCE(SUM(CASE WHEN tipo = 'Saída'   THEN valor ELSE 0 END), 0) AS saida_mes
    FROM analytics.fato_lancamento_operacao
    WHERE COALESCE(liquidacao_dt, vencimento_dt) >= v_inicio
      AND COALESCE(liquidacao_dt, vencimento_dt) <  v_fim_exclusivo
    GROUP BY 1
  ),
  serie_com_dados AS (
    SELECT
      m.mes,
      COALESCE(l.entrada_mes, 0) AS entrada_mes,
      COALESCE(l.saida_mes,   0) AS saida_mes
    FROM meses_serie m
    LEFT JOIN lancamentos_agrupados l ON l.mes = m.mes
  ),
  cumulativo AS (
    SELECT
      mes,
      mes >= v_mes_atual                                          AS eh_futuro,
      ROUND(SUM(entrada_mes) OVER (ORDER BY mes)::numeric, 2)    AS entrada_acum,
      ROUND(SUM(saida_mes)   OVER (ORDER BY mes)::numeric, 2)    AS saida_acum
    FROM serie_com_dados
  )
  SELECT jsonb_build_object(
    'total_saidas', (
      SELECT ROUND(COALESCE(SUM(valor), 0)::numeric, 2)
      FROM analytics.fato_lancamento_operacao
      WHERE tipo = 'Saída'
        AND COALESCE(liquidacao_dt, vencimento_dt) >= v_inicio
        AND COALESCE(liquidacao_dt, vencimento_dt) <  v_fim_exclusivo
    ),
    'meses', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'mes',          to_char(mes, 'YYYY-MM-DD'),
          'eh_futuro',    eh_futuro,
          'entrada_acum', entrada_acum,
          'saida_acum',   saida_acum
        )
        ORDER BY mes
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM cumulativo;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_acumulado_weddings(int, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_acumulado_weddings(int, int)
  TO anon, authenticated, service_role;
```

- [ ] **Passo 2 — Aplicar migração**

```bash
npx supabase db push
```

Esperado: `Applying migration 0037_m8_acumulado_weddings.sql... Finished supabase db push.`

- [ ] **Passo 3 — Verificar retorno da função**

```bash
npx supabase db query --linked \
  "SELECT public.get_acumulado_weddings(3, 3)::text"
```

Esperado: JSON com `total_saidas` (número) e `meses` (array de 7 objetos, cada um com `mes`, `eh_futuro`, `entrada_acum`, `saida_acum`). Os primeiros 3 meses devem ter `eh_futuro: false`, os últimos 3 `eh_futuro: true`, e o do meio (mês atual) `eh_futuro: true`.

- [ ] **Passo 4 — Verificar lógica de acumulado**

```bash
npx supabase db query --linked "
  SELECT
    (public.get_acumulado_weddings(3, 3)->'meses'->0->>'eh_futuro')  AS primeiro_eh_futuro,
    (public.get_acumulado_weddings(3, 3)->'meses'->6->>'eh_futuro')  AS ultimo_eh_futuro,
    (public.get_acumulado_weddings(3, 3)->>'total_saidas')::numeric   AS total_saidas
"
```

Esperado:
- `primeiro_eh_futuro` = `false`
- `ultimo_eh_futuro` = `true`
- `total_saidas` ≥ 0

- [ ] **Passo 5 — Commit**

```bash
git add supabase/migrations/0037_m8_acumulado_weddings.sql
git commit -m "feat(v3.5-m8): RPC get_acumulado_weddings — série mensal acumulada Weddings"
```

---

## Task 2: Tipos TypeScript

**Files:**
- Modify: `src/types/api.ts`
- Modify: `src/types/database.ts`

- [ ] **Passo 1 — Adicionar interfaces em `src/types/api.ts`**

Adicionar ao final do arquivo (depois de `ProximosCasamentos`):

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

- [ ] **Passo 2 — Registrar RPC em `src/types/database.ts`**

Localizar o bloco `get_proximos_casamentos` (por volta da linha 470) e inserir logo após:

```ts
      get_acumulado_weddings: {
        Args: { p_meses_passados?: number; p_meses_futuros?: number }
        Returns: Json
      }
```

O resultado final desse trecho deve ficar:

```ts
      get_proximos_casamentos: {
        Args: { p_horizonte_meses?: number }
        Returns: Json
      }
      get_acumulado_weddings: {
        Args: { p_meses_passados?: number; p_meses_futuros?: number }
        Returns: Json
      }
```

- [ ] **Passo 3 — Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Esperado: sem erros relacionados aos novos tipos.

- [ ] **Passo 4 — Commit**

```bash
git add src/types/api.ts src/types/database.ts
git commit -m "feat(v3.5-m8): tipos AcumuladoWeddings + RPC em database.ts"
```

---

## Task 3: Componente Recharts

**Files:**
- Create: `src/components/weddings/acumulado-receb-pag-chart.tsx`

- [ ] **Passo 1 — Criar o componente**

```tsx
'use client'

import {
  ResponsiveContainer, ComposedChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import { fmtBRL, fmtMi } from '@/lib/fmt'
import type { AcumuladoWeddings } from '@/types/api'

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function fmtMesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES_ABREV[parseInt(m) - 1]}/${y.slice(2)}`
}

interface Props {
  data: AcumuladoWeddings | null
}

export default function AcumuladoRecebPagChart({ data }: Props) {
  if (!data || !data.meses.length) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-4">
        <p className="text-sm text-zinc-400 text-center py-8">
          {data ? 'Sem lançamentos no período.' : 'Dados não disponíveis.'}
        </p>
      </div>
    )
  }

  const mesHoje = data.meses.find(m => m.eh_futuro)?.mes ?? null

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-sm font-semibold text-zinc-700">
          Acumulado de Recebimentos e Pagamentos
        </h2>
        <span className="text-xs text-zinc-400">24 meses passados + 18 futuros</span>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data.meses} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={fmtMesLabel}
            tick={{ fontSize: 10, fill: '#71717a' }}
            tickLine={false}
            interval={2}
          />
          <YAxis
            tickFormatter={v => fmtMi(v as number)}
            tick={{ fontSize: 11, fill: '#71717a' }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip
            formatter={(value, name) => [
              fmtBRL(value as number),
              name === 'entrada_acum' ? 'Entrada acum.' : 'Saída acum.',
            ]}
            labelFormatter={label => fmtMesLabel(label as string)}
          />
          <ReferenceLine
            y={data.total_saidas}
            stroke="#ef4444"
            strokeDasharray="6 4"
            strokeWidth={2}
            label={{ value: 'Total previsto de custos', position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }}
          />
          {mesHoje && (
            <ReferenceLine
              x={mesHoje}
              stroke="#a1a1aa"
              strokeDasharray="4 3"
              label={{ value: 'Hoje', position: 'insideTopLeft', fontSize: 10, fill: '#71717a' }}
            />
          )}
          <Bar dataKey="entrada_acum" name="entrada_acum" radius={[2,2,0,0]}>
            {data.meses.map((entry, i) => (
              <Cell key={i} fill="#3b82f6" fillOpacity={entry.eh_futuro ? 0.35 : 1} />
            ))}
          </Bar>
          <Bar dataKey="saida_acum" name="saida_acum" radius={[2,2,0,0]}>
            {data.meses.map((entry, i) => (
              <Cell key={i} fill="#f59e0b" fillOpacity={entry.eh_futuro ? 0.35 : 1} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legenda manual — mais simples e controlável que o <Legend> do Recharts */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 ml-[72px]">
        <LegendItem color="#3b82f6" opacity={1}    label="Entradas acum. (efetivado)" />
        <LegendItem color="#3b82f6" opacity={0.35} label="Entradas acum. (projetado)" />
        <LegendItem color="#f59e0b" opacity={1}    label="Saídas acum. (efetivado)"   />
        <LegendItem color="#f59e0b" opacity={0.35} label="Saídas acum. (projetado)"   />
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <svg width="20" height="10">
            <line x1="0" y1="5" x2="20" y2="5" stroke="#ef4444" strokeWidth="2" strokeDasharray="5 3" />
          </svg>
          Total previsto de custos
        </div>
      </div>
    </div>
  )
}

function LegendItem({ color, opacity, label }: { color: string; opacity: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
      <span
        className="inline-block w-3 h-3 rounded-sm"
        style={{ background: color, opacity }}
      />
      {label}
    </div>
  )
}
```

- [ ] **Passo 2 — Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Esperado: sem erros.

- [ ] **Passo 3 — Commit**

```bash
git add src/components/weddings/acumulado-receb-pag-chart.tsx
git commit -m "feat(v3.5-m8): componente AcumuladoRecebPagChart (Recharts)"
```

---

## Task 4: Integração na página

**Files:**
- Modify: `src/components/performance/weddings-content.tsx`

- [ ] **Passo 1 — Adicionar import**

No topo do arquivo, após os imports existentes de componentes weddings:

```ts
import AcumuladoRecebPagChart from '@/components/weddings/acumulado-receb-pag-chart'
```

E no bloco de imports de tipos:

```ts
import type {
  ExecutivaKpis, TendenciaMargem,
  MixProduto, PrejuizosDetalhe, Sparklines, SumarioSubsetor,
  CarteiraWeddings, ProximosCasamentos, AcumuladoWeddings,
} from '@/types/api'
```

- [ ] **Passo 2 — Adicionar RPC ao `Promise.all`**

O `Promise.all` atual tem 11 elementos. Adicionar `acumuladoRes` como 12º:

```ts
  const [
    kpisRes, tendRes, prodRes, prejRes, sparkRes, sumarioRes,
    cartCasRes, cartFatRes, cartRbRes, proximosRes, benchmarks,
    acumuladoRes,
  ] = await Promise.all([
    db.rpc('get_executiva_kpis', { ... }),   // existente — não mudar
    db.rpc('get_tendencia_margem', { ... }), // existente — não mudar
    db.rpc('get_mix_produto', { ... }),      // existente — não mudar
    db.rpc('get_prejuizos', { ... }),        // existente — não mudar
    db.rpc('get_sparklines', { ... }),       // existente — não mudar
    db.rpc('get_sumario_subsetor', { ... }), // existente — não mudar
    db.rpc('get_carteira_weddings', { p_metric: 'casamentos' }),   // existente
    db.rpc('get_carteira_weddings', { p_metric: 'faturamento' }),  // existente
    db.rpc('get_carteira_weddings', { p_metric: 'receita_bruta' }), // existente
    db.rpc('get_proximos_casamentos', { p_horizonte_meses: 18 }),   // existente
    getBenchmarks(db),                                               // existente
    db.rpc('get_acumulado_weddings', { p_meses_passados: 24, p_meses_futuros: 18 }), // NOVO
  ])
```

> Atenção: preservar todos os argumentos existentes — copiar do arquivo atual, adicionar apenas a linha nova no final.

- [ ] **Passo 3 — Extrair resultado**

Logo após as linhas `const proximos = ...` e `const benchmarks` (onde os outros resultados são extraídos), adicionar:

```ts
  const acumulado = acumuladoRes.error ? null : acumuladoRes.data as unknown as AcumuladoWeddings
```

- [ ] **Passo 4 — Adicionar `<Section>` na página**

Dentro de `<TopSection titulo="Visão Analítica por Operação">`, **após** `<Section titulo="Lista de Operações">...</Section>`:

```tsx
        <Section titulo="Acumulado de Recebimentos e Pagamentos">
          <AcumuladoRecebPagChart data={acumulado} />
        </Section>
```

O trecho final do `TopSection` deve ficar:

```tsx
      {/* ── VISÃO ANALÍTICA POR OPERAÇÃO ─────────────────────────── */}
      <TopSection titulo="Visão Analítica por Operação">

        <Section titulo="Lista de Operações">
          <OperacoesSection />
        </Section>

        <Section titulo="Acumulado de Recebimentos e Pagamentos">
          <AcumuladoRecebPagChart data={acumulado} />
        </Section>

      </TopSection>
```

- [ ] **Passo 5 — Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Esperado: sem erros.

- [ ] **Passo 6 — Testar no browser**

```bash
npm run dev
```

Abrir `http://localhost:3000/performance/weddings` e verificar:

- [ ] Seção "Acumulado de Recebimentos e Pagamentos" aparece abaixo de "Lista de Operações"
- [ ] Barras azuis (entrada) e âmbar (saída) aparecem
- [ ] Barras ficam transparentes nos meses futuros
- [ ] Linha vermelha tracejada "Total previsto de custos" aparece
- [ ] Linha cinza "Hoje" aparece separando passado de futuro
- [ ] Tooltip ao passar o mouse mostra valores em BRL formatado
- [ ] Eixo Y mostra valores abreviados (ex: R$ 10 Mi, R$ 500 k)
- [ ] Não há erro no console do browser

- [ ] **Passo 7 — Commit final**

```bash
git add src/components/performance/weddings-content.tsx
git commit -m "feat(v3.5-m8): integra AcumuladoRecebPagChart na aba Weddings"
```

---

## Checklist pós-implementação

- [ ] `npx tsc --noEmit` passa sem erros
- [ ] Gráfico renderiza com dados reais (não vazio)
- [ ] Barras futuras estão visivelmente mais claras que as passadas
- [ ] Linha vermelha está acima das barras de saída (o limiar é o total, não o máximo atual)
- [ ] Console do browser sem erros de runtime
