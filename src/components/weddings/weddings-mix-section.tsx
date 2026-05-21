'use client'

import { useEffect, useState } from 'react'
import { usePeriodoFilter } from '@/components/layout/period-filter-provider'
import { fetchWeddingsMix } from '@/app/performance/weddings/actions'
import MixProdutoTable from '@/components/performance/mix-produto-table'
import type { MixProduto } from '@/types/api'

export default function WeddingsMixSection() {
  const { from, to } = usePeriodoFilter()
  const [data, setData]       = useState<MixProduto | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchWeddingsMix(from, to).then(d => {
      if (cancelled) return
      setData(d)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [from, to])

  return <MixProdutoTable data={data} loading={loading} periodoLabel="no período selecionado" />
}
