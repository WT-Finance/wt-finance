'use client'

import {
  ResponsiveContainer, ComposedChart, Line, Tooltip,
} from 'recharts'
import {
  ChartGrid, ChartZeroLine, ChartXAxisCategoria, ChartYAxisBRL,
  CustomTooltip, ChartLegend, fluxoColors,
} from '@/components/charts'
import { fmtBRL, numBRL2 } from '@/lib/fmt'
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

/**
 * Valor da tabela: negativo com SINAL DE MENOS (o `numBRL2`/Intl já emite o "-") e em
 * vermelho nítido (`--danger`); positivo herda a cor do texto (ou a `cor` forçada — ex.:
 * verde `--success` do "A receber"). Cor sempre via token — nunca hex. Tokens semânticos
 * claros (não os `-deep` escuros) para as colunas se distinguirem à vista.
 */
function Valor({ v, cor }: { v: number; cor?: string }) {
  const neg   = v < 0
  const style = cor ? { color: cor } : (neg ? { color: 'var(--danger)' } : undefined)
  return <span style={style}>{numBRL2(v)}</span>
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

  // Rótulo = data de FIM da semana (`fim`, 'DD/MM' do to_char): o `acc` é o saldo projetado
  // ao FIM da semana (saldo op + Σ dos movimentos previstos até o fim daquela semana), então
  // rotular pelo fim alinha rótulo↔valor. O gráfico mostra só a LINHA do saldo acumulado —
  // recebimentos/pagamentos previstos alimentam o acumulado no banco, sem barras (checkpoint).
  const chartData = semanas.map(s => ({
    label: s.fim,
    acc:   s.acc,
  }))

  // As primeiras semanas abrem em tabela abaixo do gráfico (aproveita o espaço do card).
  const linhas = semanas.slice(0, 5)

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

      {/* Próximas semanas em tabela (só as que cabem no espaço do card; SEM container
          rolável → nunca aparece barra de rolagem). Cabeçalho no padrão da plataforma
          (caixa normal, font-medium, cor terciária); números contábeis com tabular-nums. */}
      <table className="w-full mt-4 tabular-nums">
        <thead>
          <tr className="text-2xs text-zinc-400 [&>th]:font-medium [&>th]:pb-1.5">
            <th className="text-left">Semana</th>
            <th className="text-right pl-2">A receber</th>
            <th className="text-right pl-2">A pagar</th>
            <th className="text-right pl-2 whitespace-nowrap">Saldo acumulado</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((s, i) => (
            <tr key={i} className="text-2xs [&>td]:py-1.5 [&>td]:border-t [&>td]:border-zinc-100">
              <td className="text-left text-zinc-600 whitespace-nowrap">{s.ini} – {s.fim}</td>
              <td className="text-right pl-2 whitespace-nowrap"><Valor v={s.rec} cor="var(--success)" /></td>
              <td className="text-right pl-2 whitespace-nowrap"><Valor v={s.pag} /></td>
              <td className="text-right pl-2 whitespace-nowrap font-medium" style={{ color: 'var(--text-primary)' }}><Valor v={s.acc} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
