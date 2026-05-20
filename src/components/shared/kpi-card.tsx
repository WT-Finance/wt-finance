import type { KpiMetrica, PeriodoRef } from '@/types/api'
import { fmtMi } from '@/lib/fmt'
import { margemColor } from '@/lib/config'

function fmtExato(v: number | null, formato: 'brl' | 'pct' | 'numero'): string {
  if (v == null) return '—'
  if (formato === 'brl')    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
  if (formato === 'pct')    return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
  if (formato === 'numero') return v.toLocaleString('pt-BR')
  return String(v)
}

function fmtValor(v: number | null, formato: 'brl' | 'pct' | 'numero'): string {
  if (v == null) return '—'
  if (formato === 'brl')     return fmtMi(v)
  if (formato === 'pct')     return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
  if (formato === 'numero')  return v.toLocaleString('pt-BR')
  return String(v)
}

function Variacao({
  pct, isPP, label,
}: { pct: number | null; isPP?: boolean; label?: string }) {
  if (pct == null) return null

  const absVal = Math.abs(pct)
  const isPos  = pct >= 0
  const isNeutral = absVal < 0.5

  const color = isNeutral
    ? 'text-zinc-400'
    : isPos ? 'text-emerald-600' : 'text-red-500'

  const arrow = isNeutral ? '' : isPos ? '↑' : '↓'
  const sign  = isNeutral ? '' : isPos ? '+' : ''
  const suffix = isPP ? ' p.p.' : '%'

  const formatted = `${sign}${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix}`

  return (
    <span className={`text-xs ${color}`}>
      {arrow && <span className="mr-0.5">{arrow}</span>}
      {label && <span className="text-zinc-400 mr-1">{label}</span>}
      {formatted}
    </span>
  )
}

const MESES_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

function fmtPeriodoLabel(p: PeriodoRef, anoAtual?: number): string {
  const ano = parseInt(p.from.split('-')[0], 10)
  const comAno = anoAtual != null && ano !== anoAtual

  if (comAno) {
    const [yFrom, mFrom] = p.from.split('-')
    const [yTo,   mTo  ] = p.to.split('-')
    const lFrom = `${MESES_SHORT[parseInt(mFrom, 10) - 1]}/${yFrom.slice(2)}`
    const lTo   = `${MESES_SHORT[parseInt(mTo,   10) - 1]}/${yTo.slice(2)}`
    return lFrom === lTo ? lFrom : `${lFrom}–${lTo}`
  }

  const fmt = (s: string) => { const [, m, d] = s.split('-'); return `${d}/${m}` }
  return `${fmt(p.from)}–${fmt(p.to)}`
}

interface KpiCardProps {
  rotulo: string
  metrica: KpiMetrica
  formato: 'brl' | 'pct' | 'numero'
  /** Fórmula exibida no tooltip ao passar o mouse no rótulo. */
  formula?: string
  periodoAtual?: PeriodoRef
  periodoAnterior?: PeriodoRef
  periodoYoY?: PeriodoRef
  /** Quando fornecido, exibe linha "vs alvo" em p.p. e colore o valor (use para Margem %). */
  benchmarkAlvo?: number
  /** Limite de atenção para coloração do valor (âmbar se abaixo deste, verde se acima do alvo). */
  benchmarkAtencao?: number
  /** Quando true, exibe aviso de período proporcional abaixo do valor. */
  isPeriodoProporcional?: boolean
}

export default function KpiCard({
  rotulo, metrica, formato, formula,
  periodoAtual, periodoAnterior, periodoYoY,
  benchmarkAlvo, benchmarkAtencao, isPeriodoProporcional,
}: KpiCardProps) {
  const anoAtual = periodoAtual ? parseInt(periodoAtual.from.split('-')[0], 10) : undefined
  const vsAlvo = benchmarkAlvo != null && metrica.valor != null
    ? metrica.valor - benchmarkAlvo
    : null

  const valorColor = benchmarkAlvo != null
    ? margemColor(metrica.valor, benchmarkAlvo, benchmarkAtencao)
    : 'text-zinc-900'

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)] h-full">
      <div className="relative group/tip">
        <p className="text-[11px] font-semibold text-[--text-muted] uppercase tracking-[0.5px] cursor-default">{rotulo}</p>
        {formula && (
          <div className="pointer-events-none absolute left-0 top-5 z-20 invisible group-hover/tip:visible
                          bg-zinc-800 text-white text-[11px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
            {formula}
            {metrica.valor != null && (
              <span className="ml-2 text-zinc-300">{fmtExato(metrica.valor, formato)}</span>
            )}
          </div>
        )}
      </div>
      <p className={`mt-2 text-3xl font-extrabold tabular-nums leading-none ${valorColor}`}>
        {fmtValor(metrica.valor, formato)}
      </p>
      {isPeriodoProporcional && (
        <p className="mt-0.5 text-[10px] text-zinc-300 leading-none">período proporcional</p>
      )}
      <div className="mt-2 space-y-0.5">
        {metrica.variacao_anterior != null && (
          <div className="flex items-center gap-1">
            <Variacao pct={metrica.variacao_anterior} isPP={metrica.is_pp} />
            {periodoAnterior && (
              <span className="text-xs text-zinc-300">
                vs {fmtPeriodoLabel(periodoAnterior, anoAtual)}
              </span>
            )}
          </div>
        )}
        {metrica.variacao_yoy != null && (
          <div className="flex items-center gap-1">
            <Variacao pct={metrica.variacao_yoy} isPP={metrica.is_pp} label="YoY" />
            {periodoYoY && (
              <span className="text-xs text-zinc-300">
                {fmtPeriodoLabel(periodoYoY, anoAtual)}
              </span>
            )}
          </div>
        )}
        {vsAlvo != null && (
          <div className="flex items-center gap-1">
            <Variacao pct={vsAlvo} isPP label="vs alvo" />
            <span className="text-xs text-zinc-300">({benchmarkAlvo}%)</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function KpiCardSkeleton() {
  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)] animate-pulse">
      <div className="h-3 w-24 rounded bg-zinc-200" />
      <div className="mt-2 h-7 w-32 rounded bg-zinc-200" />
      <div className="mt-2 space-y-1">
        <div className="h-3 w-20 rounded bg-zinc-100" />
        <div className="h-3 w-16 rounded bg-zinc-100" />
      </div>
    </div>
  )
}
