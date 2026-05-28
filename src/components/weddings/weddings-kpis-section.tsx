'use client'

import { useEffect, useState } from 'react'
import { usePeriodoFilter } from '@/components/layout/period-filter-provider'
import { fetchWeddingsKpis } from '@/app/performance/weddings/actions'
import { fmtMi } from '@/lib/fmt'
import { margemColor } from '@/lib/config'
import KpiPrincipalDrawer from './kpi-principal-drawer'
import type { ExecutivaKpis, KpiMetrica, SumarioSubsetor, SumarioSubsetorItem } from '@/types/api'
import type { Benchmarks } from '@/lib/config'

interface Props {
  benchmarks: Benchmarks
}

// ── Subcomponentes inline ────────────────────────────────────────────────────

function KpiColuna({
  rotulo,
  metrica,
  formato,
  padded,
}: {
  rotulo: string
  metrica: KpiMetrica
  formato: 'brl' | 'pct'
  padded?: boolean
}) {
  const valor  = metrica.valor
  const varYoy = metrica.variacao_yoy

  const fmtValor = (v: number | null) => {
    if (v == null) return '—'
    return formato === 'pct'
      ? `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
      : fmtMi(v)
  }

  const fmtVar = (v: number | null, isPP?: boolean) => {
    if (v == null) return null
    const sinal  = v >= 0 ? '+' : ''
    const sufixo = isPP ? ' p.p.' : '%'
    const f      = `${sinal}${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${sufixo}`
    return (
      <span className={v >= 0 ? 'text-success' : 'text-danger'}>
        {v >= 0 ? '↑' : '↓'} {f}
      </span>
    )
  }

  return (
    <div className={padded ? 'pl-4' : ''}>
      <p className="text-[14px] font-semibold text-[--text-muted] uppercase tracking-wide mb-1">{rotulo}</p>
      <p className="text-2xl font-bold tabular-nums mb-1" style={{ color: 'var(--brand)' }}>
        {fmtValor(valor)}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {varYoy != null && (
          <span className="text-xs text-zinc-400">
            YoY: {fmtVar(varYoy, metrica.is_pp)}
          </span>
        )}
      </div>
    </div>
  )
}

function SubsetorCard({
  title,
  subtitle,
  data,
  color,
  yoyFaturamento,
  yoyReceita,
  yoyMargemPct,
}: {
  title: string
  subtitle?: string
  data: SumarioSubsetorItem | null
  color?: string
  yoyFaturamento?: number | null
  yoyReceita?: number | null
  yoyMargemPct?: number | null
}) {
  const yoyFatPct   = data && yoyFaturamento != null && yoyFaturamento > 0
    ? ((data.faturamento - yoyFaturamento) / yoyFaturamento) * 100 : null
  const yoyRecPct   = data && yoyReceita != null && yoyReceita > 0
    ? ((data.receita - yoyReceita) / yoyReceita) * 100 : null
  const yoyMargemPp = data && yoyMargemPct != null
    ? data.margem_pct - yoyMargemPct : null

  const hasYoy = yoyFatPct != null || yoyRecPct != null || yoyMargemPp != null

  const yoyColor = (v: number) => v >= 0 ? 'var(--positive)' : 'var(--negative)'
  const fmtPct   = (v: number) => `${v >= 0 ? '↑' : '↓'}${Math.abs(v).toFixed(1)}%`
  const fmtPp    = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} p.p.`

  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow-sm px-3 py-3.5">
        <div className="mb-2 leading-tight min-h-[28px]">
          <p className="text-[12px] font-semibold text-[--text-muted] uppercase tracking-wide">{title}</p>
          {subtitle && <p className="text-[10px] text-zinc-400 tracking-wide">{subtitle}</p>}
        </div>
        <p className="text-xs text-zinc-400">—</p>
      </div>
    )
  }

  const YoyCol = ({ val, fmt }: { val: number | null; fmt: (v: number) => string }) =>
    val != null
      ? <span className="text-[9px] tabular-nums w-[56px] text-right shrink-0" style={{ color: yoyColor(val) }}>{fmt(val)}</span>
      : hasYoy ? <span className="w-[56px] shrink-0" /> : null

  return (
    <div className="bg-white rounded-lg shadow-sm px-3 py-3.5">
      <div className="mb-2 leading-tight min-h-[28px]">
        <p className="text-[12px] font-semibold text-[--text-muted] uppercase tracking-wide">{title}</p>
        {subtitle && <p className="text-[10px] text-zinc-400 tracking-wide">{subtitle}</p>}
      </div>

      {/* Cabeçalho da coluna YoY */}
      {hasYoy && (
        <div className="flex justify-end mb-0.5">
          <span className="text-[9px] text-zinc-400 w-[56px] text-right">YoY</span>
        </div>
      )}

      {/* Faturamento */}
      <div className="flex items-baseline gap-1 mb-1">
        <p className="text-xl font-bold tabular-nums flex-1" style={{ color: color ?? 'var(--brand)' }}>
          {fmtMi(data.faturamento)}
        </p>
        <YoyCol val={yoyFatPct} fmt={fmtPct} />
      </div>

      <div className="h-px bg-zinc-100 my-1.5" />

      {/* Receita */}
      <div className="flex items-baseline gap-1">
        <span className="text-[10px] text-zinc-400 shrink-0">Receita</span>
        <span className="text-[10px] font-medium tabular-nums text-zinc-600 flex-1 text-right">{fmtMi(data.receita)}</span>
        <YoyCol val={yoyRecPct} fmt={fmtPct} />
      </div>

      {/* Margem */}
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-[10px] text-zinc-400 shrink-0">Margem</span>
        <span className={`text-[10px] font-semibold tabular-nums flex-1 text-right ${margemColor(data.margem_pct)}`}>
          {data.margem_pct.toFixed(1)}%
        </span>
        <YoyCol val={yoyMargemPp} fmt={fmtPp} />
      </div>
    </div>
  )
}

