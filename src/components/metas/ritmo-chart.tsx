'use client'

import { useState } from 'react'
import {
  LineChart, Line, XAxis, ResponsiveContainer, ReferenceLine, ReferenceDot, Tooltip,
} from 'recharts'
import { Card } from '@/components/ui/card'
import Tabs from '@/components/ui/tabs'
import {
  ChartGrid, ChartYAxisBRL, ChartLegend, CustomTooltip,
  dashArrays, strokeWidths, chartMargins, chartColors, chartSeries, tickFontSize,
} from '@/components/charts'
import { fmtMi } from '@/lib/fmt'
import { corRitmo } from '@/components/metas/meta-card'
import type { PainelSetor } from '@/components/metas/tipos'

// Gráfico "Ritmo do período" — linha do realizado acumulado (sólida, cor do painel)
// contra a meta acumulada pró-rata (tracejada, neutra), com marcador de "hoje" e do
// "esperado até hoje". Um painel por vez (mini-pills), Group como default (v5.0.0).

/** 'yyyy-MM-dd' → 'dd/MM' (tick de eixo/tooltip; data pura, sem fuso). */
function fmtDiaMes(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

interface Props {
  setores: PainelSetor[]
}

export default function RitmoChart({ setores }: Props) {
  const [selecionado, setSelecionado] = useState<string>(setores[0]?.key ?? '')
  const painel = setores.find(s => s.key === selecionado) ?? setores[0]

  if (!painel) return null

  const pctLabel = painel.ritmo.ritmoPct == null ? '—' : `${Math.round(painel.ritmo.ritmoPct)}%`

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Ritmo do período</h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            % do esperado: <span className={corRitmo(painel.ritmo.ritmoPct)}>{pctLabel}</span>
          </p>
        </div>

        <Tabs
          items={setores.map(s => ({ id: s.key, label: s.display }))}
          ativo={painel.key}
          onChange={setSelecionado}
          ariaLabel="Selecionar painel do gráfico de ritmo"
        />
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={painel.ritmo.pontos} margin={chartMargins.default}>
            {ChartGrid()}
            <XAxis
              dataKey="data"
              tickFormatter={fmtDiaMes}
              tick={{ fontSize: tickFontSize.x, fill: chartColors.axisTick }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            {ChartYAxisBRL()}

            <ReferenceLine
              x={painel.ritmo.hoje}
              stroke={chartSeries.neutral}
              strokeDasharray="4 3"
              label={{ value: 'Hoje', position: 'insideTopLeft', fontSize: 10, fill: chartColors.axisTick }}
            />
            <ReferenceDot
              x={painel.ritmo.hoje}
              y={painel.ritmo.esperadoAteHoje}
              r={4}
              fill={chartColors.axisTick}
            />

            <Line
              type="monotone"
              dataKey="realAcum"
              name="Realizado"
              stroke={painel.cor}
              strokeWidth={strokeWidths.line}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="metaAcum"
              name="Meta"
              stroke={chartColors.axisTick}
              strokeDasharray={dashArrays.reference}
              strokeWidth={strokeWidths.lineDashed}
              dot={false}
            />

            <Tooltip
              content={
                <CustomTooltip
                  labelFormatter={(label: string) => fmtDiaMes(label)}
                  formatter={(value: number, name: string) => [fmtMi(value), name]}
                />
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ChartLegend
        items={[
          { label: 'Realizado', color: painel.cor,           type: 'line' },
          { label: 'Meta',      color: chartColors.axisTick, type: 'line', dashed: true },
        ]}
      />
    </Card>
  )
}
