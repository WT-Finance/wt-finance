'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { format, parseISO, differenceInMonths } from 'date-fns'
import { usePeriodoFilter } from '@/components/layout/period-filter-provider'
import type { PresetPeriodo } from '@/lib/periodo'

const PILLS: { value: PresetPeriodo; label: string }[] = [
  { value: 'este-ano',        label: 'Este ano (YTD)'  },
  { value: 'este-mes',        label: 'Este mês'        },
  { value: 'mes-passado',     label: 'Mês anterior'    },
  { value: 'ultimos-3-meses', label: 'Últimos 3 meses' },
  { value: 'ultimos-6-meses', label: 'Últimos 6 meses' },
  { value: 'personalizado',   label: 'Personalizado'   },
]

const fmtShort = (d: Date) => format(d, 'dd/MM/yy')
const toISO    = (d: Date) => format(d, 'yyyy-MM-dd')
const TODAY    = toISO(new Date())

export default function PeriodoFilter() {
  const { periodoTipo, periodoCustomizado, setPeriodo } = usePeriodoFilter()

  const [popoverOpen, setPopoverOpen]   = useState(false)
  const [fromVal, setFromVal]           = useState('')
  const [toVal, setToVal]               = useState('')
  const [erroFrom, setErroFrom]         = useState('')
  const [erroTo, setErroTo]             = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  // Sync input state when popover opens
  useEffect(() => {
    if (popoverOpen && periodoCustomizado) {
      setFromVal(toISO(periodoCustomizado.inicio))
      setToVal(toISO(periodoCustomizado.fim))
    } else if (popoverOpen) {
      setFromVal('')
      setToVal('')
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
    setPeriodo(value)
  }, [setPeriodo])

  function aplicar() {
    setErroFrom('')
    setErroTo('')
    let ok = true

    if (!fromVal) { setErroFrom('Selecione uma data de início'); ok = false }
    if (!toVal)   { setErroTo('Selecione uma data de fim');     ok = false }
    if (!ok) return

    const inicio = parseISO(fromVal)
    const fim    = parseISO(toVal)
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

    setPeriodo('personalizado', { inicio, fim })
    setPopoverOpen(false)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PILLS.map(pill => {
        const isActive = periodoTipo === pill.value

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
                {periodoTipo === 'personalizado' && periodoCustomizado
                  ? `Personalizado: ${fmtShort(periodoCustomizado.inicio)} — ${fmtShort(periodoCustomizado.fim)}`
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
                        type="date" aria-label="Data inicial" value={fromVal} max={toVal || TODAY}
                        onChange={e => { setFromVal(e.target.value); setErroFrom('') }}
                        className="w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2"
                        style={{ color: 'var(--text-primary)', borderColor: 'var(--border)', fontFamily: 'inherit', ['--tw-ring-color' as string]: 'var(--brand)' }}
                      />
                      {erroFrom && <p className="text-2xs text-danger mt-1">{erroFrom}</p>}
                    </div>
                    <div className="flex-1">
                      <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Fim</label>
                      <input
                        type="date" aria-label="Data final" value={toVal} min={fromVal} max={TODAY}
                        onChange={e => { setToVal(e.target.value); setErroTo('') }}
                        className="w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2"
                        style={{ color: 'var(--text-primary)', borderColor: 'var(--border)', fontFamily: 'inherit', ['--tw-ring-color' as string]: 'var(--brand)' }}
                      />
                      {erroTo && <p className="text-2xs text-danger mt-1">{erroTo}</p>}
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
