'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type PresetPeriodo } from '@/lib/periodo'
import { format } from 'date-fns'

// Pills de período sincronizadas pela URL (mesma lógica do PeriodoFilterUrl, mas
// em pills no lugar do <select>). v4.10/M3 — usado no PerformanceContent (Geral/
// Trips/Corp). A pill ativa usa a cor da aba (--brand via [data-theme]).

const PILLS: { value: PresetPeriodo; label: string }[] = [
  { value: 'este-ano',        label: 'Este ano'     },
  { value: 'este-mes',        label: 'Este mês'     },
  { value: 'mes-passado',     label: 'Mês anterior' },
  { value: 'ultimos-3-meses', label: 'Últimos 3'    },
  { value: 'ultimos-6-meses', label: 'Últimos 6'    },
  { value: 'personalizado',   label: 'Personalizado'},
]

const LS_KEY   = 'wt-periodo-filter'
const ISO      = (d: Date) => format(d, 'yyyy-MM-dd')
const MIN_DATE = '2024-01-01'
const MAX_DATE = ISO(new Date())

const PILL_ACTIVE_STYLE = {
  background:  'var(--brand-soft)',
  borderColor: 'var(--brand)',
  color:       'var(--brand-deep)',
}
const PILL_BASE     = 'px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap'
const PILL_INACTIVE = 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'

interface Props {
  defaultPreset?: PresetPeriodo
}

export default function PeriodoPillsUrl({ defaultPreset = 'mes-passado' }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [showCustom, setShowCustom] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const preset  = (searchParams.get('preset') as PresetPeriodo | null) ?? defaultPreset
  const fromVal = searchParams.get('from') ?? ''
  const toVal   = searchParams.get('to')   ?? ''

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

  // Persiste a escolha (mesma chave do select, para continuidade entre as abas).
  useEffect(() => {
    if (searchParams.size === 0) return
    try { localStorage.setItem(LS_KEY, JSON.stringify({ preset, from: fromVal, to: toVal })) } catch {}
  }, [preset, fromVal, toVal, searchParams.size])

  useEffect(() => {
    if (searchParams.size > 0) return
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')
      if (saved?.preset) push(saved.preset, saved.from, saved.to)
    } catch {}
  }, [push, searchParams.size])

  // Fecha o popover ao clicar fora.
  useEffect(() => {
    if (!showCustom) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setShowCustom(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCustom])

  return (
    <div className="relative flex items-center gap-1.5 flex-wrap" ref={popoverRef}>
      {PILLS.map(p => (
        <button
          key={p.value}
          className={[PILL_BASE, preset === p.value ? '' : PILL_INACTIVE].join(' ')}
          style={preset === p.value ? PILL_ACTIVE_STYLE : undefined}
          onClick={() => {
            if (p.value === 'personalizado') { setShowCustom(s => !s); return }
            setShowCustom(false)
            push(p.value)
          }}
        >
          {p.label}
        </button>
      ))}

      {showCustom && (
        <div className="absolute top-full right-0 mt-2 z-50 bg-white border border-zinc-200 rounded-xl shadow-lg p-4 w-64">
          <p className="text-[11px] font-medium text-zinc-500 mb-3">Período personalizado</p>
          <div className="space-y-2 mb-4">
            <div>
              <label className="text-[10px] text-zinc-400 block mb-1">Data inicial</label>
              <input
                type="date" aria-label="Data inicial" defaultValue={fromVal} min={MIN_DATE} max={MAX_DATE}
                id="pp-from"
                className="w-full text-xs border border-zinc-200 rounded px-2 py-1 text-zinc-700 focus:outline-none focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 block mb-1">Data final</label>
              <input
                type="date" aria-label="Data final" defaultValue={toVal} min={MIN_DATE} max={MAX_DATE}
                id="pp-to"
                className="w-full text-xs border border-zinc-200 rounded px-2 py-1 text-zinc-700 focus:outline-none focus:border-zinc-400"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCustom(false)}
              className="flex-1 text-[11px] text-zinc-400 hover:text-zinc-600 py-1.5 rounded border border-zinc-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                const f = (document.getElementById('pp-from') as HTMLInputElement | null)?.value
                const t = (document.getElementById('pp-to')   as HTMLInputElement | null)?.value
                if (!f || !t) return
                setShowCustom(false)
                push('personalizado', f, t)
              }}
              className="flex-1 text-[11px] text-white py-1.5 rounded transition-colors"
              style={{ background: 'var(--brand)' }}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
