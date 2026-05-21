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
    return <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 h-32 animate-pulse" />
  }
  return <SumarioSubsetorCard data={data} periodoLabel="no período selecionado" />
}
