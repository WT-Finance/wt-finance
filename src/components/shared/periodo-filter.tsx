'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useEffect } from 'react'
import { resolvePeriodo, type PresetPeriodo } from '@/lib/periodo'
import { format } from 'date-fns'

const PRESETS: { value: PresetPeriodo; label: string }[] = [
  { value: 'este-mes',          label: 'Este mês'            },
  { value: 'mes-passado',       label: 'Mês anterior'        },
  { value: 'ultimos-3-meses',   label: 'Últimos 3 meses'     },
  { value: 'ultimos-6-meses',   label: 'Últimos 6 meses'     },
  { value: 'este-ano',          label: 'Este ano (YTD)'      },
  { value: 'personalizado',     label: 'Personalizado'       },
]

const LS_KEY = 'wt-periodo-filter'
const ISO = (d: Date) => format(d, 'yyyy-MM-dd')
const MIN_DATE = '2024-01-01'
const MAX_DATE = ISO(new Date())

interface Props {
  defaultPreset?: PresetPeriodo
}

export default function PeriodoFilter({ defaultPreset = 'este-mes' }: Props) {
  const router      = useRouter()
  const pathname    = usePathname()
  const searchParams = useSearchParams()

  const preset  = (searchParams.get('preset') as PresetPeriodo | null) ?? defaultPreset
  const fromVal = searchParams.get('from') ?? ''
  const toVal   = searchParams.get('to')   ?? ''

  // persist to localStorage so switching tabs keeps the same period
  useEffect(() => {
    const current = { preset, from: fromVal, to: toVal }
    try { localStorage.setItem(LS_KEY, JSON.stringify(current)) } catch {}
  }, [preset, fromVal, toVal])

  // on first mount with no search params, restore from localStorage
  useEffect(() => {
    if (searchParams.size > 0) return
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')
      if (saved?.preset) push(saved.preset, saved.from, saved.to)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const push = useCallback((p: PresetPeriodo, from?: string, to?: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('preset', p)
    if (p === 'personalizado') {
      if (from) params.set('from', from); else params.delete('from')
      if (to)   params.set('to',   to);   else params.delete('to')
    } else {
      params.delete('from')
      params.delete('to')
    }
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  const selectClass =
    'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={preset}
        onChange={e => push(e.target.value as PresetPeriodo)}
        className={selectClass}
      >
        {PRESETS.map(p => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      {preset === 'personalizado' && (
        <>
          <input
            type="date" value={fromVal} min={MIN_DATE} max={toVal || MAX_DATE}
            onChange={e => push('personalizado', e.target.value, toVal)}
            className={selectClass}
          />
          <span className="text-zinc-400 text-sm">até</span>
          <input
            type="date" value={toVal} min={fromVal || MIN_DATE} max={MAX_DATE}
            onChange={e => push('personalizado', fromVal, e.target.value)}
            className={selectClass}
          />
        </>
      )}
    </div>
  )
}

/** Resolve os search params da URL em um Periodo concreto { from, to } em ISO strings. */
export function resolverPeriodoFromParams(params: {
  preset?: string | null
  from?: string | null
  to?: string | null
  defaultPreset?: PresetPeriodo
}): { from: string; to: string } {
  const preset = (params.preset as PresetPeriodo | null) ?? params.defaultPreset ?? 'este-mes'

  if (preset === 'personalizado' && params.from && params.to) {
    return { from: params.from, to: params.to }
  }

  const periodo = resolvePeriodo(preset)
  return { from: ISO(periodo.inicio), to: ISO(periodo.fim) }
}
