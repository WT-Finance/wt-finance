'use client'

/**
 * Showcase visual dos primitivos de gráfico (Design System §8).
 * Exemplos VIVOS consumindo os primitivos de `@/components/charts` — serve de
 * referência de uso para os drawers (M5/M6) e demais gráficos.
 */

import {
  ResponsiveContainer, ComposedChart, BarChart, LineChart, PieChart,
  Bar, Line, Pie, Cell, Tooltip,
} from 'recharts'
import {
  ChartGrid, ChartZeroLine, ChartXAxisMes,
  ChartYAxisBRL, ChartYAxisCategoria, ChartXAxisBRL,
  ChartLegend, CustomTooltip,
  fluxoColors, chartColors, barRadius, barSizes, dashArrays,
  strokeWidths, FUTURE_OPACITY,
  type ChartLegendItem,
} from '@/components/charts'
import { SETOR_COLORS, SUBSETOR_ORDER, subsetorColor, SUBSETOR_LABELS } from '@/lib/config'
import { fmtBRL, fmtMi } from '@/lib/fmt'

// ── Dados de exemplo ──────────────────────────────────────────────────────────

const MESES = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08']

const barData = MESES.map((mes, i) => ({
  mes,
  entrada: [820, 640, 910, 1130, 760, 980, 1210, 870][i] * 1000,
  saida:   -[510, 430, 620, 700, 540, 600, 720, 560][i] * 1000,
  ehFuturo: i >= 5,
}))

const stackData = MESES.slice(0, 6).map((mes, i) => ({
  mes,
  Lazer:       [1200, 1100, 1350, 1500, 1280, 1420][i] * 1000,
  Weddings:    [700, 820, 760, 910, 840, 880][i] * 1000,
  Corporativo: [430, 510, 470, 560, 520, 600][i] * 1000,
}))
const SETORES = ['Lazer', 'Weddings', 'Corporativo'] as const

const lineData = MESES.map((mes, i) => ({
  mes,
  // Real até mai/26; projeção depois (NaN no real força a quebra da linha sólida).
  real:     i <= 4 ? [120, 90, 150, 170, 130][i] * 1000 : null,
  projecao: i >= 4 ? [130, 160, 145, 180][i - 4] * 1000 : null,
}))

const donutData = [
  { label: 'Planejamento', valor: 1_800_000, cor: subsetorColor('PLANEJAMENTO') },
  { label: 'Produção',     valor: 1_200_000, cor: subsetorColor('PRODUÇÃO') },
  { label: 'Comercial',    valor: 780_000,   cor: subsetorColor('COMERCIAL') },
  { label: 'Outros',       valor: 420_000,   cor: 'var(--chart-neutral)' },
]
const donutTotal = donutData.reduce((s, d) => s + d.valor, 0)

const horizData = [
  { name: 'Lazer',       valor: 4_200_000, cor: SETOR_COLORS.Lazer,       pct: 52.1 },
  { name: 'Weddings',    valor: 2_500_000, cor: SETOR_COLORS.Weddings,    pct: 31.0 },
  { name: 'Corporativo', valor: 1_360_000, cor: SETOR_COLORS.Corporativo, pct: 16.9 },
]

const subsetorMix = SUBSETOR_ORDER.map((s, i) => ({
  subsetor: s,
  valor:    [3_100_000, 2_400_000, 1_800_000, 950_000, 520_000][i],
  pct:      [40.7, 31.5, 23.6, 12.5, 6.8][i],
}))
const subsetorMixMax = Math.max(...subsetorMix.map(d => d.valor))

// ── Subcomponentes ──────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">{title}</h3>
      {children}
    </div>
  )
}

// ── Showcase ──────────────────────────────────────────────────────────────────

