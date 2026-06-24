'use client'

import { useEffect, useState } from 'react'
import { usePeriodoFilter } from '@/components/layout/period-filter-provider'
import { fetchWeddingsMix } from '@/app/performance/weddings/actions'
import MixProdutoTable from '@/components/performance/mix-produto-table'
import type { MixProduto } from '@/types/api'

export default function WeddingsMixSection() {
  const { from, to } = usePeriodoFilter()
  const [data, setData]           = useState<MixProduto | null>(null)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  // loading é DERIVADO (sem setState síncrono no efeito — react-hooks/set-state-in-effect):
  // true enquanto a chave atual (from|to) não for a última carregada. Comportamento idêntico:
  // durante o refetch, segue mostrando os dados ANTERIORES com loading=true (como antes).
  const loading = loadedKey !== `${from}|${to}`

  useEffect(() => {
    let cancelled = false
    const k = `${from}|${to}`
    fetchWeddingsMix(from, to).then(d => {
      if (cancelled) return
      setData(d)
      setLoadedKey(k)
    })
    return () => { cancelled = true }
  }, [from, to])

  return <MixProdutoTable data={data} loading={loading} periodoLabel="no período selecionado" />
}
