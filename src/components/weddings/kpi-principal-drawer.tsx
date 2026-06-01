'use client'

import { useEffect, useRef, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { fmtMi } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'
import SumarioSubsetorCard from '@/components/weddings/sumario-subsetor'
import type { TendenciaMargem, ExecutivaKpis, SumarioSubsetor } from '@/types/api'
import {
  SUBSETOR_ORDER,
  SUBSETOR_LABELS,
  subsetorColor,
} from '@/lib/config'
import {
  ChartGrid,
  ChartXAxisMes,
  ChartXAxisCategoria,
  ChartYAxisBRL,
  ChartYAxisPct,
  ChartLegend,
  CustomTooltip,
  chartColors,
  dashArrays,
  strokeWidths,
  barRadius,
  barSizes,
  type ChartLegendItem,
} from '@/components/charts'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Tooltip,
} from 'recharts'

// ── Historico por subsetor (RPC get_weddings_historico_subsetor) ──────────────

interface HistoricoSubsetorRow {
  mes:         string  // 'YYYY-MM-DD' (primeiro dia do mês)
  subsetor:    string
  faturamento: number
  receita:     number
}

// Ordem/cores/labels de subsetor vêm do design system ('@/lib/config'):
// SUBSETOR_ORDER, subsetorColor(), SUBSETOR_LABELS. A RPC pode retornar também
// 'NÃO_CLASSIFICADO', que não está no config — é apêndice no fim da ordem, com
// cor de fallback (brand) e rótulo dedicado abaixo.
const SUBSETOR_ORDER_DRAWER: string[] = [...SUBSETOR_ORDER, 'NÃO_CLASSIFICADO']

// Rótulo de subsetor com fallback para o não-classificado (ausente do config).
function subsetorLabel(s: string): string {
  if (s === 'NÃO_CLASSIFICADO') return 'Não Classif.'
  return SUBSETOR_LABELS[s] ?? s
}

// Linha pivotada (um mês) para os BarCharts stacked.
type StackedRow = { mes: string; label: string } & Record<string, number | string>

// ── Drawer data shape ─────────────────────────────────────────────────────────

