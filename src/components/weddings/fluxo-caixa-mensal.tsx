'use client'

import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine,
} from 'recharts'
import type { AcumuladoWeddings } from '@/types/api'
import { fmtBRL, fmtMi } from '@/lib/fmt'

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
function fmtMesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES_ABREV[parseInt(m) - 1]}/${y.slice(2)}`
}

const COR_ENTRADA   = '#5B8DB8'
const COR_SAIDA     = '#BD965C'
const COR_RESULTADO = '#4B4F54'

function LegendItem({ color, opacity, label }: { color: string; opacity: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-[--text-subtle]">
      <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: color, opacity }} />
      {label}
    </div>
  )
}

interface Props { data: AcumuladoWeddings | null }

export default function FluxoCaixaMensal({ data }: Props) {
  if (!data?.meses.length) return null

  const monthly = data.meses.map((m, i) => {
    const prev    = i > 0 ? data.meses[i - 1] : { entrada_acum: 0, saida_acum: 0 }
    const entrada = m.entrada_acum - prev.entrada_acum
    const saida   = m.saida_acum   - prev.saida_acum
    return {
      mes:       m.mes,
      eh_futuro: m.eh_futuro,
      entrada,
      saida_neg: -saida,
      resultado: entrada - saida,
    }
  })

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)]">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-base font-semibold text-[--text-primary]">Fluxo de Caixa Mensal</h2>
        <span className="text-[13px] text-[--text-muted]">24 meses passados + 18 futuros</span>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={monthly}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
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
            formatter={(value, name) => {
              const v = value as number
              if (name === 'entrada')   return [fmtBRL(v),  'Entrada']
              if (name === 'saida_neg') return [fmtBRL(-v), 'Saída']
              return [fmtBRL(v), 'Resultado']
            }}
            labelFormatter={label => fmtMesLabel(label as string)}
          />
          <Bar dataKey="entrada" name="entrada" radius={[2, 2, 0, 0]} maxBarSize={14}>
            {monthly.map((entry, i) => (
              <Cell key={i} fill={COR_ENTRADA} fillOpacity={entry.eh_futuro ? 0.35 : 1} />
            ))}
          </Bar>
          <Bar dataKey="saida_neg" name="saida_neg" radius={[0, 0, 2, 2]} maxBarSize={14}>
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
            dot={false}
            activeDot={{ r: 3, fill: COR_RESULTADO }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 ml-18">
        <LegendItem color={COR_ENTRADA}  opacity={1}    label="Entrada (efetivada)" />
        <LegendItem color={COR_ENTRADA}  opacity={0.35} label="Entrada (prevista)"  />
        <LegendItem color={COR_SAIDA}    opacity={1}    label="Saída (efetivada)"   />
        <LegendItem color={COR_SAIDA}    opacity={0.35} label="Saída (prevista)"    />
        <div className="flex items-center gap-1.5 text-xs text-[--text-subtle]">
          <svg width="20" height="10">
            <line x1="0" y1="5" x2="20" y2="5" stroke={COR_RESULTADO} strokeWidth="2" />
          </svg>
          Resultado mensal
        </div>
      </div>
    </div>
  )
}
