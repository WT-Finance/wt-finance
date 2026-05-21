'use client'

import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { RitmoDiarioItem } from '@/types/api'
import CustomTooltip from '@/components/charts/custom-tooltip'

const SETOR_COLOR: Record<string, string> = {
  Lazer: '#378ADD', Corporativo: '#0F6E56', Weddings: '#BA7517', todos: '#6366f1',
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

export default function RitmoDiarioChart({
  data, loading, setor,
}: { data: RitmoDiarioItem[]; loading: boolean; setor: string }) {
  const color = SETOR_COLOR[setor] ?? '#6366f1'

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)]">
      <h2 className="text-sm font-semibold text-zinc-700 mb-4">Ritmo Diário</h2>
      {loading ? (
        <div className="h-64 animate-pulse bg-zinc-100 rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
            <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} />
            <YAxis
              tickFormatter={v => `${((v as number) / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} width={48}
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
              stroke="#d1d5db" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
