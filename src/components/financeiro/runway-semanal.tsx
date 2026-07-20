'use client'

import {
  ResponsiveContainer, ComposedChart, Line, Tooltip,
} from 'recharts'
import {
  ChartGrid, ChartZeroLine, ChartXAxisCategoria, ChartYAxisBRL,
  CustomTooltip, ChartLegend, fluxoColors,
} from '@/components/charts'
import { fmtBRL } from '@/lib/fmt'
import type { RunwaySemanal as RunwaySemanalData } from '@/lib/fluxo/rpc-fluxo'

// Runway Semanal (v5.2.0/Onda 1) — 13 semanas de recebimentos/pagamentos previstos
// (lançamentos de Contas a Pagar/a Receber) + saldo projetado acumulado a partir do
// saldo operacional atual. "Runway" = quantas semanas até o saldo projetado ficar
// negativo (se ocorrer dentro da janela); sem cruzamento, o caixa está confortável
// nas 13 semanas projetadas.

interface Props {
  data: RunwaySemanalData
}

interface DotProps {
  cx?:    number
  cy?:    number
  value?: number
}

function AccDot({ cx, cy, value }: DotProps) {
  if (cx === undefined || cy === undefined || value === undefined) return null
  const fill = value >= 0 ? fluxoColors.resultado : fluxoColors.resultadoNegativo
  return <circle cx={cx} cy={cy} r={3.5} fill={fill} stroke="none" />
}

export default function RunwaySemanal({ data }: Props) {
  const semanas = data.semanas

  if (!semanas.length) {
    return (
      <div className="rounded-xl shadow-sm bg-white p-5 flex-1 flex flex-col">
        <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Runway Semanal</h3>
        <div className="flex-1 flex items-center justify-center text-sm text-zinc-400">Sem dados</div>
      </div>
    )
  }

  // `ini` já vem formatado 'DD/MM' do banco (to_char). O gráfico mostra só a LINHA do
  // saldo projetado acumulado (`acc`) — recebimentos/pagamentos previstos alimentam o
  // acumulado no banco, mas não são plotados como barras (decisão do checkpoint).
  const chartData = semanas.map(s => ({
    label: s.ini,
    acc:   s.acc,
  }))

  // Runway = 1ª semana em que o saldo projetado acumulado fica negativo.
  const idxNegativo = semanas.findIndex(s => s.acc < 0)
  const seguro       = idxNegativo === -1
  const runwayLabel  = seguro
    ? `Saldo projetado permanece positivo nas ${semanas.length} semanas`
    : `Saldo projetado fica negativo em ${idxNegativo + 1} semana${idxNegativo === 0 ? '' : 's'}`

  return (
    <div className="rounded-xl shadow-sm bg-white p-5 flex-1 flex flex-col">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Runway Semanal</h3>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          {ChartGrid()}
          {ChartXAxisCategoria('label', { interval: 0, angle: -45, fontSize: 10, height: 36 })}
          {ChartYAxisBRL()}
          {ChartZeroLine()}
          <Tooltip
            content={(props) => (
              <CustomTooltip
                {...props}
                formatter={(value: number) => [fmtBRL(value), 'Saldo projetado']}
              />
            )}
          />
          <Line
            dataKey="acc"
            name="acc"
            stroke={fluxoColors.resultado}
            strokeWidth={2}
            dot={(props: DotProps) => <AccDot key={`d-${props.cx}-${props.cy}`} {...props} />}
            activeDot={{ r: 5 }}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>

      <ChartLegend
        items={[
          { label: 'Saldo projetado', color: fluxoColors.resultado, type: 'line' },
        ]}
      />

      <p
        className="text-2xs mt-3 rounded-md px-2.5 py-1.5 font-medium"
        style={{
          background: seguro ? 'var(--positive-soft)' : 'var(--negative-soft)',
          color:      seguro ? 'var(--positive-deep)' : 'var(--negative-deep)',
        }}
      >
        {runwayLabel}
      </p>
    </div>
  )
}
