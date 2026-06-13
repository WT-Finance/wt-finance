'use client'

import {
  ResponsiveContainer, ComposedChart, Bar, Cell,
  XAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import { fmtBRL, fmtMi } from '@/lib/fmt'
import type { AcumuladoWeddings } from '@/types/api'
import CustomTooltip from '@/components/charts/custom-tooltip'
import { ChartYAxisBRL, fluxoColors } from '@/components/charts'

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function fmtMesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES_ABREV[parseInt(m) - 1]}/${y.slice(2)}`
}

interface Props {
  data: AcumuladoWeddings | null
  operacaoLabel?: string
}

export default function AcumuladoRecebPagChart({ data, operacaoLabel }: Props) {
  if (!data || !data.meses.length) {
    return (
      <div className="bg-white rounded-xl shadow-sm px-5 py-4">
        <p className="text-sm text-zinc-400 text-center py-8">
          {data ? 'Sem lançamentos no período.' : 'Dados não disponíveis.'}
        </p>
      </div>
    )
  }

  const mesHoje = data.meses.find(m => m.eh_futuro)?.mes ?? null

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Acumulado de Recebimentos e Pagamentos{operacaoLabel ? ` — ${operacaoLabel}` : ''}
          </h2>
        <span className="text-[13px] text-[var(--text-muted)]">24 meses passados + 18 futuros</span>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data.meses} margin={{ top: 8, right: 80, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={fmtMesLabel}
            tick={{ fontSize: 10, fill: 'var(--chart-axis-tick)' }}
            tickLine={false}
            interval={2}
          />
          {ChartYAxisBRL({ width: 80, abs: false })}
          <Tooltip
            content={(props) => (
              <CustomTooltip
                {...props}
                formatter={(value, name) => [
                  fmtBRL(value as number),
                  name === 'entrada_acum' ? 'Entrada acum.' : 'Saída acum.',
                ]}
                labelFormatter={label => fmtMesLabel(label as string)}
              />
            )}
          />
          <ReferenceLine
            y={data.total_saidas}
            stroke={fluxoColors.resultadoNegativo}
            strokeWidth={1.5}
            label={{ value: `Total previsto de saídas: ${fmtMi(data.total_saidas)}`, position: 'insideTopRight', fontSize: 10, fill: fluxoColors.resultadoNegativo }}
          />
          {mesHoje && (
            <ReferenceLine
              x={mesHoje}
              stroke="var(--chart-neutral)"
              strokeDasharray="4 3"
              label={{ value: 'Hoje', position: 'insideTopLeft', fontSize: 10, fill: 'var(--chart-axis-tick)' }}
            />
          )}
          <Bar dataKey="entrada_acum" name="entrada_acum" radius={[2,2,0,0]}>
            {data.meses.map((entry, i) => (
              <Cell key={i} fill={'var(--chart-fluxo-entrada)'} fillOpacity={entry.eh_futuro ? 0.35 : 1} />
            ))}
          </Bar>
          <Bar dataKey="saida_acum" name="saida_acum" radius={[2,2,0,0]}>
            {data.meses.map((entry, i) => (
              <Cell key={i} fill={'var(--chart-fluxo-saida)'} fillOpacity={entry.eh_futuro ? 0.35 : 1} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legenda manual — mais simples e controlável que o <Legend> do Recharts */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 ml-18">
        <LegendItem color={'var(--chart-fluxo-entrada)'} opacity={1}    label="Entradas acum. (efetivado)" />
        <LegendItem color={'var(--chart-fluxo-entrada)'} opacity={0.35} label="Entradas acum. (projetado)" />
        <LegendItem color={'var(--chart-fluxo-saida)'}   opacity={1}    label="Saídas acum. (efetivado)"   />
        <LegendItem color={'var(--chart-fluxo-saida)'}   opacity={0.35} label="Saídas acum. (projetado)"   />
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-subtle)]">
          <svg width="20" height="10">
            <line x1="0" y1="5" x2="20" y2="5" stroke={fluxoColors.resultadoNegativo} strokeWidth="1.5" />
          </svg>
          Total previsto de saídas
        </div>
      </div>
    </div>
  )
}

function LegendItem({ color, opacity, label }: { color: string; opacity: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
      <span
        className="inline-block w-3 h-3 rounded-sm"
        style={{ background: color, opacity }}
      />
      {label}
    </div>
  )
}
