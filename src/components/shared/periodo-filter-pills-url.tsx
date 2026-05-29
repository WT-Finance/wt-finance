'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { format, parseISO, differenceInMonths } from 'date-fns'
import type { PresetPeriodo } from '@/lib/periodo'

const PILLS: { value: PresetPeriodo; label: string }[] = [
  { value: 'este-ano',        label: 'Este ano (YTD)'  },
  { value: 'este-mes',        label: 'Este mês'        },
  { value: 'mes-passado',     label: 'Mês anterior'    },
  { value: 'ultimos-3-meses', label: 'Últimos 3 meses' },
  { value: 'ultimos-6-meses', label: 'Últimos 6 meses' },
  { value: 'personalizado',   label: 'Personalizado'   },
]

const LS_KEY   = 'wt-periodo-filter'
const ISO      = (d: Date) => format(d, 'yyyy-MM-dd')
const fmtShort = (d: Date) => format(d, 'dd/MM/yy')
const TODAY    = ISO(new Date())

interface Props {
  defaultPreset?: PresetPeriodo
}

export default function PeriodoFilterPillsUrl({ defaultPreset = 'este-ano' }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const preset  = (searchParams.get('preset') as PresetPeriodo | null) ?? defaultPreset
  const fromVal = searchParams.get('from') ?? ''
  const toVal   = searchParams.get('to')   ?? ''

  const [popoverOpen, setPopoverOpen] = useState(false)
  const [inputFrom, setInputFrom]     = useState('')
  const [inputTo, setInputTo]         = useState('')
  const [erroFrom, setErroFrom]       = useState('')
  const [erroTo, setErroTo]           = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

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

  // Persist to localStorage when URL params change
  useEffect(() => {
    if (searchParams.size === 0) return
    const current = { preset, from: fromVal, to: toVal }
    try { localStorage.setItem(LS_KEY, JSON.stringify(current)) } catch {}
  }, [preset, fromVal, toVal, searchParams.size])

  // Restore from localStorage when no URL params present
  useEffect(() => {
    if (searchParams.size > 0) return
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')
      if (saved?.preset) push(saved.preset, saved.from, saved.to)
    } catch {}
  }, [push, searchParams.size])

  // Sync popover inputs when popover opens
  useEffect(() => {
    if (popoverOpen) {
      setInputFrom(fromVal)
      setInputTo(toVal)
    }
    setErroFrom('')
    setErroTo('')
  }, [popoverOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popoverOpen])

  const handlePillClick = useCallback((value: PresetPeriodo) => {
    if (value === 'personalizado') {
      setPopoverOpen(prev => !prev)
      return
    }
    setPopoverOpen(false)
    push(value)
  }, [push])

  function aplicar() {
    setErroFrom('')
    setErroTo('')
    let ok = true

    if (!inputFrom) { setErroFrom('Selecione uma data de início'); ok = false }
    if (!inputTo)   { setErroTo('Selecione uma data de fim');     ok = false }
    if (!ok) return

    const inicio = parseISO(inputFrom)
    const fim    = parseISO(inputTo)
    const hoje   = new Date()

    if (fim < inicio) {
      setErroTo('Data fim deve ser ≥ data início')
      return
    }
    if (fim > hoje) {
      setErroTo('Data fim não pode ser futura')
      return
    }
    if (differenceInMonths(fim, inicio) > 36) {
      setErroTo('Intervalo máximo: 36 meses')
      return
    }

    push('personalizado', inputFrom, inputTo)
    setPopoverOpen(false)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PILLS.map(pill => {
        const isActive = preset === pill.value

        if (pill.value === 'personalizado') {
          return (
            <div key={pill.value} className="relative">
              <button
                onClick={() => handlePillClick(pill.value)}
                className={[
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
                  isActive ? '' : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50',
                ].join(' ')}
                style={isActive ? {
                  background:  'var(--brand-soft)',
                  borderColor: 'var(--brand)',
                  color:       'var(--brand-deep)',
                } : undefined}
              >
                {preset === 'personalizado' && fromVal && toVal
                  ? `Personalizado: ${fmtShort(parseISO(fromVal))} — ${fmtShort(parseISO(toVal))}`
                  : pill.label}
              </button>

              {popoverOpen && (
                <div
                  ref={popoverRef}
                  className="absolute top-full right-0 mt-2 z-50 bg-white border border-zinc-200 rounded-xl shadow-lg p-4 w-72 font-sans"
                >
                  <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>Selecione o período:</p>

                  <div className="flex gap-3 mb-3">
                    <div className="flex-1">
                      <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Início</label>
                      <input
                        type="date" aria-label="Data inicial" value={inputFrom} max={inputTo || TODAY}
                        onChange={e => { setInputFrom(e.target.value); setErroFrom('') }}
                        className="w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2"
                        style={{ color: 'var(--text-primary)', borderColor: 'var(--border)', fontFamily: 'inherit', ['--tw-ring-color' as string]: 'var(--brand)' }}
                      />
                      {erroFrom && <p className="text-[11px] text-red-500 mt-1">{erroFrom}</p>}
                    </div>
                    <div className="flex-1">
                      <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Fim</label>
                      <input
                        type="date" aria-label="Data final" value={inputTo} min={inputFrom} max={TODAY}
                        onChange={e => { setInputTo(e.target.value); setErroTo('') }}
                        className="w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2"
                        style={{ color: 'var(--text-primary)', borderColor: 'var(--border)', fontFamily: 'inherit', ['--tw-ring-color' as string]: 'var(--brand)' }}
                      />
                      {erroTo && <p className="text-[11px] text-red-500 mt-1">{erroTo}</p>}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setPopoverOpen(false)}
                      className="text-xs px-2 py-1 transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={aplicar}
                      className="text-xs font-medium text-white px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
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

        return (
          <button
            key={pill.value}
            onClick={() => handlePillClick(pill.value)}
            className={[
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
              isActive ? '' : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50',
            ].join(' ')}
            style={isActive ? {
              background:  'var(--brand-soft)',
              borderColor: 'var(--brand)',
              color:       'var(--brand-deep)',
            } : undefined}
          >
            {pill.label}
          </button>
        )
      })}
    </div>
  )
}
