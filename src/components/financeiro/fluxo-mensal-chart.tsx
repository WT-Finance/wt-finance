'use client'

import { useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Line, Legend,
} from 'recharts'
import { fmtMi } from '@/lib/fmt'

export interface FluxoMensalV3Row {
  mes:                string   // 'YYYY-MM'
  entrada_efetivada:  number
  entrada_prevista:   number
  saida_efetivada:    number
  saida_prevista:     number
  resultado_mensal:   number
}

// Backwards-compat alias (consumed by page.tsx until M4 rewrites it)
export type FluxoMensalRow = FluxoMensalV3Row

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function fmtMesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES_ABREV[parseInt(m, 10) - 1]}/${y.slice(2)}`
}

// ── Custom dot for resultado_mensal line ─────────────────────────────────────

interface DotProps {
  cx?:     number
  cy?:     number
  value?:  number
}

function ResultadoDot({ cx, cy, value }: DotProps) {
  if (cx === undefined || cy === undefined || value === undefined) return null
  const fill = value >= 0 ? 'var(--text-primary)' : 'var(--negative-deep)'
  return <circle cx={cx} cy={cy} r={4} fill={fill} stroke="none" />
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

const SERIES_LABELS: Record<string, string> = {
  entrada_efetivada:   'Entradas efetivadas',
  entrada_prevista:    'Entradas previstas',
  saida_efetivada_val: 'Saídas efetivadas',
  saida_prevista_val:  'Saídas previstas',
  resultado_mensal:    'Resultado mensal',
}

interface TooltipProps {
  active?:  boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?:   string
}

function FluxoTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-md p-3 text-xs min-w-[190px]">
      <p className="font-semibold text-zinc-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.color }}>{SERIES_LABELS[p.name] ?? p.name}</span>
          <span className="font-medium text-zinc-700">{fmtMi(Math.abs(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function FluxoLegend() {
  const items = [
    { label: 'Entradas efetivadas',  color: 'var(--positive)',     opacity: 1,    type: 'rect' as const },
    { label: 'Entradas previstas',   color: 'var(--positive)',     opacity: 0.45, type: 'rect' as const },
    { label: 'Saídas efetivadas',    color: 'var(--negative)',     opacity: 1,    type: 'rect' as const },
    { label: 'Saídas previstas',     color: 'var(--negative)',     opacity: 0.45, type: 'rect' as const },
    { label: 'Resultado mensal',     color: 'var(--text-primary)', opacity: 1,    type: 'line' as const },
    { label: 'Resultado negativo',   color: 'var(--negative-deep)',opacity: 1,    type: 'dot'  as const },
  ]
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
      {items.map(it => (
        <div key={it.label} className="flex items-center gap-1.5 text-xs text-zinc-500">
          {it.type === 'rect' && (
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ background: it.color, opacity: it.opacity }}
            />
          )}
          {it.type === 'line' && (
            <span className="inline-block w-5 h-0.5" style={{ background: it.color }} />
          )}
          {it.type === 'dot' && (
            <svg width="10" height="10" className="inline-block">
              <circle cx="5" cy="5" r="4" fill={it.color} />
            </svg>
          )}
          {it.label}
        </div>
      ))}
    </div>
  )
}

// ── Data transform ────────────────────────────────────────────────────────────

interface ChartPoint {
  label:               string
  entrada_efetivada:   number
  entrada_prevista:    number
  saida_efetivada_val: number
  saida_prevista_val:  number
  resultado_mensal:    number
}

function toChartPoints(rows: FluxoMensalV3Row[], invertida: boolean): ChartPoint[] {
  return [...rows]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(r => ({
      label:               fmtMesLabel(r.mes),
      entrada_efetivada:   r.entrada_efetivada,
      entrada_prevista:    r.entrada_prevista,
      saida_efetivada_val: invertida ? r.saida_efetivada : -r.saida_efetivada,
      saida_prevista_val:  invertida ? r.saida_prevista  : -r.saida_prevista,
      resultado_mensal:    r.resultado_mensal,
    }))
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  rows: FluxoMensalV3Row[]
}

export default function FluxoMensalChart({ rows }: Props) {
  const [invertida, setInvertida] = useState(false)
  const data = toChartPoints(rows, invertida)

  const saidaRadius: [number, number, number, number] = invertida ? [2, 2, 0, 0] : [0, 0, 2, 2]

  if (!data.length) {
    return (
      <div className="rounded-xl border border-[--border] bg-white p-5 mb-4">
        <div className="h-56 flex items-center justify-center text-sm text-zinc-400">
          Sem dados para o período
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[--border] bg-white p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-2">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Fluxo de Caixa Mensal</h3>
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>24 meses passados + 18 futuros</span>
        </div>
        <button
          onClick={() => setInvertida(v => !v)}
          className="text-xs text-zinc-500 border border-zinc-200 rounded px-2.5 py-1 hover:bg-zinc-50 active:bg-zinc-100 transition-colors shrink-0"
        >
          ⇅ Inverter saídas
        </button>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart
          data={data}
          barCategoryGap="15%"
          barGap={1}
          margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#71717a' }}
            axisLine={false}
            tickLine={false}
            interval={2}
          />
          <YAxis
            tickFormatter={v => fmtMi(Math.abs(v as number))}
            tick={{ fontSize: 11, fill: '#71717a' }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<FluxoTooltip />} />
          <ReferenceLine y={0} stroke="#e4e4e7" />

          <Bar
            dataKey="entrada_efetivada"
            name="entrada_efetivada"
            fill="var(--positive)"
            fillOpacity={1}
            radius={[2, 2, 0, 0]}
            barSize={5}
            animationDuration={400}
            animationEasing="ease-in-out"
          />
          <Bar
            dataKey="entrada_prevista"
            name="entrada_prevista"
            fill="var(--positive)"
            fillOpacity={0.45}
            radius={[2, 2, 0, 0]}
            barSize={5}
            animationDuration={400}
            animationEasing="ease-in-out"
          />
          <Bar
            dataKey="saida_efetivada_val"
            name="saida_efetivada_val"
            fill="var(--negative)"
            fillOpacity={1}
            radius={saidaRadius}
            barSize={5}
            animationDuration={400}
            animationEasing="ease-in-out"
          />
          <Bar
            dataKey="saida_prevista_val"
            name="saida_prevista_val"
            fill="var(--negative)"
            fillOpacity={0.45}
            radius={saidaRadius}
            barSize={5}
            animationDuration={400}
            animationEasing="ease-in-out"
          />

          <Line
            dataKey="resultado_mensal"
            name="resultado_mensal"
            stroke="var(--text-primary)"
            strokeWidth={2}
            dot={(props: DotProps) => <ResultadoDot key={`dot-${props.cx}-${props.cy}`} {...props} />}
            activeDot={{ r: 5 }}
            type="monotone"
            isAnimationActive={false}
          />

          {/* Legend hidden from Recharts — we render our own below */}
          <Legend content={() => null} />
        </ComposedChart>
      </ResponsiveContainer>
      <FluxoLegend />
    </div>
  )
}