export default function ChartShowcase() {
  const fluxoLegend: ChartLegendItem[] = [
    { label: 'Entrada (efetivada)', color: fluxoColors.entrada, type: 'rect' },
    { label: 'Entrada (prevista)',  color: fluxoColors.entrada, type: 'rect', opacity: FUTURE_OPACITY },
    { label: 'Saída (efetivada)',   color: fluxoColors.saida,   type: 'rect' },
    { label: 'Saída (prevista)',    color: fluxoColors.saida,   type: 'rect', opacity: FUTURE_OPACITY },
  ]
  const setorLegend: ChartLegendItem[] = SETORES.map(s => ({
    label: s === 'Lazer' ? 'Trips' : s, color: SETOR_COLORS[s], type: 'rect',
  }))
  const lineLegend: ChartLegendItem[] = [
    { label: 'Real',     color: fluxoColors.resultado, type: 'line' },
    { label: 'Projeção', color: chartColors.axisTick,  type: 'line', dashed: true },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

      {/* 1. Barras — fluxo (entrada/saída), futuro esmaecido, linha do zero */}
      <ChartCard title="Barras — Fluxo (real x previsto)">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={barData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%" barGap={1}>
            {ChartGrid()}
            {ChartXAxisMes('mes', { interval: 0 })}
            {ChartYAxisBRL({ width: 64 })}
            {ChartZeroLine()}
            <Tooltip content={(p) => (
              <CustomTooltip {...p} showColorDot
                labelFormatter={(l) => String(l)}
                formatter={(v, n) => [fmtBRL(Math.abs(v)), n === 'entrada' ? 'Entrada' : 'Saída']} />
            )} />
            <Bar dataKey="entrada" name="entrada" radius={barRadius.top} barSize={barSizes.fluxo}>
              {barData.map((d, i) => <Cell key={i} fill={fluxoColors.entrada} fillOpacity={d.ehFuturo ? FUTURE_OPACITY : 1} />)}
            </Bar>
            <Bar dataKey="saida" name="saida" radius={barRadius.bottom} barSize={barSizes.fluxo}>
              {barData.map((d, i) => <Cell key={i} fill={fluxoColors.saida} fillOpacity={d.ehFuturo ? FUTURE_OPACITY : 1} />)}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
        <ChartLegend items={fluxoLegend} />
      </ChartCard>

      {/* 2. Barras empilhadas — segmentos contínuos, cantos só no topo */}
      <ChartCard title="Barras empilhadas — Mix por setor">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stackData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {ChartGrid()}
            {ChartXAxisMes('mes', { interval: 0 })}
            {ChartYAxisBRL({ width: 64 })}
            <Tooltip content={(p) => (
              <CustomTooltip {...p} showColorDot formatter={(v, n) => [fmtMi(v), n]} />
            )} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            {SETORES.map((s, idx) => (
              <Bar
                key={s}
                dataKey={s}
                name={s}
                stackId="fat"
                fill={SETOR_COLORS[s]}
                radius={idx === SETORES.length - 1 ? barRadius.top : barRadius.none}
                barSize={barSizes.column}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <ChartLegend items={setorLegend} />
      </ChartCard>

      {/* 3. Linha — sólida (real) + tracejada (projeção) */}
      <ChartCard title="Linha — Real (sólida) x Projeção (tracejada)">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={lineData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {ChartGrid()}
            {ChartXAxisMes('mes', { interval: 0 })}
            {ChartYAxisBRL({ width: 64 })}
            <Tooltip content={(p) => (
              <CustomTooltip {...p} showColorDot
                formatter={(v, n) => [fmtBRL(v), n === 'real' ? 'Real' : 'Projeção']} />
            )} />
            <Line
              type="monotone" dataKey="real" name="real"
              stroke={fluxoColors.resultado} strokeWidth={strokeWidths.line}
              dot={{ r: 2.5, fill: fluxoColors.resultado }} connectNulls={false}
            />
            <Line
              type="monotone" dataKey="projecao" name="projecao"
              stroke={chartColors.axisTick} strokeWidth={strokeWidths.lineDashed}
              strokeDasharray={dashArrays.reference} dot={false} connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <ChartLegend items={lineLegend} />
      </ChartCard>

      {/* 4. Donut — total no centro, cauda agregada em cinza */}
      <ChartCard title="Donut — Total no centro, cauda 'Outros' neutra">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donutData} dataKey="valor" nameKey="label" cx="50%" cy="50%"
                  innerRadius={46} outerRadius={66} paddingAngle={1.5} stroke="none" isAnimationActive={false}>
                  {donutData.map((d, i) => <Cell key={i} fill={d.cor} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] text-[var(--text-muted)] leading-tight">Total</span>
              <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums leading-tight">{fmtMi(donutTotal)}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            {donutData.map(d => (
              <div key={d.label} className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.cor }} />
                <span className="text-[11px] text-[var(--text-muted)] truncate min-w-0 flex-1">{d.label}</span>
                <span className="text-[10px] text-[var(--text-subtle)] tabular-nums shrink-0">{((d.valor / donutTotal) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>

      {/* 5. Barra horizontal — bolinha à esquerda, % à direita */}
      <ChartCard title="Barra horizontal — Mix por setor">
        <ResponsiveContainer width="100%" height={140}>
          <BarChart layout="vertical" data={horizData} margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
            {ChartXAxisBRL()}
            {ChartYAxisCategoria('name', { width: 88 })}
            <Tooltip content={(p) => (
              <CustomTooltip {...p} formatter={(v) => [fmtMi(v), 'Faturamento']} />
            )} />
            <Bar dataKey="valor" radius={barRadius.right} maxBarSize={barSizes.horizontal}>
              {horizData.map((d, i) => <Cell key={i} fill={d.cor} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 6. Composição por subsetor — barrinhas finas com bolinha + % */}
      <ChartCard title="Composição por subsetor (barrinhas 5px)">
        <div className="space-y-2.5">
          {subsetorMix.map(d => (
            <div key={d.subsetor}>
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: subsetorColor(d.subsetor) }} />
                  {SUBSETOR_LABELS[d.subsetor] ?? d.subsetor}
                </span>
                <span className="text-[10px] text-[var(--text-subtle)] tabular-nums">{d.pct.toFixed(1)}%</span>
              </div>
              <div className="h-[5px] rounded-full bg-zinc-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(d.valor / subsetorMixMax) * 100}%`, background: subsetorColor(d.subsetor) }} />
              </div>
            </div>
          ))}
        </div>
      </ChartCard>

    </div>
  )
}
