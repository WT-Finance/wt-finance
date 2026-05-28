'use client'

import { useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine,
} from 'recharts'
import type { AcumuladoWeddings } from '@/types/api'
import { fmtBRL, fmtMi } from '@/lib/fmt'
import CustomTooltip from '@/components/charts/custom-tooltip'

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
function fmtMesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES_ABREV[parseInt(m) - 1]}/${y.slice(2)}`
}

const COR_ENTRADA   = '#0091B3'  // Pantone 632 — alinhado com Welcome Trips
const COR_SAIDA     = '#D9A23F'  // token --warning
const COR_RESULTADO = '#2D2A26'  // token --text-primary

function LegendItem({ color, opacity, label }: { color: string; opacity: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-[--text-subtle]">
      <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: color, opacity }} />
      {label}
    </div>
  )
}

interface Props {
  data: AcumuladoWeddings | null
  operacaoLabel?: string
}

export default function FluxoCaixaMensal({ data, operacaoLabel }: Props) {
  const [invertida, setInvertida] = useState(false)

  if (!data?.meses.length) return null

  const monthly = data.meses.map((m, i) => {
    const prev    = i > 0 ? data.meses[i - 1] : { entrada_acum: 0, saida_acum: 0 }
    const entrada = m.entrada_acum - prev.entrada_acum
    const saida   = m.saida_acum   - prev.saida_acum
    return {
      mes:        m.mes,
      eh_futuro:  m.eh_futuro,
      entrada,
      saida_val:  invertida ? saida : -saida,
      resultado:  entrada - saida,
    }
  })

  const saidaRadius: [number, number, number, number] = invertida ? [2, 2, 0, 0] : [0, 0, 2, 2]

  return (
    <div className="bg-white rounded-xl border border-[--border] px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-[--text-primary]">
            Fluxo de Caixa Mensal{operacaoLabel ? ` — ${operacaoLabel}` : ''}
          </h2>
          <span className="text-[13px] text-[--text-muted]">24 meses passados + 18 futuros</span>
        </div>
        <button
          onClick={() => setInvertida(v => !v)}
          className="text-xs text-zinc-500 border border-zinc-200 rounded px-2.5 py-1 hover:bg-zinc-50 active:bg-zinc-100 transition-colors shrink-0"
        >
          ⇅ Inverter saídas
        </button>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={monthly}
          margin={{ top: 8, right: 80, left: 0, bottom: 0 }}
          barCategoryGap="25%"
          barGap={0}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={fmtMesLabel}
            tick={{ fontSize: 10, fill: '#71717a' }}
            tickLine={false}
            interval={2}
          />
          <YAxis
            tickFormatter={v => fmtMi(Math.abs(v as number))}
            tick={{ fontSize: 11, fill: '#71717a' }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <ReferenceLine y={0} stroke="var(--border-strong)" strokeWidth={1.5} />
          <Tooltip
            content={(props) => (
              <CustomTooltip
                {...props}
                formatter={(value, name) => {
                  const v = value as number
                  if (name === 'entrada')  return [fmtBRL(v),        'Entrada']
                  if (name === 'saida_val') return [fmtBRL(Math.abs(v)), 'Saída']
                  return [fmtBRL(v), 'Resultado']
                }}
                labelFormatter={label => fmtMesLabel(label as string)}
              />
            )}
          />
          <Bar
            dataKey="entrada"
            name="entrada"
            radius={[2, 2, 0, 0]}
            maxBarSize={14}
            animationDuration={400}
            animationEasing="ease-in-out"
          >
            {monthly.map((entry, i) => (
              <Cell key={i} fill={COR_ENTRADA} fillOpacity={entry.eh_futuro ? 0.35 : 1} />
            ))}
          </Bar>
          <Bar
            dataKey="saida_val"
            name="saida_val"
            radius={saidaRadius}
            maxBarSize={14}
            animationDuration={400}
            animationEasing="ease-in-out"
          >
            {monthly.map((entry, i) => (
              <Cell key={i} fill={COR_SAIDA} fillOpacity={entry.eh_futuro ? 0.35 : 1} />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="resultado"
            name="resultado"
            stroke={COR_RESULTADO}
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props) => {
              const { cx, cy, payload } = props as { cx: number; cy: number; payload: { resultado: number } }
              if (payload.resultado < 0) {
                return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill="#B85C5C" stroke="none" />
              }
              return <g key={`dot-${cx}-${cy}`} />
            }}
            activeDot={{ r: 3, fill: COR_RESULTADO }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 ml-18">
        <LegendItem color="#0091B3"  opacity={1}    label="Entrada (efetivada)" />
        <LegendItem color="#0091B3"  opacity={0.35} label="Entrada (prevista)"  />
        <LegendItem color="#D9A23F"  opacity={1}    label="Saída (efetivada)"   />
        <LegendItem color="#D9A23F"  opacity={0.35} label="Saída (prevista)"    />
        <div className="flex items-center gap-1.5 text-xs text-[--text-subtle]">
          <svg width="20" height="10">
            <line x1="0" y1="5" x2="20" y2="5" stroke={COR_RESULTADO} strokeWidth="2" />
          </svg>
          Resultado mensal
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[--text-subtle]">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#B85C5C' }} />
          Resultado negativo
        </div>
      </div>
    </div>
  )
}
