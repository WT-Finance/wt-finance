'use client'

import {
  ResponsiveContainer, ComposedChart, Bar, Cell, Line,
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

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipProps {
  active?:  boolean
  payload?: Array<{ name: string; value: number }>
  label?:   string
}

function AcumuladoTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-md p-3 text-xs min-w-[200px]">
      <p className="font-semibold text-zinc-700 mb-2">{fmtMesLabel(label ?? '')}</p>
      {payload.map(p => (
        <div key={p.name} className="flex justify-between gap-4 mb-1">
          <span className="text-zinc-500">
            {p.name === 'entrada_acum'   ? 'Entradas acum.'    :
             p.name === 'saida_acum'     ? 'Saídas acum.'      :
                                           'Resultado acum.'}
          </span>
          <span className="font-medium text-zinc-700">{fmtMi(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function LegendItem({ color, opacity, label }: { color: string; opacity: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color, opacity }} />
      {label}
    </div>
  )
}

function AcumuladoLegend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
      <LegendItem color="var(--positive)" opacity={1}    label="Entradas acum. (efetivado)" />
      <LegendItem color="var(--positive)" opacity={0.35} label="Entradas acum. (projetado)"  />
      <LegendItem color="var(--negative)" opacity={1}    label="Saídas acum. (efetivado)"    />
      <LegendItem color="var(--negative)" opacity={0.35} label="Saídas acum. (projetado)"    />
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        <svg width="20" height="10">
          <line x1="0" y1="5" x2="20" y2="5" stroke="var(--text-primary)" strokeWidth="2" />
        </svg>
        Resultado acumulado
      </div>
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        <svg width="20" height="10">
          <line x1="0" y1="5" x2="20" y2="5" stroke="#B85C5C" strokeWidth="1.5" />
        </svg>
        Total previsto de saídas
      </div>
    </div>
  )
}

// ── Data transform ────────────────────────────────────────────────────────────

interface ChartPoint {
  mes:            string
  entrada_acum:   number
  saida_acum:     number
  resultado_acum: number
  eh_futuro:      boolean
}

function toChartPoints(rows: FluxoAcumuladoRow[]): ChartPoint[] {
  const today = new Date()
  const currentMes = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const sorted = [...rows].sort((a, b) => a.mes.localeCompare(b.mes))

  // Carry the last realized cumulative so future bars continue the curve
  let lastEntrada = 0
  let lastSaida   = 0
  for (const r of sorted) {
    if (r.mes <= currentMes) {
      lastEntrada = r.acum_entrada_efetivada
      lastSaida   = r.acum_saida_efetivada
    }
  }

  return sorted.map(r => {
    const eh_futuro = r.mes > currentMes
    const entrada = eh_futuro ? lastEntrada + r.acum_entrada_prevista : r.acum_entrada_efetivada
    const saida   = eh_futuro ? lastSaida   + r.acum_saida_prevista   : r.acum_saida_efetivada
    return {
      mes:            r.mes,
      entrada_acum:   entrada,
      saida_acum:     saida,
      resultado_acum: entrada - saida,
      eh_futuro,
    }
  })
}

// ── Main component ────────────────────────────────────────────────────────────

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

  const firstFutureMes    = data.find(d => d.eh_futuro)?.mes ?? null
  const totalSaidasPrevisto = data.length ? data[data.length - 1].saida_acum : 0

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={fmtMesLabel}
            tick={{ fontSize: 10, fill: '#71717a' }}
            tickLine={false}
            axisLine={false}
            interval={2}
          />
          <YAxis
            tickFormatter={v => fmtMi(v as number)}
            tick={{ fontSize: 11, fill: '#71717a' }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<AcumuladoTooltip />} />

          {totalSaidasPrevisto > 0 && (
            <ReferenceLine
              y={totalSaidasPrevisto}
              stroke="#B85C5C"
              strokeWidth={1.5}
              label={{
                value: `Total previsto de saídas: ${fmtMi(totalSaidasPrevisto)}`,
                position: 'insideTopRight',
                fontSize: 10,
                fill: '#B85C5C',
              }}
            />
          )}

          {firstFutureMes && (
            <ReferenceLine
              x={firstFutureMes}
              stroke="#a1a1aa"
              strokeDasharray="4 3"
              label={{ value: 'Hoje', position: 'insideTopLeft', fontSize: 10, fill: '#71717a' }}
            />
          )}

          <Bar dataKey="entrada_acum" name="entrada_acum" radius={[2, 2, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill="var(--positive)" fillOpacity={entry.eh_futuro ? 0.35 : 1} />
            ))}
          </Bar>
          <Bar dataKey="saida_acum" name="saida_acum" radius={[2, 2, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill="var(--negative)" fillOpacity={entry.eh_futuro ? 0.35 : 1} />
            ))}
          </Bar>
          <Line
            dataKey="resultado_acum"
            name="resultado_acum"
            stroke="var(--text-primary)"
            strokeWidth={2}
            dot={false}
            type="monotone"
            animationDuration={400}
            animationEasing="ease-in-out"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <AcumuladoLegend />
    </div>
  )
}