interface DrawerData {
  tendencia:    TendenciaMargem | null
  yoyTendencia: TendenciaMargem | null
  kpis:         ExecutivaKpis | null
  sumario:      SumarioSubsetor | null
  historico:    HistoricoSubsetorRow[]
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function toISO(d: Date) { return d.toISOString().slice(0, 10) }

function computeAntDates(from: string, to: string) {
  const fromD = new Date(from)
  const toD   = new Date(to)
  const ms    = toD.getTime() - fromD.getTime() + 86400000
  const antTo = new Date(fromD.getTime() - 86400000)
  const antFrom = new Date(antTo.getTime() - ms + 86400000)
  return { from: toISO(antFrom), to: toISO(antTo) }
}

function computeYoyDates(from: string, to: string) {
  const f = new Date(from); f.setFullYear(f.getFullYear() - 1)
  const t = new Date(to);   t.setFullYear(t.getFullYear() - 1)
  return { from: toISO(f), to: toISO(t) }
}

// month string (YYYY-MM) helpers
function currentMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthToFirstDay(ym: string) {
  // ym = 'YYYY-MM' → primeiro dia do mês
  return `${ym}-01`
}
function monthToLastDay(ym: string) {
  // ym = 'YYYY-MM' → último dia do mês
  const [y, m] = ym.split('-').map(Number)
  return toISO(new Date(y, m, 0)) // dia 0 do mês seguinte = último dia do mês atual
}

// 'YYYY-MM-DD' (primeiro dia do mês) → 'Mmm/AA' (ex: 'jan/26')
const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function mesLabel(isoDay: string) {
  const [y, m] = isoDay.split('-').map(Number)
  return `${MES_ABREV[m - 1]}/${String(y).slice(-2)}`
}

// ── Period pills ─────────────────────────────────────────────────────────────

type PillId = 'este-ano' | 'ult-3m' | 'ult-6m' | 'ult-12m' | 'custom'

const PILLS: { id: PillId; label: string }[] = [
  { id: 'este-ano', label: 'Este ano'      },
  { id: 'ult-3m',   label: 'Últ. 3 meses'  },
  { id: 'ult-6m',   label: 'Últ. 6 meses'  },
  { id: 'ult-12m',  label: 'Últ. 12 meses' },
  { id: 'custom',   label: 'Personalizado' },
]

function pillToDates(pill: PillId): { from: string; to: string } | null {
  const today   = new Date()
  const y       = today.getFullYear()
  const m       = today.getMonth()

  const lastOf  = (year: number, month: number) => new Date(year, month + 1, 0)

  switch (pill) {
    case 'este-ano':
      return { from: `${y}-01-01`, to: toISO(lastOf(y, 11)) }
    case 'ult-3m': {
      const from3 = new Date(y, m - 2, 1)
      return { from: toISO(from3), to: toISO(lastOf(y, m)) }
    }
    case 'ult-6m': {
      const from6 = new Date(y, m - 5, 1)
      return { from: toISO(from6), to: toISO(lastOf(y, m)) }
    }
    case 'ult-12m': {
      const from12 = new Date(y, m - 11, 1)
      return { from: toISO(from12), to: toISO(lastOf(y, m)) }
    }
    case 'custom':
      return null
  }
}

// ── Pill styling (padrão design system) ─────────────────────────────────────────

const PILL_ACTIVE_STYLE = {
  background:  'var(--brand-soft)',
  borderColor: 'var(--brand)',
  color:       'var(--brand-deep)',
}
const PILL_BASE = 'px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors whitespace-nowrap'
const PILL_INACTIVE = 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'

// ── Stacked tooltip (faturamento/receita por subsetor no mês) ───────────────────

function StackedTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name?: string | number; dataKey?: string | number; value?: number; color?: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  // Mostra apenas segmentos com valor > 0, do maior para o menor.
  const linhas = payload
    .filter(p => typeof p.value === 'number' && p.value > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  if (!linhas.length) return null
  const total = linhas.reduce((s, p) => s + (p.value ?? 0), 0)
  // O eixo X agora keia em `mes` ('YYYY-MM-DD'); formata p/ 'jan/26' no header.
  const header = label ? mesLabel(label) : ''
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-medium text-zinc-700 mb-1">{header}</p>
      {linhas.map(p => {
        const key = String(p.dataKey ?? p.name)
        return (
          <p key={key} className="tabular-nums flex items-center gap-1.5" style={{ color: p.color }}>
            <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
            {subsetorLabel(key)}: {fmtMi(p.value ?? 0)}
          </p>
        )
      })}
      <p className="tabular-nums font-medium text-zinc-700 border-t border-zinc-100 mt-1 pt-1">
        Total: {fmtMi(total)}
      </p>
    </div>
  )
}

// ── KPI cell (faixa 3x2, sem card cinza) ────────────────────────────────────────

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-3 text-center">
      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--brand)' }}>{value}</p>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2 mt-6">{label}</p>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-zinc-100 animate-pulse rounded h-24" />
      <div className="bg-zinc-100 animate-pulse rounded h-40" />
      <div className="bg-zinc-100 animate-pulse rounded h-32" />
    </div>
  )
}

// ── Drawer body ───────────────────────────────────────────────────────────────