// ── Mapeamento de subsetores ─────────────────────────────────────────────────

const SUBSETOR_LABELS: Record<string, string> = {
  'CONVIDADOS - Hospedagens': 'Convidados – Hospedagens',
  'CONVIDADOS - Extras':      'Convidados – Extras',
  'PRODUÇÃO':                 'Produção',
  PLANEJAMENTO:               'Planejamento',
  COMERCIAL:                  'Comercial',
}

const SUBSETOR_COLORS: Record<string, string> = {
  COMERCIAL:                  'var(--subsetor-comercial)',
  'CONVIDADOS - Hospedagens': 'var(--subsetor-hospedagens)',
  'CONVIDADOS - Extras':      'var(--subsetor-extras)',
  'PRODUÇÃO':                 'var(--subsetor-producao)',
  PLANEJAMENTO:               'var(--subsetor-planejamento)',
}
const SUBSETOR_COLOR_FALLBACK = '#BA7517'

const SUBSETOR_ORDER = [
  'COMERCIAL',
  'PLANEJAMENTO',
  'PRODUÇÃO',
  'CONVIDADOS - Hospedagens',
  'CONVIDADOS - Extras',
]

// ── Componente principal ─────────────────────────────────────────────────────

export default function WeddingsKpisSection({ benchmarks: _benchmarks }: Props) {
  const { from, to, antFrom, antTo, yoyFrom, yoyTo } = usePeriodoFilter()

  const [kpis, setKpis]               = useState<ExecutivaKpis | null>(null)
  const [sumario, setSumario]         = useState<SumarioSubsetor | null>(null)
  const [sumarioYoy, setSumarioYoy]   = useState<SumarioSubsetor | null>(null)
  const [loading, setLoading]         = useState(true)
  const [drawerOpen, setDrawerOpen]   = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchWeddingsKpis(from, to, antFrom, antTo, yoyFrom, yoyTo).then(data => {
      if (cancelled) return
      setKpis(data.kpis)
      setSumario(data.sumario)
      setSumarioYoy(data.sumarioYoy)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [from, to, antFrom, antTo, yoyFrom, yoyTo])

  const subsetores    = sumario?.subsetores ?? []
  const subsetoresYoy = sumarioYoy?.subsetores ?? []

  if (loading || !kpis) {
    return (
      <div>
        {/* Skeleton card principal */}
        <div className="bg-zinc-100 animate-pulse rounded-xl h-24 mb-4" />
        {/* Skeleton subsetores */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-zinc-100 animate-pulse rounded-lg h-24" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Card principal full-width */}
      <div
        className="bg-white rounded-xl shadow-sm px-5 pt-4 pb-2 mb-4 cursor-pointer hover:bg-zinc-50 transition-colors"
        onClick={() => setDrawerOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setDrawerOpen(true)}
        aria-label="Abrir análise detalhada de KPIs"
      >
        {/* Grid 3 colunas */}
        <div className="grid grid-cols-3 gap-4 divide-x divide-zinc-100">
          <KpiColuna rotulo="Faturamento"   metrica={kpis.faturamento} formato="brl" />
          <KpiColuna rotulo="Receita Bruta" metrica={kpis.receita}     formato="brl" padded />
          <KpiColuna rotulo="Margem"        metrica={kpis.margem_pct}  formato="pct" padded />
        </div>
        <div className="flex justify-end mt-2">
          <span className="text-[11px] text-[--brand] font-medium">Ver mais ›</span>
        </div>
      </div>

      {/* Cards de subsetor */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {SUBSETOR_ORDER.map(key => {
          const s            = subsetores.find(x => x.subsetor === key)
          const yoyItem      = subsetoresYoy.find(x => x.subsetor === key)
          const isConvidados = key.startsWith('CONVIDADOS - ')
          const title    = isConvidados ? 'Convidados' : (SUBSETOR_LABELS[key] ?? key)
          const subtitle = isConvidados ? key.replace('CONVIDADOS - ', '') : undefined
          const color    = SUBSETOR_COLORS[key] ?? SUBSETOR_COLOR_FALLBACK
          return (
            <SubsetorCard
              key={key}
              title={title}
              subtitle={subtitle}
              data={s ?? null}
              color={color}
              yoyFaturamento={yoyItem?.faturamento   ?? null}
              yoyReceita={yoyItem?.receita            ?? null}
              yoyMargemPct={yoyItem?.margem_pct       ?? null}
            />
          )
        })}
      </div>

      {drawerOpen && (
        <KpiPrincipalDrawer onClose={() => setDrawerOpen(false)} />
      )}
    </div>
  )
}
