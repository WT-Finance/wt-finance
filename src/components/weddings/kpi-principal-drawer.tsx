'use client'

import { useEffect, useRef, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { fmtMi } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'
import SumarioSubsetorCard from '@/components/weddings/sumario-subsetor'
import type { WeddingsDrawerData, SumarioSubsetor } from '@/types/api'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

// ── Helpers ──────────────────────────────────────────────────────────────────

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function fmtMesLabel(mes: string) {
  const [, m] = mes.split('-')
  return MESES_ABREV[parseInt(m, 10) - 1]
}

// ── Period pills ─────────────────────────────────────────────────────────────

type PillId = 'este-ano' | 'este-mes' | 'mes-anterior' | 'ult-3m' | 'ult-6m' | 'custom'

const PILLS: { id: PillId; label: string }[] = [
  { id: 'este-ano',     label: 'Este ano'     },
  { id: 'este-mes',     label: 'Este mês'      },
  { id: 'mes-anterior', label: 'Mês anterior'  },
  { id: 'ult-3m',       label: 'Últ. 3 meses'  },
  { id: 'ult-6m',       label: 'Últ. 6 meses'  },
  { id: 'custom',       label: 'Personalizado' },
]

function pillToDates(pill: PillId): { from: string; to: string } | null {
  const today  = new Date()
  const y      = today.getFullYear()
  const m      = today.getMonth()

  const toISO  = (d: Date) => d.toISOString().slice(0, 10)
  const firstOf = (year: number, month: number) => new Date(year, month, 1)
  const lastOf  = (year: number, month: number) => new Date(year, month + 1, 0)

  switch (pill) {
    case 'este-ano':
      return { from: `${y}-01-01`, to: toISO(lastOf(y, 11)) }
    case 'este-mes':
      return { from: toISO(firstOf(y, m)), to: toISO(lastOf(y, m)) }
    case 'mes-anterior': {
      const pm = m === 0 ? 11 : m - 1
      const py = m === 0 ? y - 1 : y
      return { from: toISO(firstOf(py, pm)), to: toISO(lastOf(py, pm)) }
    }
    case 'ult-3m': {
      const from3 = new Date(y, m - 2, 1)
      return { from: toISO(from3), to: toISO(lastOf(y, m)) }
    }
    case 'ult-6m': {
      const from6 = new Date(y, m - 5, 1)
      return { from: toISO(from6), to: toISO(lastOf(y, m)) }
    }
    case 'custom':
      return null
  }
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function DrawerTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-medium text-zinc-700 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="tabular-nums" style={{ color: p.color }}>
          {p.name}: {fmtMi(p.value)}
        </p>
      ))}
    </div>
  )
}

function TendenciaTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-medium text-zinc-700 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="tabular-nums" style={{ color: p.color }}>
          {p.name}: {p.name === 'Margem %' ? `${p.value}%` : String(Math.round(p.value))}
        </p>
      ))}
    </div>
  )
}

// ── MetricBox ─────────────────────────────────────────────────────────────────

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 rounded-lg px-3 py-2.5 text-center">
      <p className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--brand)' }}>{value}</p>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2 mt-5">{label}</p>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-zinc-100 animate-pulse rounded h-48" />
      <div className="bg-zinc-100 animate-pulse rounded h-32" />
      <div className="bg-zinc-100 animate-pulse rounded h-24" />
    </div>
  )
}

// ── Drawer body ───────────────────────────────────────────────────────────────

