'use client'

import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { HistoricoMensalItem } from '@/types/api'
import { SETOR_COLORS } from '@/lib/config'
import CustomTooltip from '@/components/charts/custom-tooltip'

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

export default function HistoricoMensalChart({
  data, loading, setor,
}: { data: HistoricoMensalItem[]; loading: boolean; setor: string }) {
  const color = SETOR_COLORS[setor] ?? 'var(--chart-info)'

  const chartData = data.map(d => ({
    ...d,
    label: `${MESES_ABREV[d.mes - 1]}/${String(d.ano).slice(2)}`,
  }))

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4">
      <h2 className="text-sm font-semibold text-zinc-700 mb-4">Histórico Mensal</h2>
      {loading ? (
        <div className="h-64 animate-pulse bg-zinc-100 rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="label" tick={{ fontSize: 10, fill: 'var(--chart-axis-tick)' }} tickLine={false}
              interval={2}
            />
            <YAxis
              tickFormatter={v => `${((v as number) / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: 'var(--chart-axis-tick)' }} tickLine={false} axisLine={false} width={48}
            />
            <Tooltip
              content={(props) => (
                <CustomTooltip
                  {...props}
                  formatter={(value) => [fmtBRL(value as number), '']}
                />
              )}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={name => name === 'valor_total' ? 'Realizado' : 'Meta'}
            />
            <Bar dataKey="valor_total" name="valor_total" fill={color}              radius={[3,3,0,0]} />
            <Bar dataKey="valor_meta"  name="valor_meta"  fill="var(--chart-grid)" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
