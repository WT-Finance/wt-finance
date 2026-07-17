'use client'

import {
  ResponsiveContainer, ComposedChart, Bar, Line, Tooltip,
} from 'recharts'
import {
  ChartGrid, ChartZeroLine, ChartXAxisCategoria, ChartYAxisBRL,
  CustomTooltip, ChartLegend, fluxoColors, barRadius, barSizes,
} from '@/components/charts'
import { fmtMi, fmtBRL } from '@/lib/fmt'
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

  // `ini`/`fim` já vêm formatados 'DD/MM' do banco (to_char). `pag` já vem NEGATIVO
  // (fato_fluxo.valor é assinado); a barra de saída renderiza p/ baixo sem negação extra.
  const chartData = semanas.map(s => ({
    label:  s.ini,
    ini:    s.ini,
    fim:    s.fim,
    rec:    s.rec,
    pagVal: s.pag,
    acc:    s.acc,
  }))

  // Runway = 1ª semana em que o saldo projetado acumulado fica negativo.
  const idxNegativo = semanas.findIndex(s => s.acc < 0)
  const seguro       = idxNegativo === -1
  const runwayLabel  = seguro
    ? `Saldo projetado permanece positivo nas ${semanas.length} semanas`
    : `Saldo projetado fica negativo em ${idxNegativo + 1} semana${idxNegativo === 0 ? '' : 's'}`

  return (
    <div className="rounded-xl shadow-sm bg-white p-5 flex-1 flex flex-col">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Runway Semanal</h3>
        <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{semanas.length} semanas</span>
      </div>
      <p className="text-2xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Saldo operacional atual: <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtMi(data.saldo_operacional)}</span>
      </p>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barGap={1}>
          {ChartGrid()}
          {ChartXAxisCategoria('label', { interval: 0 })}
          {ChartYAxisBRL()}
          {ChartZeroLine()}
          <Tooltip
            content={(props) => (
              <CustomTooltip
                {...props}
                formatter={(value: number, name: string) => {
                  if (name === 'rec')    return [fmtBRL(value), 'Recebimentos previstos']
                  if (name === 'pagVal') return [fmtBRL(Math.abs(value)), 'Pagamentos previstos']
                  return [fmtBRL(value), 'Saldo projetado']
                }}
              />
            )}
          />
          <Bar dataKey="rec"    name="rec"    fill={fluxoColors.entrada} radius={barRadius.top}    barSize={barSizes.column} />
          <Bar dataKey="pagVal" name="pagVal" fill={fluxoColors.saida}   radius={barRadius.bottom} barSize={barSizes.column} />
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
          { label: 'Recebimentos previstos', color: fluxoColors.entrada,   type: 'rect' },
          { label: 'Pagamentos previstos',   color: fluxoColors.saida,     type: 'rect' },
          { label: 'Saldo projetado',        color: fluxoColors.resultado, type: 'line' },
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
      <p className="text-3xs mt-2" style={{ color: 'var(--text-subtle)' }}>
        Projeção com base nos lançamentos já previstos (Contas a Pagar/a Receber) — não é garantia de
        caixa; muda conforme novos lançamentos entram.
      </p>
    </div>
  )
}
