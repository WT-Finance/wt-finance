'use client'

import { useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, CartesianGrid, Tooltip, Cell, ReferenceLine,
} from 'recharts'
import type { AcumuladoWeddings } from '@/types/api'
import { fmtBRL } from '@/lib/fmt'
import CustomTooltip from '@/components/charts/custom-tooltip'
import { ChartYAxisBRL, fluxoColors } from '@/components/charts'

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
function fmtMesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES_ABREV[parseInt(m) - 1]}/${y.slice(2)}`
}

// v4.10 (ADR-0103): paleta canônica de fluxo de caixa via fluxoColors —
// entrada=--positive (verde), saída=--negative (terracota), resultado=--text-primary.
const COR_ENTRADA   = fluxoColors.entrada
const COR_SAIDA     = fluxoColors.saida
const COR_RESULTADO = fluxoColors.resultado

function LegendItem({ color, opacity, label }: { color: string; opacity: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-[--text-subtle]">
      <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: color, opacity }} />
      {label}
    </div>
  )
}

// KPI pequeno e discreto (label uppercase + valor em tabular-nums) usado no canto
// superior direito do card para os totais NÃO liquidados.
function KpiNaoLiquidado({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[10px] uppercase tracking-wide text-[--text-muted]">{label}</span>
      <span className="text-sm font-semibold tabular-nums" style={{ color: cor }}>
        {fmtBRL(valor)}
      </span>
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
    <div className="bg-white rounded-xl shadow-sm px-5 py-4">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-[--text-primary]">
            Fluxo de Caixa Mensal{operacaoLabel ? ` — ${operacaoLabel}` : ''}
          </h2>
          <span className="text-[13px] text-[--text-muted]">24 meses passados + 18 futuros</span>
        </div>
        <div className="flex items-start gap-5 shrink-0">
          {(data.total_a_receber != null || data.total_a_pagar != null) && (
            <div className="flex items-start gap-5">
              {data.total_a_receber != null && (
                <KpiNaoLiquidado label="A receber" valor={data.total_a_receber} cor={COR_ENTRADA} />
              )}
              {data.total_a_pagar != null && (
                <KpiNaoLiquidado label="A pagar" valor={data.total_a_pagar} cor={COR_SAIDA} />
              )}
            </div>
          )}
          <button
            onClick={() => setInvertida(v => !v)}
            className="text-xs text-zinc-500 border border-zinc-200 rounded px-2.5 py-1 hover:bg-zinc-50 active:bg-zinc-100 transition-colors shrink-0"
          >
            ⇅ Inverter saídas
          </button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={monthly}
          margin={{ top: 8, right: 80, left: 0, bottom: 0 }}
          barCategoryGap="25%"
          barGap={0}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={fmtMesLabel}
            tick={{ fontSize: 10, fill: 'var(--chart-axis-tick)' }}
            tickLine={false}
            interval={2}
          />
          {ChartYAxisBRL({ width: 80, abs: true })}
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
            animationDuration={400}
            animationEasing="ease-in-out"
            dot={(props) => {
              const { cx, cy, payload } = props as { cx: number; cy: number; payload: { resultado: number } }
              if (payload.resultado < 0) {
                return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={fluxoColors.resultadoNegativo} stroke="none" />
              }
              return <g key={`dot-${cx}-${cy}`} />
            }}
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
        <div className="flex items-center gap-1.5 text-xs text-[--text-subtle]">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: fluxoColors.resultadoNegativo }} />
          Resultado negativo
        </div>
      </div>
    </div>
  )
}
