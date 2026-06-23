'use client'

import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, Cell, LabelList,
} from 'recharts'
import { useRouter } from 'next/navigation'
import type { MixSetor } from '@/types/api'
import { fmtMi } from '@/lib/fmt'
import { SETOR_COLORS } from '@/lib/config'
import CustomTooltip from '@/components/charts/custom-tooltip'

interface Props {
  data: MixSetor | null
  loading: boolean
  preset?: string
}

export default function MixSetorChart({ data, loading, preset = 'mes-passado' }: Props) {
  const router = useRouter()

  const chartData = data?.setores.map(s => ({
    name:           s.display_nome,
    setor_macro:    s.setor_macro,
    faturamento:    s.faturamento,
    receita:        s.receita,
    pct:            s.pct_faturamento,
    cor:            SETOR_COLORS[s.setor_macro] ?? 'var(--chart-neutral)',
    margem:         s.margem_pct,
  })) ?? []

  function navSetor(setor_macro: string) {
    router.push(`/performance?setor=${setor_macro}&preset=${preset}`)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4">
      <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">Mix por Setor</h2>
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
              tick={{ fontSize: 10, fill: 'var(--chart-axis-tick)' }}
              tickLine={false} axisLine={false}
            />
            <YAxis
              type="category" dataKey="name"
              tick={{ fontSize: 12, fill: 'var(--chart-axis-tick)' }}
              tickLine={false} axisLine={false} width={80}
            />
            <Tooltip
              content={(props) => (
                <CustomTooltip
                  {...props}
                  formatter={(value, _name) => [
                    `${fmtMi(value as number)} (${(props.payload?.[0]?.payload as { pct?: number })?.pct?.toFixed(1) ?? ''}%)`,
                    'Faturamento',
                  ]}
                />
              )}
            />
            <Bar
              dataKey="faturamento" radius={[0, 4, 4, 0]} maxBarSize={28}
              cursor="pointer"
              onClick={(entry) => navSetor((entry as unknown as typeof chartData[0]).setor_macro)}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.cor} />
              ))}
              <LabelList
                dataKey="pct"
                position="right"
                formatter={(v: unknown) => `${(v as number).toFixed(1)}%`}
                style={{ fontSize: 11, fill: 'var(--chart-axis-tick)' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {!loading && data && (
        <div className="mt-3 pt-3 border-t border-zinc-100 grid grid-cols-3 gap-3">
          {data.setores.map(s => (
            <div
              key={s.setor_macro}
              className="text-center cursor-pointer rounded-lg p-1 hover:bg-zinc-50 transition-colors"
              onClick={() => navSetor(s.setor_macro)}
              title={`Ver performance — ${s.display_nome}`}
            >
              <p className="text-xs text-zinc-400">{s.display_nome}</p>
              <p className="text-sm font-semibold tabular-nums" style={{ color: SETOR_COLORS[s.setor_macro] ?? 'var(--chart-neutral)' }}>
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
