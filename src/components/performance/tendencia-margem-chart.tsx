'use client'

import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import type { TendenciaMargem } from '@/types/api'
import { fmtBRL } from '@/lib/fmt'
import { MARGEM_OK, MARGEM_ALERTA } from '@/lib/config'
import CustomTooltip from '@/components/charts/custom-tooltip'

interface Props {
  data: TendenciaMargem | null
  loading: boolean
  margemOk?: number
  margemAlerta?: number
}

export default function TendenciaMargemChart({ data, loading, margemOk = MARGEM_OK, margemAlerta = MARGEM_ALERTA }: Props) {
  const pontos = data?.pontos ?? []
  const semDados = pontos.every(p => p.faturamento === 0)

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-[--text-primary]">Tendência de Margem</h2>
        {data && (
          <span className="text-xs text-zinc-400 capitalize">{data.granularidade}</span>
        )}
      </div>

      {loading ? (
        <div className="h-56 animate-pulse bg-zinc-100 rounded-lg" />
      ) : !data || semDados ? (
        <div className="h-56 flex items-center justify-center text-sm text-zinc-400">
          Sem dados para o período selecionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={224}>
          <LineChart data={pontos} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={v => `${v}%`}
              tick={{ fontSize: 11, fill: '#71717a' }}
              tickLine={false}
              axisLine={false}
              width={40}
              domain={['auto', 'auto']}
            />
            <Tooltip
              content={(props) => (
                <CustomTooltip
                  {...props}
                  formatter={(value, name) => {
                    if (name === 'margem_pct') return [`${(value as number).toFixed(1)}%`, 'Margem']
                    if (name === 'faturamento') return [fmtBRL(value as number), 'Faturamento']
                    return [String(value), name]
                  }}
                  labelFormatter={label => `${label}`}
                />
              )}
            />
            <ReferenceLine y={margemOk}     stroke="#10b981" strokeDasharray="4 4" strokeWidth={1} />
            <ReferenceLine y={margemAlerta} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} />
            <Line
              type="monotone"
              dataKey="margem_pct"
              stroke="#6366f1"
              strokeWidth={2}
              dot={pontos.length <= 15}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
      <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t-2 border-dashed border-emerald-500" />
          ≥{margemOk}% (ok)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t-2 border-dashed border-amber-400" />
          ≥{margemAlerta}% (atenção)
        </span>
      </div>
    </div>
  )
}
