'use client'

import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, Cell, CartesianGrid, LabelList,
} from 'recharts'
import type { Historico12m } from '@/types/api'
import { fmtMi } from '@/lib/fmt'

const MESES_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

function fmtCurto(v: number): string {
  if (Math.abs(v) >= 1_000_000)
    return `${(v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`
  if (Math.abs(v) >= 1_000)
    return `${Math.round(v / 1_000)}k`
  return String(v)
}

interface Props {
  data:      Historico12m | null
  eParcial?: boolean
}

export default function Historico12mChart({ data, eParcial = false }: Props) {
  const meses = data?.meses ?? []
  const semDados = meses.every(m => m.faturamento === 0)

  const chartData = meses.map(m => ({
    label:       `${MESES_SHORT[m.mes - 1]}/${String(m.ano).slice(2)}`,
    faturamento:  m.faturamento,
    margem_pct:   m.margem_pct,
    eh_atual:     m.eh_atual,
    parcial:      m.eh_atual && eParcial,
  }))

  const Y_TICKS = [0, 2_500_000, 5_000_000, 7_500_000, 10_000_000]
  function fmtYTick(v: number): string {
    if (v === 0)          return '0'
    if (v === 5_000_000)  return '5M'
    if (v === 10_000_000) return '10M'
    return '–'
  }

  // Tick do eixo X — destaca o mês corrente
  const activeLabels = new Set(chartData.filter(d => d.eh_atual).map(d => d.label))
  function CustomXTick(props: Record<string, unknown>) {
    const x = props.x as number | undefined
    const y = props.y as number | undefined
    const payload = props.payload as { value: string } | undefined
    const isActive = activeLabels.has(payload?.value ?? '')
    return (
      <text
        x={x} y={(y ?? 0) + 10}
        textAnchor="middle"
        fontSize={10}
        fill={isActive ? 'var(--primary)' : '#a1a1aa'}
        fontWeight={isActive ? 600 : 400}
      >
        {payload?.value}
      </text>
    )
  }

  // Cor da label acima da barra
  function LabelColor({ value, index }: { value?: unknown; index?: number; x?: number; y?: number; width?: number }) {
    const entry = index != null ? chartData[index] : null
    const color = entry?.eh_atual ? 'var(--primary)' : 'rgba(37, 99, 235, 0.5)'
    const weight = entry?.eh_atual ? 600 : 400
    return (
      <text
        style={{ fontSize: 10, fill: color, fontWeight: weight }}
        textAnchor="middle"
      >
        {value != null ? fmtCurto(Number(value)) : ''}
      </text>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4 mb-6">
      <h2 className="text-sm font-semibold text-zinc-700 mb-3">
        Faturamento · últimos 12 meses
      </h2>
      {semDados ? (
        <div className="h-40 flex items-center justify-center text-xs text-zinc-400">
          Sem dados disponíveis
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={(props) => <CustomXTick {...props} />}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 10_000_000]}
              ticks={Y_TICKS}
              tickFormatter={fmtYTick}
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              formatter={(value, _name, props) => {
                const label = props.payload?.parcial
                  ? `${fmtMi(Number(value))} · em andamento`
                  : fmtMi(Number(value))
                return [label, 'Faturamento']
              }}
              labelStyle={{ fontSize: 11, color: '#3f3f46' }}
              contentStyle={{ fontSize: 11, borderRadius: 6 }}
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            />
            <Bar
              dataKey="faturamento"
              radius={[4, 4, 0, 0]}
              activeBar={{ opacity: 0.75 }}
            >
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.parcial  ? '#94a3b8'
                    : entry.eh_atual ? 'var(--primary)'
                    : 'rgba(37, 99, 235, 0.28)'
                  }
                />
              ))}
              <LabelList
                dataKey="faturamento"
                position="top"
                content={(props) => <LabelColor value={props.value} index={props.index} />}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
