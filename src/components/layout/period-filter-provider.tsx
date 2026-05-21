'use client'

import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'
import { resolverPeriodoCompleto, type PresetPeriodo, type PeriodoCompleto } from '@/lib/periodo'
import { format } from 'date-fns'

export interface PeriodoCustomizado {
  inicio: Date
  fim: Date
}

interface PeriodoFilterState extends PeriodoCompleto {
  periodoTipo: PresetPeriodo
  periodoCustomizado: PeriodoCustomizado | null
  setPeriodo: (tipo: PresetPeriodo, customizado?: PeriodoCustomizado) => void
}

const PeriodoFilterContext = createContext<PeriodoFilterState | null>(null)

export function usePeriodoFilter(): PeriodoFilterState {
  const ctx = useContext(PeriodoFilterContext)
  if (!ctx) throw new Error('usePeriodoFilter deve ser usado dentro de PeriodoFilterProvider')
  return ctx
}

export function PeriodoFilterProvider({ children }: { children: ReactNode }) {
  const [periodoTipo, setPeriodoTipo] = useState<PresetPeriodo>('este-ano')
  const [periodoCustomizado, setPeriodoCustomizado] = useState<PeriodoCustomizado | null>(null)

  const computed = useMemo(() => {
    const iso = (d: Date) => format(d, 'yyyy-MM-dd')
    return resolverPeriodoCompleto({
      preset: periodoTipo,
      from: periodoTipo === 'personalizado' && periodoCustomizado
        ? iso(periodoCustomizado.inicio) : undefined,
      to: periodoTipo === 'personalizado' && periodoCustomizado
        ? iso(periodoCustomizado.fim) : undefined,
    })
  }, [periodoTipo, periodoCustomizado])

  function setPeriodo(tipo: PresetPeriodo, customizado?: PeriodoCustomizado) {
    setPeriodoTipo(tipo)
    setPeriodoCustomizado(customizado ?? null)
  }

  return (
    <PeriodoFilterContext.Provider value={{ periodoTipo, periodoCustomizado, setPeriodo, ...computed }}>
      {children}
    </PeriodoFilterContext.Provider>
  )
}
