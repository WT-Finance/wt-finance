'use client'

import { useEffect, useState } from 'react'
import { usePeriodoFilter } from '@/components/layout/period-filter-provider'
import { fetchWeddingsKpis } from '@/app/performance/weddings/actions'
import { fmtMi } from '@/lib/fmt'
import { margemColor, subsetorColor, SUBSETOR_LABELS, SUBSETOR_ORDER } from '@/lib/config'
import KpiPrincipalDrawer from './kpi-principal-drawer'
import KpiColuna from '@/components/shared/kpi-coluna'
import type { ExecutivaKpis, SumarioSubsetor, SumarioSubsetorItem } from '@/types/api'
import type { Benchmarks } from '@/lib/config'

interface Props {
  benchmarks: Benchmarks
}

// ── Helpers de formatação YoY (nível de módulo) ──────────────────────────────

const yoyColor = (v: number) => v >= 0 ? 'var(--positive)' : 'var(--negative)'
const fmtPct   = (v: number) => `${v >= 0 ? '↑' : '↓'}${Math.abs(v).toFixed(1)}%`
const fmtPp    = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} p.p.`

// Coluna YoY — extraída para o nível do módulo (não criar componentes durante o
// render). `hasYoy` controla o placeholder que mantém o alinhamento das colunas.
function YoyCol({ val, fmt, hasYoy }: { val: number | null; fmt: (v: number) => string; hasYoy: boolean }) {
  if (val != null) {
    return <span className="text-[9px] tabular-nums w-[56px] text-right shrink-0" style={{ color: yoyColor(val) }}>{fmt(val)}</span>
  }
  return hasYoy ? <span className="w-[56px] shrink-0" /> : null
}

// ── Subcomponentes inline ────────────────────────────────────────────────────

function SubsetorCard({
  title,
  subtitle,
  data,
  color,
  modo = 'faturamento',
  yoyFaturamento,
  yoyReceita,
  yoyMargemPct,
  yoyContratos,
}: {
  title: string
  subtitle?: string
  data: SumarioSubsetorItem | null
  color?: string
  modo?: 'faturamento' | 'contratos'
  yoyFaturamento?: number | null
  yoyReceita?: number | null
  yoyMargemPct?: number | null
  yoyContratos?: number | null
}) {
  const isContratos = modo === 'contratos'
  const nContratos  = data?.n_contratos ?? 0

  // YoY do valor principal: contagem de contratos OU faturamento, conforme o modo
  const yoyPrincipalPct = isContratos
    ? (data && yoyContratos != null && yoyContratos > 0
        ? ((nContratos - yoyContratos) / yoyContratos) * 100 : null)
    : (data && yoyFaturamento != null && yoyFaturamento > 0
        ? ((data.faturamento - yoyFaturamento) / yoyFaturamento) * 100 : null)
  const yoyRecPct   = data && yoyReceita != null && yoyReceita > 0
    ? ((data.receita - yoyReceita) / yoyReceita) * 100 : null
  const yoyMargemPp = data && yoyMargemPct != null
    ? data.margem_pct - yoyMargemPct : null

  const hasYoy = yoyPrincipalPct != null || yoyRecPct != null || yoyMargemPp != null

  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow-sm px-3 py-3.5 flex flex-col h-full">
        <div className="mb-2 leading-tight min-h-[28px]">
          <p className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">{title}</p>
          {subtitle && <p className="text-[10px] text-zinc-400 tracking-wide">{subtitle}</p>}
        </div>
        <p className="text-xs text-zinc-400">—</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm px-3 py-3.5 flex flex-col h-full">
      <div className="mb-2 leading-tight min-h-[28px]">
        <p className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">{title}</p>
        {subtitle && <p className="text-[10px] text-zinc-400 tracking-wide">{subtitle}</p>}
      </div>

      {/* Cabeçalho da coluna YoY */}
      {hasYoy && (
        <div className="flex justify-end mb-0.5">
          <span className="text-[9px] text-zinc-400 w-[56px] text-right">YoY</span>
        </div>
      )}

      {/* Valor principal: nº de contratos (Comercial) ou faturamento */}
      <div className="flex items-baseline gap-1 mb-1">
        <p className="text-xl lg:text-lg font-bold tabular-nums flex-1 whitespace-nowrap" style={{ color: color ?? 'var(--brand)' }}>
          {isContratos ? (
            <>
              {nContratos}
              <span className="text-[10px] font-medium text-zinc-400 ml-1">contratos</span>
            </>
          ) : (
            fmtMi(data.faturamento)
          )}
        </p>
        <YoyCol val={yoyPrincipalPct} fmt={fmtPct} hasYoy={hasYoy} />
      </div>

      <div className="h-px bg-zinc-100 mt-auto mb-1.5" />

      {/* Receita */}
      <div className="flex items-baseline gap-1">
        <span className="text-[10px] text-zinc-400 shrink-0">Receita</span>
        <span className="text-[10px] font-medium tabular-nums text-zinc-600 flex-1 text-right">{fmtMi(data.receita)}</span>
        <YoyCol val={yoyRecPct} fmt={fmtPct} hasYoy={hasYoy} />
      </div>

      {/* Margem */}
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-[10px] text-zinc-400 shrink-0">Margem</span>
        <span className={`text-[10px] font-semibold tabular-nums flex-1 text-right ${margemColor(data.margem_pct)}`}>
          {data.margem_pct.toFixed(1)}%
        </span>
        <YoyCol val={yoyMargemPp} fmt={fmtPp} hasYoy={hasYoy} />
      </div>
    </div>
  )
}

// Mapeamento de subsetores (cores/rótulos/ordem/fallback) vem de @/lib/config —
// fonte única. Fallback de subsetor desconhecido = var(--brand) (não mais #BA7517
// hardcoded, que divergia do drawer). v4.10/ADR-0103.

// ── Componente principal ─────────────────────────────────────────────────────

export default function WeddingsKpisSection({ benchmarks: _benchmarks }: Props) {
  void _benchmarks
  const { from, to, antFrom, antTo, yoyFrom, yoyTo } = usePeriodoFilter()

  const [kpis, setKpis]               = useState<ExecutivaKpis | null>(null)
  const [sumario, setSumario]         = useState<SumarioSubsetor | null>(null)
  const [sumarioYoy, setSumarioYoy]   = useState<SumarioSubsetor | null>(null)
  // `loadedKey` é a combinação de filtros à qual os dados em estado correspondem.
  // `loading` é DERIVADO (chave atual ≠ chave carregada) em vez de um setState
  // síncrono no corpo do effect — mantém o mesmo comportamento visual (skeleton
  // enquanto a busca da chave corrente não retornou).
  const [loadedKey, setLoadedKey]     = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen]   = useState(false)

  const currentKey = `${from}|${to}|${antFrom}|${antTo}|${yoyFrom}|${yoyTo}`
  const loading = loadedKey !== currentKey || !kpis

  useEffect(() => {
    let cancelled = false
    fetchWeddingsKpis(from, to, antFrom, antTo, yoyFrom, yoyTo).then(data => {
      if (cancelled) return
      setKpis(data.kpis)
      setSumario(data.sumario)
      setSumarioYoy(data.sumarioYoy)
      setLoadedKey(currentKey)
    })
    return () => { cancelled = true }
  }, [from, to, antFrom, antTo, yoyFrom, yoyTo, currentKey])

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
        className="card-clicavel bg-white rounded-xl shadow-sm px-5 pt-4 pb-2 mb-4 cursor-pointer"
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
          <span className="card-clicavel-cta text-[11px] text-[var(--brand)] font-medium">Ver mais ›</span>
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
          const color    = subsetorColor(key)
          return (
            <SubsetorCard
              key={key}
              title={title}
              subtitle={subtitle}
              data={s ?? null}
              color={color}
              modo={key === 'COMERCIAL' ? 'contratos' : 'faturamento'}
              yoyFaturamento={yoyItem?.faturamento   ?? null}
              yoyReceita={yoyItem?.receita            ?? null}
              yoyMargemPct={yoyItem?.margem_pct       ?? null}
              yoyContratos={yoyItem?.n_contratos      ?? null}
            />
          )
        })}
      </div>

      {drawerOpen && (
        <KpiPrincipalDrawer setor="Weddings" onClose={() => setDrawerOpen(false)} />
      )}
    </div>
  )
}
