'use client'

import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { RitmoDiarioItem } from '@/types/api'
import { SETOR_COLORS } from '@/lib/config'
import CustomTooltip from '@/components/charts/custom-tooltip'

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

export default function RitmoDiarioChart({
  data, loading, setor,
}: { data: RitmoDiarioItem[]; loading: boolean; setor: string }) {
  const color = SETOR_COLORS[setor] ?? 'var(--chart-info)'

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4">
      <h2 className="text-sm font-semibold text-zinc-700 mb-4">Ritmo Diário</h2>
      {loading ? (
        <div className="h-64 animate-pulse bg-zinc-100 rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'var(--chart-axis-tick)' }} tickLine={false} />
            <YAxis
              tickFormatter={v => `${((v as number) / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: 'var(--chart-axis-tick)' }} tickLine={false} axisLine={false} width={48}
            />
            <Tooltip
              content={(props) => (
                <CustomTooltip
                  {...props}
                  formatter={(value) => [fmtBRL(value as number), '']}
                  labelFormatter={label => `Dia ${label}`}
                />
              )}
            />
            <Legend
              iconType="line" wrapperStyle={{ fontSize: 12 }}
              formatter={name => name === 'valor_acumulado' ? 'Realizado' : 'Meta'}
            />
            <Line type="monotone" dataKey="valor_acumulado" name="valor_acumulado"
              stroke={color} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="meta_acumulada" name="meta_acumulada"
              stroke="var(--chart-neutral)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
