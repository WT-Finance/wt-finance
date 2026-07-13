'use client'

import { useState } from 'react'
import {
  ComposedChart, Area, Line, XAxis, ResponsiveContainer, ReferenceLine, ReferenceDot, Tooltip,
} from 'recharts'
import { Card } from '@/components/ui/card'
import Tabs from '@/components/ui/tabs'
import {
  ChartGrid, ChartYAxisBRL, ChartLegend, CustomTooltip,
  dashArrays, strokeWidths, chartMargins, chartColors, chartSeries, tickFontSize,
} from '@/components/charts'
import { fmtMi } from '@/lib/fmt'
import type { PainelSetor } from '@/components/metas/tipos'

// Gráfico "Ritmo do período" — realizado acumulado (área+linha sólida, cor do
// painel) contra a meta acumulada pró-rata (tracejada, neutra), com marcador de
// "hoje" e anel do "esperado até hoje". Um painel por vez (pills), Group default.

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

  // ~9 rótulos no eixo X, independente do tamanho do período
  const tickIntervalo = Math.max(0, Math.ceil(painel.ritmo.pontos.length / 9) - 1)

  return (
    <Card className="px-5 py-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug text-[var(--text-primary)]">Ritmo do período</h3>

        <Tabs
          items={setores.map(s => ({ id: s.key, label: s.display }))}
          ativo={painel.key}
          onChange={setSelecionado}
          corAtiva={painel.cor}
          ariaLabel="Selecionar painel do gráfico de ritmo"
        />
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={painel.ritmo.pontos} margin={chartMargins.default}>
            {ChartGrid()}
            <XAxis
              dataKey="data"
              tickFormatter={fmtDiaMes}
              tick={{ fontSize: tickFontSize.x, fill: chartColors.axisTick }}
              tickLine={false}
              axisLine={false}
              interval={tickIntervalo}
              tickMargin={8}
            />
            {ChartYAxisBRL()}

            {/* Realizado acumulado = UMA série só (área sombreada + linha sólida) → o tooltip
                mostra só "Realizado" (antes o par Area+Line duplicava numa entrada "realAcum"). */}
            <Area
              type="monotone"
              dataKey="realAcum"
              name="Realizado"
              stroke={painel.cor}
              strokeWidth={strokeWidths.line}
              fill={painel.cor}
              fillOpacity={0.07}
              dot={false}
              connectNulls={false}
            />

            {/* "Hoje"/esperado só quando a data cai no domínio do gráfico (pontos vão de
                from a to). Período à frente da última venda (hoje < from) → não renderiza,
                evitando marcador fora do eixo (glitch do Recharts). */}
            {painel.ritmo.pontos.some(p => p.data === painel.ritmo.hoje) && (
              <>
                <ReferenceLine
                  x={painel.ritmo.hoje}
                  stroke={chartSeries.neutral}
                  strokeDasharray="4 3"
                  label={{ value: 'Hoje', position: 'insideTopLeft', fontSize: 10, fill: chartColors.axisTick }}
                />
                <ReferenceDot
                  x={painel.ritmo.hoje}
                  y={painel.ritmo.esperadoAteHoje}
                  r={4.5}
                  className="fill-white"
                  stroke={chartColors.axisTick}
                  strokeWidth={2}
                />
              </>
            )}

            <Line
              type="monotone"
              dataKey="metaAcum"
              name="Esperado"
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
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ChartLegend
        items={[
          { label: 'Realizado acumulado', color: painel.cor,           type: 'line' },
          { label: 'Esperado acumulado',  color: chartColors.axisTick, type: 'line', dashed: true },
        ]}
      />
    </Card>
  )
}
