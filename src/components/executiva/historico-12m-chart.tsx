'use client'

import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, Cell, CartesianGrid, LabelList,
} from 'recharts'
import type { Historico12mSetores } from '@/types/api'
import { fmtMi } from '@/lib/fmt'
import CustomTooltip from '@/components/charts/custom-tooltip'

const MESES_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

const SETOR_COLORS: Record<string, string> = {
  Lazer:       '#378ADD',
  Weddings:    '#BA7517',
  Corporativo: '#0F6E56',
}
const SETORES = ['Lazer', 'Weddings', 'Corporativo'] as const

function fmtCurto(v: number): string {
  if (Math.abs(v) >= 1_000_000)
    return `${(v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`
  if (Math.abs(v) >= 1_000)
    return `${Math.round(v / 1_000)}k`
  return String(v)
}

interface Props {
  data:      Historico12mSetores | null
  setor?:    string
  eParcial?: boolean
}

export default function Historico12mChart({ data, setor = 'todos', eParcial = false }: Props) {
  const meses = data?.meses ?? []
  const semDados = meses.every(m => m.total === 0)

  const chartData = meses.map(m => ({
    label:       `${MESES_SHORT[m.mes - 1]}/${String(m.ano).slice(2)}`,
    eh_atual:    m.eh_atual,
    parcial:     m.eh_atual && eParcial,
    total:       m.total,
    Lazer:       m.Lazer,
    Weddings:    m.Weddings,
    Corporativo: m.Corporativo,
  }))

  const Y_TICKS = [0, 2_500_000, 5_000_000, 7_500_000, 10_000_000]
  function fmtYTick(v: number): string {
    if (v === 0)          return '0'
    if (v === 5_000_000)  return '5M'
    if (v === 10_000_000) return '10M'
    return '–'
  }

  const activeLabels = new Set(chartData.filter(d => d.eh_atual).map(d => d.label))
  function CustomXTick(props: Record<string, unknown>) {
    const x       = props.x as number | undefined
    const y       = props.y as number | undefined
    const payload = props.payload as { value: string } | undefined
    const isActive = activeLabels.has(payload?.value ?? '')
    return (
      <text
        x={x} y={(y ?? 0) + 10}
        textAnchor="middle"
        fontSize={10}
        fill={isActive ? 'var(--primary)' : 'var(--chart-axis-tick)'}
        fontWeight={isActive ? 600 : 400}
      >
        {payload?.value}
      </text>
    )
  }

  // Label acima da barra (total) — renderizada no topo do stack
  function TopLabel({ index }: { index?: number; x?: number; y?: number; width?: number }) {
    const entry = index != null ? chartData[index] : null
    if (!entry || entry.total === 0) return null
    const color  = entry.eh_atual ? 'var(--primary)' : 'var(--chart-axis-tick)'
    const weight = entry.eh_atual ? 600 : 400
    return (
      <text style={{ fontSize: 10, fill: color, fontWeight: weight }} textAnchor="middle">
        {fmtCurto(entry.total)}
      </text>
    )
  }

  // Quando setor específico, exibe barra única na cor do setor (ou azul primário para eh_atual)
  const isTodos = setor === 'todos'
  const singleColor = SETOR_COLORS[setor] ?? 'var(--primary)'

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4 mb-6">
      <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">
        Faturamento · últimos 12 meses
      </h2>
      {semDados ? (
        <div className="h-40 flex items-center justify-center text-xs text-zinc-400">
          Sem dados disponíveis
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="label"
              tick={(props) => <CustomXTick {...props} />}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 10_000_000]}
              ticks={Y_TICKS}
              tickFormatter={fmtYTick}
              tick={{ fontSize: 10, fill: 'var(--chart-axis-tick)' }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              content={(props) => (
                <CustomTooltip
                  {...props}
                  formatter={(value, name) => [
                    fmtMi(Number(value)),
                    isTodos ? String(name) : 'Faturamento',
                  ]}
                />
              )}
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            />

            {isTodos ? (
              // ── Barras empilhadas por setor ──────────────────────────────
              <>
                {SETORES.map((s, idx) => {
                  const isTop = idx === SETORES.length - 1
                  return (
                    <Bar
                      key={s}
                      dataKey={s}
                      stackId="fat"
                      fill={SETOR_COLORS[s]}
                      radius={isTop ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      activeBar={{ opacity: 0.75 }}
                    >
                      {chartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={SETOR_COLORS[s]}
                          fillOpacity={entry.parcial ? 0.4 : 1}
                        />
                      ))}
                      {isTop && (
                        <LabelList
                          dataKey="total"
                          position="top"
                          content={(props) => <TopLabel index={props.index} />}
                        />
                      )}
                    </Bar>
                  )
                })}
              </>
            ) : (
              // ── Barra única para setor específico ───────────────────────
              <Bar
                dataKey="total"
                radius={[4, 4, 0, 0]}
                activeBar={{ opacity: 0.75 }}
              >
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.parcial  ? 'var(--chart-neutral)'
                      : entry.eh_atual ? 'var(--primary)'
                      : singleColor
                    }
                    fillOpacity={entry.parcial ? 0.6 : 1}
                  />
                ))}
                <LabelList
                  dataKey="total"
                  position="top"
                  content={(props) => <TopLabel index={props.index} />}
                />
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Legenda — só quando todos os setores */}
      {isTodos && (
        <div className="flex items-center gap-4 mt-2 justify-end">
          {SETORES.map(s => (
            <span key={s} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: SETOR_COLORS[s] }} />
              {s === 'Lazer' ? 'Trips' : s}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
