'use client'

import { LineChart, Line } from 'recharts'
import { fmtMi } from '@/lib/fmt'

interface Props {
  data:    number[]
  labels?: string[]
  /** Formato dos valores para o title nativo de hover. Padrão: brl */
  formato?: 'brl' | 'pct' | 'numero'
}

function fmtVal(v: number, fmt: Props['formato']): string {
  if (fmt === 'pct')    return `${v.toFixed(1)}%`
  if (fmt === 'numero') return v.toLocaleString('pt-BR')
  return fmtMi(v)
}

export default function Sparkline({ data, labels, formato = 'brl' }: Props) {
  const nonNull = data.filter(v => v != null && v > 0)
  if (nonNull.length < 2) return null

  const chartData = data.map((v, i) => ({ v: v > 0 ? v : null, i }))

  const title = labels
    ? data.map((v, i) => `${labels[i]}: ${fmtVal(v, formato)}`).join(' · ')
    : data.map(v => fmtVal(v, formato)).join(' · ')

  const first = nonNull[0]
  const last  = nonNull[nonNull.length - 1]
  const stroke = last > first ? '#10b981' : last < first ? '#f43f5e' : '#a1a1aa'

  return (
    <div style={{ width: 60, height: 24 }} title={title} className="shrink-0 overflow-hidden">
      <LineChart width={60} height={24} data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={stroke}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
      </LineChart>
    </div>
  )
}
