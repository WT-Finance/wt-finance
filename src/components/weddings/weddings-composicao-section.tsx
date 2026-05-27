'use client'

import { useEffect, useState } from 'react'
import { usePeriodoFilter } from '@/components/layout/period-filter-provider'
import { fetchWeddingsComposicao } from '@/app/performance/weddings/actions'
import SumarioSubsetorCard from '@/components/weddings/sumario-subsetor'
import type { SumarioSubsetor } from '@/types/api'

export default function WeddingsComposicaoSection() {
  const { from, to } = usePeriodoFilter()
  const [data, setData]       = useState<SumarioSubsetor | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchWeddingsComposicao(from, to).then(d => {
      if (cancelled) return
      setData(d)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [from, to])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[--border] px-5 py-4">
        <div className="h-5 w-48 rounded bg-zinc-100 animate-pulse mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-zinc-100 animate-pulse shrink-0" />
              <div className="h-3 rounded bg-zinc-100 animate-pulse" style={{ width: `${60 + i * 10}px` }} />
              <div className="flex-1 h-2 rounded-full bg-zinc-100 animate-pulse" />
              <div className="h-3 w-16 rounded bg-zinc-100 animate-pulse" />
              <div className="h-3 w-16 rounded bg-zinc-100 animate-pulse" />
              <div className="h-3 w-12 rounded bg-zinc-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }
  return <SumarioSubsetorCard data={data} periodoLabel="no período selecionado" />
}
