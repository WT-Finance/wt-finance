import type { KpiMetrica, PeriodoRef } from '@/types/api'
import { fmtBRL, fmtMi } from '@/lib/fmt'
import { margemColor } from '@/lib/config'

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

function fmtPeriodoLabel(p: PeriodoRef): string {
  const fmt = (s: string) => {
    const [y, m, d] = s.split('-')
    return `${d}/${m}`
  }
  return `${fmt(p.from)}–${fmt(p.to)}`
}

interface KpiCardProps {
  rotulo: string
  metrica: KpiMetrica
  formato: 'brl' | 'pct' | 'numero'
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
  rotulo, metrica, formato, periodoAnterior, periodoYoY,
  benchmarkAlvo, benchmarkAtencao, isPeriodoProporcional,
}: KpiCardProps) {
  const vsAlvo = benchmarkAlvo != null && metrica.valor != null
    ? metrica.valor - benchmarkAlvo
    : null

  const valorColor = benchmarkAlvo != null
    ? margemColor(metrica.valor, benchmarkAlvo, benchmarkAtencao)
    : 'text-zinc-900'

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums leading-none ${valorColor}`}>
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
                vs {fmtPeriodoLabel(periodoAnterior)}
              </span>
            )}
          </div>
        )}
        {metrica.variacao_yoy != null && (
          <div className="flex items-center gap-1">
            <Variacao pct={metrica.variacao_yoy} isPP={metrica.is_pp} label="YoY" />
            {periodoYoY && (
              <span className="text-xs text-zinc-300">
                {fmtPeriodoLabel(periodoYoY)}
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
    <div className="bg-white rounded-xl border border-zinc-200 p-4 animate-pulse">
      <div className="h-3 w-24 rounded bg-zinc-200" />
      <div className="mt-2 h-7 w-32 rounded bg-zinc-200" />
      <div className="mt-2 space-y-1">
        <div className="h-3 w-20 rounded bg-zinc-100" />
        <div className="h-3 w-16 rounded bg-zinc-100" />
      </div>
    </div>
  )
}
