'use client'

import {
  ResponsiveContainer, ComposedChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Line,
} from 'recharts'
import { fmtMi } from '@/lib/fmt'

export interface FluxoMensalRow {
  mes:             string   // 'YYYY-MM'
  is_realizado:    boolean
  entradas:        number
  saidas:          number
  saldo_acumulado: number
}

interface ChartPoint {
  label:        string
  entrada:      number
  saida:        number
  saldo_real:   number | null
  saldo_prev:   number | null
  is_realizado: boolean
}

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function fmtMesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES_ABREV[parseInt(m) - 1]}/${y.slice(2)}`
}

function toChartPoints(rows: FluxoMensalRow[]): ChartPoint[] {
  return [...rows]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(r => ({
      label:        fmtMesLabel(r.mes),
      entrada:      r.entradas,
      saida:        r.saidas,
      saldo_real:   r.is_realizado ? r.saldo_acumulado : null,
      saldo_prev:   r.is_realizado ? null : r.saldo_acumulado,
      is_realizado: r.is_realizado,
    }))
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; fill: string }>
  label?: string
}

function FluxoTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-md p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-zinc-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.fill }}>
            {p.name === 'entrada' ? 'Entradas' : p.name === 'saida' ? 'Saídas' : p.name === 'saldo_real' || p.name === 'saldo_prev' ? 'Saldo acum.' : p.name}
          </span>
          <span className="font-medium text-zinc-700">{fmtMi(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

interface Props {
  rows: FluxoMensalRow[]
}

const COR_ENTRADA = '#0091B3'
const COR_SAIDA   = '#D9A23F'
const COR_SALDO   = '#6366f1'

export default function FluxoMensalChart({ rows }: Props) {
  const data = toChartPoints(rows)

  if (!data.length) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-zinc-400">
        Sem dados para o período selecionado
      </div>
    )
  }

  // Recharts doesn't support per-point fillOpacity on Bar natively without Cell.
  // We split into two datasets: realized and predicted, layered via stacking tricks.
  // Simpler approach: render two Bar pairs with Cell per point using a custom shape.
  // Even simpler: use a single Bar with cells and custom shape based on is_realizado.

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COR_ENTRADA }} />
          Entradas
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COR_SAIDA }} />
          Saídas
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="w-3 h-3 rounded-sm inline-block opacity-40" style={{ background: COR_ENTRADA }} />
          Previsto
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => fmtMi(v as number)} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={72} />
          <Tooltip content={<FluxoTooltip />} />
          <ReferenceLine y={0} stroke="#e4e4e7" />
          <Bar
            dataKey="entrada"
            name="entrada"
            fill={COR_ENTRADA}
            radius={[3, 3, 0, 0]}
            maxBarSize={36}
            shape={(props: unknown) => {
              const p = props as { x: number; y: number; width: number; height: number; is_realizado: boolean }
              return (
                <rect
                  x={p.x}
                  y={p.y}
                  width={p.width}
                  height={p.height}
                  fill={COR_ENTRADA}
                  fillOpacity={p.is_realizado ? 1 : 0.4}
                  rx={3}
                  ry={3}
                />
              )
            }}
          />
          <Bar
            dataKey="saida"
            name="saida"
            fill={COR_SAIDA}
            radius={[3, 3, 0, 0]}
            maxBarSize={36}
            shape={(props: unknown) => {
              const p = props as { x: number; y: number; width: number; height: number; is_realizado: boolean }
              return (
                <rect
                  x={p.x}
                  y={p.y}
                  width={p.width}
                  height={p.height}
                  fill={COR_SAIDA}
                  fillOpacity={p.is_realizado ? 1 : 0.4}
                  rx={3}
                  ry={3}
                />
              )
            }}
          />
          <Line
            dataKey="saldo_real"
            name="saldo_real"
            stroke={COR_SALDO}
            strokeWidth={2}
            dot={false}
            connectNulls={true}
            type="monotone"
          />
          <Line
            dataKey="saldo_prev"
            name="saldo_prev"
            stroke={COR_SALDO}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            connectNulls={true}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
