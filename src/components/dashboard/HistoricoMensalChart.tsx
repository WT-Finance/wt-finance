'use client'

import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { HistoricoMensalItem } from '@/types/api'

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const SETOR_COLOR: Record<string, string> = {
  Lazer: '#378ADD', Corporativo: '#0F6E56', Weddings: '#BA7517', todos: '#6366f1',
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

export default function HistoricoMensalChart({
  data, loading, setor,
}: { data: HistoricoMensalItem[]; loading: boolean; setor: string }) {
  const color = SETOR_COLOR[setor] ?? '#6366f1'

  const chartData = data.map(d => ({
    ...d,
    label: `${MESES_ABREV[d.mes - 1]}/${String(d.ano).slice(2)}`,
  }))

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)]">
      <h2 className="text-sm font-semibold text-zinc-700 mb-4">Histórico Mensal</h2>
      {loading ? (
        <div className="h-64 animate-pulse bg-zinc-100 rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
            <XAxis
              dataKey="label" tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false}
              interval={2}
            />
            <YAxis
              tickFormatter={v => `${((v as number) / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} width={48}
            />
            <Tooltip formatter={(value) => [fmtBRL(value as number)]} />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={name => name === 'valor_total' ? 'Realizado' : 'Meta'}
            />
            <Bar dataKey="valor_total" name="valor_total" fill={color}   radius={[3,3,0,0]} />
            <Bar dataKey="valor_meta"  name="valor_meta"  fill="#e4e4e7" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
