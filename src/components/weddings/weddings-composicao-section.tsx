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

  return (
    <div>
      <p className="text-[13px] mb-1" style={{ color: 'var(--text-muted)' }}>no período selecionado</p>
      {loading ? (
        <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 h-32 animate-pulse" />
      ) : (
        <SumarioSubsetorCard data={data} />
      )}
    </div>
  )
}
