'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Line, Legend,
} from 'recharts'
import { fmtMi } from '@/lib/fmt'
import SliderHorizonte from '@/components/shared/slider-horizonte'
import { fatiarJanelaMensal } from '@/lib/fluxo/janela-mensal'

export interface FluxoMensalV3Row {
  mes:                string   // 'YYYY-MM'
  entrada_efetivada:  number
  entrada_prevista:   number
  saida_efetivada:    number
  saida_prevista:     number
  resultado_mensal:   number
}

// Backwards-compat alias (consumed by page.tsx until M4 rewrites it)
export type FluxoMensalRow = FluxoMensalV3Row

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function fmtMesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES_ABREV[parseInt(m, 10) - 1]}/${y.slice(2)}`
}

// ── Custom dot for resultado_mensal line ─────────────────────────────────────

interface DotProps {
  cx?:     number
  cy?:     number
  value?:  number
}

function ResultadoDot({ cx, cy, value }: DotProps) {
  if (cx === undefined || cy === undefined || value === undefined) return null
  const fill = value >= 0 ? 'var(--text-primary)' : 'var(--danger)'
  return <circle cx={cx} cy={cy} r={4} fill={fill} stroke="none" />
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

const SERIES_LABELS: Record<string, string> = {
  entrada_efetivada:   'Entradas efetivadas',
  entrada_prevista:    'Entradas previstas',
  saida_efetivada_val: 'Saídas efetivadas',
  saida_prevista_val:  'Saídas previstas',
  resultado_mensal:    'Resultado mensal',
}

interface TooltipProps {
  active?:  boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?:   string
}

function FluxoTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-md p-3 text-xs min-w-[190px]">
      <p className="font-semibold text-zinc-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.color }}>{SERIES_LABELS[p.name] ?? p.name}</span>
          <span className="font-medium text-zinc-700">{fmtMi(Math.abs(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function FluxoLegend() {
  const items = [
    { label: 'Entradas efetivadas',  color: 'var(--positive)',     opacity: 1,    type: 'rect' as const },
    { label: 'Entradas previstas',   color: 'var(--positive)',     opacity: 0.45, type: 'rect' as const },
    { label: 'Saídas efetivadas',    color: 'var(--negative)',     opacity: 1,    type: 'rect' as const },
    { label: 'Saídas previstas',     color: 'var(--negative)',     opacity: 0.45, type: 'rect' as const },
    { label: 'Resultado mensal',     color: 'var(--text-primary)', opacity: 1,    type: 'line' as const },
    { label: 'Resultado negativo',   color: 'var(--danger)', opacity: 1,    type: 'dot'  as const },
  ]
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
      {items.map(it => (
        <div key={it.label} className="flex items-center gap-1.5 text-xs text-zinc-500">
          {it.type === 'rect' && (
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ background: it.color, opacity: it.opacity }}
            />
          )}
          {it.type === 'line' && (
            <span className="inline-block w-5 h-0.5" style={{ background: it.color }} />
          )}
          {it.type === 'dot' && (
            <svg width="10" height="10" className="inline-block">
              <circle cx="5" cy="5" r="4" fill={it.color} />
            </svg>
          )}
          {it.label}
        </div>
      ))}
    </div>
  )
}

// ── Data transform ────────────────────────────────────────────────────────────

interface ChartPoint {
  mes:                 string
  label:               string
  entrada_efetivada:   number
  entrada_prevista:    number
  saida_efetivada_val: number
  saida_prevista_val:  number
  resultado_mensal:    number
}

// v5.4.2: as saídas vão SEMPRE para cima do eixo, lado a lado com as entradas — o
// botão "Inverter saídas" saiu, no mesmo padrão adotado no card de Weddings.
// Consequência tratada no eixo Y: a metade negativa passou a abrigar só a LINHA de
// resultado, então o eixo deixou de mostrar valor ABSOLUTO. Antes o sinal vinha da
// direção da barra; agora só o rótulo pode dizer que é negativo, e um "R$ 4 Mi"
// abaixo do zero seria leitura errada.
function toChartPoints(rows: readonly FluxoMensalV3Row[]): ChartPoint[] {
  return rows.map(r => ({
    mes:                 r.mes,
    label:               fmtMesLabel(r.mes),
    entrada_efetivada:   r.entrada_efetivada,
    entrada_prevista:    r.entrada_prevista,
    saida_efetivada_val: r.saida_efetivada,
    saida_prevista_val:  r.saida_prevista,
    resultado_mensal:    r.resultado_mensal,
  }))
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

/** Riscos MAIORES da régua do slider: um a cada 6 meses, como em Weddings. */
const MARCOS = [6, 12, 18, 24, 30, 36] as const

const JANELA_PADRAO_ATRAS  = 24
const JANELA_PADRAO_FRENTE = 18

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  rows: FluxoMensalV3Row[]
  /** Mês corrente 'YYYY-MM' — vem do SERVIDOR (`hojeSP()`), para o slider ancorar
   *  sem depender do relógio do cliente (e sem divergir na hidratação). */
  mesHoje: string
}

export default function FluxoMensalChart({ rows, mesHoje }: Props) {
  const [atras,  setAtras]  = useState(JANELA_PADRAO_ATRAS)
  const [frente, setFrente] = useState(JANELA_PADRAO_FRENTE)

  // A RPC (0229) devolve a janela larga — 36 meses atrás + o mês atual + 36 à frente —
  // UMA vez, e o slider fatia aqui: arrastar não refetcha. Diferente do acumulado de
  // Weddings, aqui cada linha já é o valor do próprio mês, então recortar não rebaseia
  // nada (ver o cabeçalho de @/lib/fluxo/janela-mensal).
  const ordenadas = useMemo(
    () => [...rows].sort((a, b) => a.mes.localeCompare(b.mes)),
    [rows],
  )
  const janela = useMemo(
    () => fatiarJanelaMensal(ordenadas, mesHoje, atras, frente),
    [ordenadas, mesHoje, atras, frente],
  )
  const data = useMemo(() => toChartPoints(janela.pontos), [janela.pontos])

  // Rótulo VERDADEIRO da janela: derivado do que foi de fato recortado, não do estado
  // pedido (que `fatiarJanelaMensal` pode ter clampado numa série mais curta).
  const idxHoje = janela.mesHoje ? data.findIndex(d => d.mes === janela.mesHoje) : -1
  const atrasEfetivo  = idxHoje >= 0 ? idxHoje : Math.max(0, data.length - 1)
  const frenteEfetivo = idxHoje >= 0 ? data.length - 1 - idxHoje : 0

  // `[2,2,0,0]` arredonda a ponta LIVRE (a oposta à linha do zero) nos dois sentidos —
  // o Recharts inverte o `ySign` na barra negativa. Mantido mesmo com as saídas subindo:
  // é o raio padrão de qualquer coluna vertical (ver chart-theme/barRadius).
  const saidaRadius: [number, number, number, number] = [2, 2, 0, 0]

  if (!data.length) {
    return (
      <div className="rounded-xl shadow-sm bg-white p-5 mb-4">
        <div className="h-56 flex items-center justify-center text-sm text-zinc-400">
          Sem dados para o período
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl shadow-sm bg-white p-5 mb-4">
      <div className="mb-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Fluxo de Caixa Mensal</h3>
          <span className="text-[13px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {plural(atrasEfetivo, 'mês passado', 'meses passados')} + {plural(frenteEfetivo, 'mês futuro', 'meses futuros')}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart
          data={data}
          barCategoryGap="15%"
          barGap={1}
          margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--chart-axis-tick)' }}
            axisLine={false}
            tickLine={false}
            interval={2}
          />
          <YAxis
            tickFormatter={v => fmtMi(v as number)}
            tick={{ fontSize: 11, fill: 'var(--chart-axis-tick)' }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<FluxoTooltip />} />
          <ReferenceLine y={0} stroke="var(--chart-grid)" />

          <Bar
            dataKey="entrada_efetivada"
            name="entrada_efetivada"
            fill="var(--positive)"
            fillOpacity={1}
            radius={[2, 2, 0, 0]}
            barSize={5}
            isAnimationActive={false}
          />
          <Bar
            dataKey="entrada_prevista"
            name="entrada_prevista"
            fill="var(--positive)"
            fillOpacity={0.45}
            radius={[2, 2, 0, 0]}
            barSize={5}
            isAnimationActive={false}
          />
          <Bar
            dataKey="saida_efetivada_val"
            name="saida_efetivada_val"
            fill="var(--negative)"
            fillOpacity={1}
            radius={saidaRadius}
            barSize={5}
            isAnimationActive={false}
          />
          <Bar
            dataKey="saida_prevista_val"
            name="saida_prevista_val"
            fill="var(--negative)"
            fillOpacity={0.45}
            radius={saidaRadius}
            barSize={5}
            isAnimationActive={false}
          />

          <Line
            dataKey="resultado_mensal"
            name="resultado_mensal"
            stroke="var(--text-primary)"
            strokeWidth={2}
            dot={(props: DotProps) => <ResultadoDot key={`dot-${props.cx}-${props.cy}`} {...props} />}
            activeDot={{ r: 5 }}
            type="monotone"
            isAnimationActive={false}
          />

          {/* Legend hidden from Recharts — we render our own below */}
          <Legend content={() => null} />
        </ComposedChart>
      </ResponsiveContainer>
      <FluxoLegend />

      {/* Slider de janela — mesmo primitivo e mesma régua do card de Weddings, com o
          trilho NEUTRO (o default): esta tela já tem o slider de "Horizonte de tempo"
          do Fluxo Projetado, e dois sliders na mesma página com cores diferentes
          leriam como controles de naturezas diferentes. */}
      <div className="px-2 py-4 mt-7 border-t border-zinc-100">
        <div className="flex items-start gap-3">
          <span className="text-2xs text-zinc-500 tabular-nums w-[72px] shrink-0 text-right pt-0.5">
            {plural(atrasEfetivo, 'mês', 'meses')}
          </span>
          <SliderHorizonte
            className="flex-1 min-w-[120px]"
            valor={atras} max={janela.maxAtras} onChange={setAtras}
            maiores={MARCOS} espelhado
            ariaLabel="Meses para trás na janela do gráfico"
            ariaValueText={plural(atrasEfetivo, 'mês atrás', 'meses atrás')}
          />
          <span
            className="text-2xs font-semibold shrink-0 px-1.5 py-0.5 rounded mt-0.5"
            style={{ background: 'var(--action-soft)', color: 'var(--action-soft-fg)' }}
          >
            HOJE
          </span>
          <SliderHorizonte
            className="flex-1 min-w-[120px]"
            valor={frente} max={janela.maxFrente} onChange={setFrente}
            maiores={MARCOS}
            ariaLabel="Meses para frente na janela do gráfico"
            ariaValueText={plural(frenteEfetivo, 'mês à frente', 'meses à frente')}
          />
          <span className="text-2xs text-zinc-500 tabular-nums w-[72px] shrink-0 pt-0.5">
            {plural(frenteEfetivo, 'mês', 'meses')}
          </span>
        </div>
      </div>
    </div>
  )
}
