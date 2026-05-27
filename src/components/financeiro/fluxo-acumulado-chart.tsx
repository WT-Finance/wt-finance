'use client'

import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import { fmtMi } from '@/lib/fmt'

export interface FluxoAcumuladoRow {
  mes:                     string   // 'YYYY-MM'
  acum_entrada_efetivada:  number
  acum_entrada_prevista:   number
  acum_saida_efetivada:    number
  acum_saida_prevista:     number
}

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function fmtMesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES_ABREV[parseInt(m, 10) - 1]}/${y.slice(2)}`
}

function currentMesLabel(): string {
  const now = new Date()
  return `${MESES_ABREV[now.getMonth()]}/${String(now.getFullYear()).slice(2)}`
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

const SERIES_LABELS: Record<string, string> = {
  acum_entrada_efetivada: 'Entradas efetivadas acum.',
  acum_entrada_prevista:  'Entradas previstas acum.',
  acum_saida_efetivada:   'Saídas efetivadas acum.',
  acum_saida_prevista:    'Saídas previstas acum.',
}

interface TooltipProps {
  active?:  boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?:   string
}

function AcumuladoTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-md p-3 text-xs min-w-[210px]">
      <p className="font-semibold text-zinc-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.color }}>{SERIES_LABELS[p.name] ?? p.name}</span>
          <span className="font-medium text-zinc-700">{fmtMi(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function AcumuladoLegend() {
  const items = [
    { label: 'Entradas efetivadas acum.', color: 'var(--positive)', opacity: 1    },
    { label: 'Entradas previstas acum.',  color: 'var(--positive)', opacity: 0.45 },
    { label: 'Saídas efetivadas acum.',   color: 'var(--negative)', opacity: 1    },
    { label: 'Saídas previstas acum.',    color: 'var(--negative)', opacity: 0.45 },
  ]
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
      {items.map(it => (
        <div key={it.label} className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span
            className="w-3 h-3 rounded-sm inline-block"
            style={{ background: it.color, opacity: it.opacity }}
          />
          {it.label}
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface ChartPoint {
  label:                   string
  acum_entrada_efetivada:  number
  acum_entrada_prevista:   number
  acum_saida_efetivada:    number
  acum_saida_prevista:     number
}

function toChartPoints(rows: FluxoAcumuladoRow[]): ChartPoint[] {
  return [...rows]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(r => ({
      label:                  fmtMesLabel(r.mes),
      acum_entrada_efetivada: r.acum_entrada_efetivada,
      acum_entrada_prevista:  r.acum_entrada_prevista,
      acum_saida_efetivada:   r.acum_saida_efetivada,
      acum_saida_prevista:    r.acum_saida_prevista,
    }))
}

interface Props {
  rows: FluxoAcumuladoRow[]
}

export default function FluxoAcumuladoChart({ rows }: Props) {
  const data = toChartPoints(rows)

  if (!data.length) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-zinc-400">
        Sem dados para o período
      </div>
    )
  }

  const hojeLabel = currentMesLabel()

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={data}
          barCategoryGap="20%"
          barGap={2}
          margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={v => fmtMi(v as number)}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<AcumuladoTooltip />} />

          {/* Vertical reference line at current month */}
          <ReferenceLine
            x={hojeLabel}
            stroke="#9ca3af"
            strokeDasharray="4 4"
            label={{ value: 'Hoje', position: 'insideTopRight', fontSize: 11, fill: '#9ca3af' }}
          />

          <Bar
            dataKey="acum_entrada_efetivada"
            name="acum_entrada_efetivada"
            fill="var(--positive)"
            fillOpacity={1}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="acum_entrada_prevista"
            name="acum_entrada_prevista"
            fill="var(--positive)"
            fillOpacity={0.45}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="acum_saida_efetivada"
            name="acum_saida_efetivada"
            fill="var(--negative)"
            fillOpacity={1}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="acum_saida_prevista"
            name="acum_saida_prevista"
            fill="var(--negative)"
            fillOpacity={0.45}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
      <AcumuladoLegend />
    </div>
  )
}
