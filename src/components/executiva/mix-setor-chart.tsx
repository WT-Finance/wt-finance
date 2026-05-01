'use client'

import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, Cell, LabelList,
} from 'recharts'
import type { MixSetor } from '@/types/api'
import { fmtMi } from '@/lib/fmt'

interface Props {
  data: MixSetor | null
  loading: boolean
}

export default function MixSetorChart({ data, loading }: Props) {
  const chartData = data?.setores.map(s => ({
    name:           s.display_nome,
    faturamento:    s.faturamento,
    receita:        s.receita,
    pct:            s.pct_faturamento,
    cor:            s.cor_hex,
    margem:         s.margem_pct,
  })) ?? []

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <h2 className="text-sm font-semibold text-zinc-700 mb-4">Mix por Setor</h2>
      {loading ? (
        <div className="h-48 animate-pulse bg-zinc-100 rounded-lg" />
      ) : !data || chartData.every(d => d.faturamento === 0) ? (
        <div className="h-48 flex items-center justify-center text-sm text-zinc-400">
          Sem dados para o período selecionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 0, right: 64, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              tickFormatter={v => `${((v as number) / 1_000_000).toFixed(1)}Mi`}
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              tickLine={false} axisLine={false}
            />
            <YAxis
              type="category" dataKey="name"
              tick={{ fontSize: 12, fill: '#52525b' }}
              tickLine={false} axisLine={false} width={80}
            />
            <Tooltip
              formatter={(value, _name, props) => [
                `${fmtMi(value as number)} (${props.payload.pct?.toFixed(1)}%)`,
                'Faturamento',
              ]}
            />
            <Bar dataKey="faturamento" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.cor} />
              ))}
              <LabelList
                dataKey="pct"
                position="right"
                formatter={(v: unknown) => `${(v as number).toFixed(1)}%`}
                style={{ fontSize: 11, fill: '#71717a' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {!loading && data && (
        <div className="mt-3 pt-3 border-t border-zinc-100 grid grid-cols-3 gap-3">
          {data.setores.map(s => (
            <div key={s.setor_macro} className="text-center">
              <p className="text-xs text-zinc-400">{s.display_nome}</p>
              <p className="text-sm font-semibold tabular-nums" style={{ color: s.cor_hex }}>
                {s.margem_pct != null ? `${s.margem_pct.toFixed(1)}%` : '—'}
              </p>
              <p className="text-xs text-zinc-400">margem</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