function DrawerBody() {
  const [activePill, setActivePill]             = useState<PillId>('este-ano')
  const [data, setData]                         = useState<DrawerData | null>(null)
  const [loading, setLoading]                   = useState(false)
  const [customFrom, setCustomFrom]             = useState('') // YYYY-MM
  const [customTo, setCustomTo]                 = useState('') // YYYY-MM
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [activeDates, setActiveDates]           = useState<{ from: string; to: string } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const maxMonth = currentMonthStr()

  // Close popover on outside click
  useEffect(() => {
    if (!showCustomPicker) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowCustomPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCustomPicker])

  // Fetch when activeDates changes
  useEffect(() => {
    if (!activeDates) return
    let cancelled = false
    setLoading(true)

    const { from: p_from, to: p_to } = activeDates
    const ant = computeAntDates(p_from, p_to)
    const yoy = computeYoyDates(p_from, p_to)

    const supabase = getBrowserClient()

    Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)('get_tendencia_margem', { p_from, p_to, p_setor: 'Weddings' }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)('get_tendencia_margem', { p_from: yoy.from, p_to: yoy.to, p_setor: 'Weddings' }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)('get_executiva_kpis', {
        p_from, p_to, p_setor: 'Weddings',
        p_ant_from: ant.from, p_ant_to: ant.to,
        p_yoy_from: yoy.from, p_yoy_to: yoy.to,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)('get_sumario_subsetor', { p_from, p_to }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)('get_weddings_historico_subsetor', { p_from, p_to }),
    ]).then(([tendRes, yoyRes, kpisRes, sumRes, histRes]) => {
      if (cancelled) return
      setData({
        tendencia:    (tendRes.data as TendenciaMargem) ?? null,
        yoyTendencia: (yoyRes.data as TendenciaMargem)  ?? null,
        kpis:         (kpisRes.data as ExecutivaKpis)   ?? null,
        sumario:      (sumRes.data as SumarioSubsetor)  ?? null,
        historico:    (histRes.data as HistoricoSubsetorRow[]) ?? [],
      })
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [activeDates])

  // Initialize with este-ano
  useEffect(() => {
    const dates = pillToDates('este-ano')
    if (dates) setActiveDates(dates)
  }, [])

  const handlePillClick = (pill: PillId) => {
    if (pill === 'custom') {
      setShowCustomPicker(p => !p)
      return
    }
    setShowCustomPicker(false)
    setActivePill(pill)
    const dates = pillToDates(pill)
    if (dates) setActiveDates(dates)
  }

  const aplicarCustom = () => {
    if (!customFrom || !customTo) return
    setShowCustomPicker(false)
    setActivePill('custom')
    setActiveDates({
      from: monthToFirstDay(customFrom),
      to:   monthToLastDay(customTo),
    })
  }

  const pillClass  = (pill: PillId) => [PILL_BASE, activePill === pill ? '' : PILL_INACTIVE].join(' ')
  const pillStyle  = (pill: PillId) => (activePill === pill ? PILL_ACTIVE_STYLE : undefined)

  // Chart data helpers
  const yoyMerged = (data?.tendencia?.pontos ?? []).map((p, i) => ({
    label:    p.label,
    atual:    p.faturamento,
    anterior: data?.yoyTendencia?.pontos[i]?.faturamento ?? 0,
  }))

  const margemData = data?.tendencia?.pontos ?? []

  // ── Stacked por subsetor (M2) ────────────────────────────────────────────────
  // Pivota o array flat { mes, subsetor, faturamento, receita } em uma linha por mês
  // com uma chave por subsetor presente. Faturamento e Receita têm escalas Y
  // INDEPENDENTES (M5): cada gráfico usa o próprio máximo mensal empilhado.
  const historico = data?.historico ?? []

  // Subsetores que de fato aparecem no período, na ordem fixa.
  const subsetoresPresentes = SUBSETOR_ORDER_DRAWER.filter(s =>
    historico.some(r => r.subsetor === s),
  )

  function pivotar(metric: 'faturamento' | 'receita'): StackedRow[] {
    const byMes = new Map<string, StackedRow>()
    for (const r of historico) {
      let row = byMes.get(r.mes)
      if (!row) {
        row = { mes: r.mes, label: mesLabel(r.mes) }
        byMes.set(r.mes, row)
      }
      row[r.subsetor] = (Number(row[r.subsetor]) || 0) + (r[metric] ?? 0)
    }
    return [...byMes.values()].sort((a, b) => a.mes.localeCompare(b.mes))
  }

  const fatData = pivotar('faturamento')
  const recData = pivotar('receita')

  // Escalas Y INDEPENDENTES (M5): cada gráfico stacked auto-escala pelo próprio
  // total mensal (o eixo BRL do primitivo parte de 0 e ajusta o topo sozinho).
  // A receita é fração do faturamento, então o eixo próprio dá legibilidade ao
  // seu detalhe interno — não mais a escala compartilhada do faturamento.
  const temHistorico = historico.length > 0

  // Legenda única dos subsetores presentes — entre os dois gráficos stacked.
  const subsetorLegendItems: ChartLegendItem[] = subsetoresPresentes.map(s => ({
    label: subsetorLabel(s),
    color: subsetorColor(s),
    type:  'rect',
  }))

  // Legenda do YoY: sólido = período atual, tracejado = ano anterior (referência).
  const yoyLegendItems: ChartLegendItem[] = [
    { label: 'Este período', color: 'var(--brand)',        type: 'line' },
    { label: 'Ano anterior', color: chartColors.axisTick,  type: 'line', dashed: true },
  ]

  return (
    <div>
      {/* Pills row — sticky no topo do drawer ao rolar */}
      <div
        className="sticky top-0 z-20 bg-white pb-3 mb-1 border-b border-zinc-100"
        style={{ marginTop: '-4px', paddingTop: '4px' }}
        ref={popoverRef}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {PILLS.map(p => (
            <button
              key={p.id}
              className={pillClass(p.id)}
              style={pillStyle(p.id)}
              onClick={() => handlePillClick(p.id)}
              disabled={loading}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom month picker popover (seleção por MÊS) */}
        {showCustomPicker && (
          <div className="absolute top-full left-0 mt-2 z-50 bg-white border border-zinc-200 rounded-xl shadow-lg p-4 w-64">
            <p className="text-[11px] font-medium text-zinc-500 mb-3">Período personalizado</p>
            <div className="space-y-2 mb-4">
              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">Mês inicial</label>
                <input
                  type="month"
                  aria-label="Mês inicial"
                  value={customFrom}
                  max={maxMonth}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded px-2 py-1 text-zinc-700 focus:outline-none focus:border-zinc-400"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">Mês final</label>
                <input
                  type="month"
                  aria-label="Mês final"
                  value={customTo}
                  min={customFrom || undefined}
                  max={maxMonth}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded px-2 py-1 text-zinc-700 focus:outline-none focus:border-zinc-400"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCustomPicker(false)}
                className="flex-1 text-[11px] text-zinc-400 hover:text-zinc-600 py-1.5 rounded border border-zinc-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={aplicarCustom}
                disabled={!customFrom || !customTo}
                className="flex-1 text-[11px] text-white py-1.5 rounded transition-colors disabled:opacity-50"
                style={{ background: 'var(--brand)' }}
              >
                Aplicar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Loading or content */}
      {loading ? (
        <LoadingSkeleton />
      ) : !data ? (
        <p className="text-xs text-zinc-400 text-center py-8">Selecione um período</p>
      ) : (
        <div>
          {/* KPIs — faixa 3x2 uniforme (6 células iguais, sem sobra à direita).
              Separadores finos via gap que revela o fundo (border-zinc-100). */}
          <div className="grid grid-cols-3 gap-px bg-zinc-100 border border-zinc-100 rounded-lg overflow-hidden mt-4">
            <KpiCell label="Faturamento"  value={fmtMi(data.kpis?.faturamento?.valor  ?? 0)} />
            <KpiCell label="Receita"      value={fmtMi(data.kpis?.receita?.valor      ?? 0)} />
            <KpiCell label="Margem"       value={`${(data.kpis?.margem_pct?.valor     ?? 0).toFixed(1)}%`} />
            <KpiCell label="Nº Vendas"    value={String(data.kpis?.vendas?.valor      ?? 0)} />
            <KpiCell label="Ticket Médio" value={fmtMi(data.kpis?.ticket_medio?.valor ?? 0)} />
            <KpiCell label="Rec. Média"   value={fmtMi(data.kpis?.receita_media?.valor ?? 0)} />
          </div>

          {/* M2/M5: stacked Faturamento + Receita por subsetor.
              Escalas Y INDEPENDENTES; legenda única ENTRE os dois gráficos. */}
          {temHistorico && (
            <div className="mt-6">
              {/* Gráfico 1 — Faturamento por Subsetor */}
              <SectionHeader label="Faturamento por Subsetor" />
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={fatData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  {ChartGrid()}
                  {ChartXAxisMes('mes', { interval: 0 })}
                  {ChartYAxisBRL({ width: 64 })}
                  <Tooltip content={<StackedTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                  {subsetoresPresentes.map((s, idx) => (
                    <Bar
                      key={s}
                      dataKey={s}
                      name={s}
                      stackId="sub"
                      fill={subsetorColor(s)}
                      radius={idx === subsetoresPresentes.length - 1 ? barRadius.top : barRadius.none}
                      barSize={barSizes.column}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>

              {/* Legenda ÚNICA — entre os dois gráficos stacked (M5) */}
              <ChartLegend items={subsetorLegendItems} />

              {/* Gráfico 2 — Receita por Subsetor (escala Y PRÓPRIA) */}
              <SectionHeader label="Receita por Subsetor" />
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={recData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  {ChartGrid()}
                  {ChartXAxisMes('mes', { interval: 0 })}
                  {ChartYAxisBRL({ width: 64 })}
                  <Tooltip content={<StackedTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                  {subsetoresPresentes.map((s, idx) => (
                    <Bar
                      key={s}
                      dataKey={s}
                      name={s}
                      stackId="sub"
                      fill={subsetorColor(s)}
                      radius={idx === subsetoresPresentes.length - 1 ? barRadius.top : barRadius.none}
                      barSize={barSizes.column}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Comparação Ano Anterior — SÓLIDO = período atual; TRACEJADO = ano anterior (ref.) */}
          <SectionHeader label="Comparação Ano Anterior (Faturamento)" />
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={yoyMerged} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              {ChartGrid()}
              {ChartXAxisCategoria('label')}
              {ChartYAxisBRL({ width: 64 })}
              <Tooltip content={(p) => (
                <CustomTooltip {...p} showColorDot formatter={(v, n) => [fmtMi(v), n]} />
              )} />
              <Line
                dataKey="atual"
                name="Este período"
                stroke="var(--brand)"
                dot={false}
                strokeWidth={strokeWidths.line}
              />
              <Line
                dataKey="anterior"
                name="Ano anterior"
                stroke={chartColors.axisTick}
                dot={false}
                strokeWidth={strokeWidths.lineDashed}
                strokeDasharray={dashArrays.reference}
              />
            </LineChart>
          </ResponsiveContainer>
          <ChartLegend items={yoyLegendItems} />

          {/* Tendência de Margem */}
          <SectionHeader label="Tendência de Margem" />
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={margemData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              {ChartGrid()}
              {ChartXAxisCategoria('label')}
              {ChartYAxisPct({ width: 44, casas: 0 })}
              <Tooltip content={(p) => (
                <CustomTooltip {...p} showColorDot
                  formatter={(v, n) => [`${v.toFixed(1)}%`, n]} />
              )} />
              <Line
                dataKey="margem_pct"
                name="Margem %"
                stroke="var(--brand-deep)"
                dot={false}
                strokeWidth={strokeWidths.line}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Composição por Subsetor — sem box, mesmo período das pills */}
          <div className="flex items-baseline gap-2 mb-2 mt-6">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">Composição por Subsetor</p>
            <span className="text-[11px]" style={{ color: 'var(--brand)' }}>no período selecionado</span>
          </div>
          <SumarioSubsetorCard data={data.sumario} semBox />
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props { onClose: () => void }

export default function KpiPrincipalDrawer({ onClose }: Props) {
  return (
    <ListDrawer
      titulo="Análise Histórica"
      subtitulo="Análise da evolução histórica de faturamento e receita do setor"
      onClose={onClose}
    >
      <DrawerBody />
    </ListDrawer>
  )
}
