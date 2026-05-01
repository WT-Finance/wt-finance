'use client'

import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, Cell,
} from 'recharts'
import type { Historico12m } from '@/types/api'
import { fmtMi } from '@/lib/fmt'

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

interface Props {
  data: Historico12m | null
}

export default function Historico12mChart({ data }: Props) {
  const meses = data?.meses ?? []
  const semDados = meses.every(m => m.faturamento === 0)

  const chartData = meses.map(m => ({
    label:      `${MESES_SHORT[m.mes - 1]}/${String(m.ano).slice(2)}`,
    faturamento: m.faturamento,
    margem_pct:  m.margem_pct,
    eh_atual:    m.eh_atual,
  }))

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
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={fmtMi}
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              formatter={(value) => [fmtMi(Number(value)), 'Faturamento']}
              labelStyle={{ fontSize: 11, color: '#3f3f46' }}
              contentStyle={{ fontSize: 11, borderRadius: 6 }}
            />
            <Bar dataKey="faturamento" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.eh_atual ? '#18181b' : '#e4e4e7'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