function DrawerBody() {
  const [activePill, setActivePill]         = useState<PillId>('este-ano')
  const [data, setData]                     = useState<WeddingsDrawerData | null>(null)
  const [loading, setLoading]               = useState(false)
  const [customFrom, setCustomFrom]         = useState('')
  const [customTo, setCustomTo]             = useState('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [activeDates, setActiveDates]       = useState<{ from: string; to: string } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

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
    const supabase = getBrowserClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase.rpc as any)('get_kpi_weddings_drawer', { p_from: activeDates.from, p_to: activeDates.to })
      .then(({ data: res }: { data: unknown }) => {
        if (cancelled) return
        setData((res as WeddingsDrawerData) ?? null)
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
    setActiveDates({ from: customFrom, to: customTo })
  }

  const pillClass = (pill: PillId) => [
    'text-[11px] px-2.5 py-0.5 rounded-full border transition-colors',
    activePill === pill
      ? 'bg-zinc-800 text-white border-zinc-800'
      : 'text-zinc-500 border-zinc-200 hover:border-zinc-400 hover:text-zinc-700',
  ].join(' ')

  // Build YoY merged data
  const yoyMerged = (() => {
    if (!data?.series?.length) return []
    return data.series.map((s, i) => {
      const yoy = data.yoy_series[i]
      return {
        label: fmtMesLabel(s.mes),
        atual: s.faturamento,
        anterior: yoy?.faturamento ?? 0,
      }
    })
  })()

  // Build SumarioSubsetor shape
  const sumarioData: SumarioSubsetor | null = data && activeDates ? {
    periodo:   { inicio: activeDates.from, fim: activeDates.to },
    subsetores: data.subsetores,
    total: {
      n_vendas:    data.totais.n_vendas,
      faturamento: data.totais.faturamento,
      receita:     data.totais.receita,
      margem_pct:  data.totais.margem_pct,
    },
  } : null

  return (
    <div>
      {/* Pills row */}
      <div className="relative mb-4" ref={popoverRef}>
        <div className="flex flex-wrap items-center gap-1.5">
          {PILLS.map(p => (
            <button
              key={p.id}
              className={pillClass(p.id)}
              onClick={() => handlePillClick(p.id)}
              disabled={loading}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date picker popover */}
        {showCustomPicker && (
          <div className="absolute top-full left-0 mt-2 z-50 bg-white border border-zinc-200 rounded-xl shadow-lg p-4 w-64">
            <p className="text-[11px] font-medium text-zinc-500 mb-3">Período personalizado</p>
            <div className="space-y-2 mb-4">
              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">De</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded px-2 py-1 text-zinc-700 focus:outline-none focus:border-zinc-400"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">Até</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
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
                className="flex-1 text-[11px] text-white py-1.5 rounded transition-colors"
                style={{ background: 'var(--brand)' }}
              >
                Aplicar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Loading or charts */}
      {loading ? (
        <LoadingSkeleton />
      ) : !data ? (
        <p className="text-xs text-zinc-400 text-center py-8">Selecione um período</p>
      ) : (
        <div>
          {/* 1. Faturamento e Receita mensais */}
          <SectionHeader label="Faturamento e Receita" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tickFormatter={fmtMesLabel} tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={v => fmtMi(v)} width={60} tick={{ fontSize: 10 }} />
              <Tooltip content={<DrawerTooltip />} />
              <Bar dataKey="faturamento" name="Faturamento" fill="var(--brand)"      radius={[2, 2, 0, 0]} />
              <Bar dataKey="receita"     name="Receita"     fill="var(--brand-deep)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* 2. Comparação YoY */}
          <SectionHeader label="Comparação Ano Anterior (Faturamento)" />
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={yoyMerged} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={v => fmtMi(v)} width={60} tick={{ fontSize: 10 }} />
              <Tooltip content={<DrawerTooltip />} />
              <Line
                dataKey="atual"
                name="Este período"
                stroke="var(--brand)"
                dot={false}
                strokeWidth={2}
              />
              <Line
                dataKey="anterior"
                name="Ano anterior"
                stroke="#aaa"
                dot={false}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            </LineChart>
          </ResponsiveContainer>

          {/* 3. Tendências — Margem % e Nº Vendas */}
          <SectionHeader label="Tendências — Margem e Nº de Vendas" />
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tickFormatter={fmtMesLabel} tick={{ fontSize: 10 }} />
              <YAxis
                yAxisId="left"
                orientation="left"
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 10 }}
                width={40}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={v => String(Math.round(v))}
                tick={{ fontSize: 10 }}
                width={30}
              />
              <Tooltip content={<TendenciaTooltip />} />
              <Bar
                dataKey="n_vendas"
                name="Nº Vendas"
                fill="var(--brand-soft)"
                yAxisId="right"
                radius={[2, 2, 0, 0]}
              />
              <Line
                dataKey="margem_pct"
                name="Margem %"
                stroke="var(--brand-deep)"
                dot={false}
                yAxisId="left"
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* 4. Métricas inline */}
          <div className="grid grid-cols-3 gap-3 my-4">
            <MetricBox label="Ticket Médio"  value={fmtMi(data.totais.ticket_medio)}  />
            <MetricBox label="Receita Média" value={fmtMi(data.totais.receita_media)} />
            <MetricBox label="Nº de Vendas"  value={String(data.totais.n_vendas)}     />
          </div>

          {/* 5. Composição por subsetor */}
          <SectionHeader label="Composição por Subsetor" />
          <SumarioSubsetorCard data={sumarioData} />
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props { onClose: () => void }

export default function KpiPrincipalDrawer({ onClose }: Props) {
  return (
    <ListDrawer titulo="Análise Weddings" onClose={onClose}>
      <DrawerBody />
    </ListDrawer>
  )
}
