'use client'

import { useEffect, useRef, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { fmtMi } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'
import SumarioSubsetorCard from '@/components/weddings/sumario-subsetor'
import type { TendenciaMargem, ExecutivaKpis, SumarioSubsetor } from '@/types/api'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

// ── Drawer data shape ─────────────────────────────────────────────────────────

interface DrawerData {
  tendencia:    TendenciaMargem | null
  yoyTendencia: TendenciaMargem | null
  kpis:         ExecutivaKpis | null
  sumario:      SumarioSubsetor | null
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
  const today   = new Date()
  const y       = today.getFullYear()
  const m       = today.getMonth()

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
  const [activePill, setActivePill]             = useState<PillId>('este-ano')
  const [data, setData]                         = useState<DrawerData | null>(null)
  const [loading, setLoading]                   = useState(false)
  const [customFrom, setCustomFrom]             = useState('')
  const [customTo, setCustomTo]                 = useState('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [activeDates, setActiveDates]           = useState<{ from: string; to: string } | null>(null)
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
    ]).then(([tendRes, yoyRes, kpisRes, sumRes]) => {
      if (cancelled) return
      setData({
        tendencia:    (tendRes.data as TendenciaMargem) ?? null,
        yoyTendencia: (yoyRes.data as TendenciaMargem)  ?? null,
        kpis:         (kpisRes.data as ExecutivaKpis)   ?? null,
        sumario:      (sumRes.data as SumarioSubsetor)  ?? null,
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
    setActiveDates({ from: customFrom, to: customTo })
  }

  const pillClass = (pill: PillId) => [
    'text-[11px] px-2.5 py-0.5 rounded-full border transition-colors',
    activePill === pill
      ? 'bg-zinc-800 text-white border-zinc-800'
      : 'text-zinc-500 border-zinc-200 hover:border-zinc-400 hover:text-zinc-700',
  ].join(' ')

  // Chart data helpers
  const faturamentoData = data?.tendencia?.pontos ?? []

  const yoyMerged = (data?.tendencia?.pontos ?? []).map((p, i) => ({
    label:    p.label,
    atual:    p.faturamento,
    anterior: data?.yoyTendencia?.pontos[i]?.faturamento ?? 0,
  }))

  const margemData = data?.tendencia?.pontos ?? []

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
          {/* 1. Faturamento e Receita */}
          <SectionHeader label="Faturamento e Receita" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={faturamentoData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={v => fmtMi(v)} width={60} tick={{ fontSize: 10 }} />
              <Tooltip content={<DrawerTooltip />} />
              <Bar dataKey="faturamento" name="Faturamento" fill="var(--brand)"      radius={[2, 2, 0, 0]} />
              <Bar dataKey="receita"     name="Receita"     fill="var(--brand-deep)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* 2. Comparação Ano Anterior */}
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

          {/* 3. Tendência de Margem */}
          <SectionHeader label="Tendência de Margem" />
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={margemData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={v => `${v}%`} width={40} tick={{ fontSize: 10 }} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="bg-white border border-zinc-200 rounded-lg shadow-md px-3 py-2 text-xs">
                    <p className="font-medium text-zinc-700 mb-1">{label}</p>
                    {payload.map((p) => (
                      <p key={String(p.name)} className="tabular-nums" style={{ color: p.color }}>
                        {p.name}: {typeof p.value === 'number' ? `${p.value.toFixed(1)}%` : String(p.value)}
                      </p>
                    ))}
                  </div>
                )
              }} />
              <Line
                dataKey="margem_pct"
                name="Margem %"
                stroke="var(--brand-deep)"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* 4. Indicadores */}
          <div className="grid grid-cols-3 gap-3 my-4">
            <MetricBox label="Faturamento"  value={fmtMi(data.kpis?.faturamento?.valor  ?? 0)} />
            <MetricBox label="Receita"      value={fmtMi(data.kpis?.receita?.valor      ?? 0)} />
            <MetricBox label="Margem"       value={`${(data.kpis?.margem_pct?.valor     ?? 0).toFixed(1)}%`} />
            <MetricBox label="Nº Vendas"    value={String(data.kpis?.vendas?.valor      ?? 0)} />
            <MetricBox label="Ticket Médio" value={fmtMi(data.kpis?.ticket_medio?.valor ?? 0)} />
            <MetricBox label="Rec. Média"   value={fmtMi(data.kpis?.receita_media?.valor ?? 0)} />
          </div>

          {/* 5. Composição por Subsetor */}
          <SectionHeader label="Composição por Subsetor" />
          <SumarioSubsetorCard data={data.sumario} />
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
