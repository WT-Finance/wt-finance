'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import FilterBar from '@/components/dashboard/FilterBar'
import KpiCards from '@/components/dashboard/KpiCards'
import RitmoDiarioChart from '@/components/dashboard/RitmoDiarioChart'
import HistoricoMensalChart from '@/components/dashboard/HistoricoMensalChart'
import RankingVendedores from '@/components/dashboard/RankingVendedores'
import RankingProdutos from '@/components/dashboard/RankingProdutos'
import type {
  KpisMes, RitmoDiarioItem, HistoricoMensalItem,
  RankingVendedorItem, RankingProdutoItem,
} from '@/types/api'

interface DashboardData {
  kpis: KpisMes | null
  ritmo: RitmoDiarioItem[]
  historico: HistoricoMensalItem[]
  vendedores: RankingVendedorItem[]
  produtos: RankingProdutoItem[]
}

interface Props {
  setor: string
  ano: number
  mes: number
}

export default function MetasDashboard({ setor, ano, mes }: Props) {
  const router   = useRouter()
  const pathname = usePathname()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData>({
    kpis: null, ritmo: [], historico: [], vendedores: [], produtos: [],
  })

  function setFilter(newSetor: string, newAno: number, newMes: number) {
    const params = new URLSearchParams({
      setor: newSetor,
      ano: String(newAno),
      mes: String(newMes),
    })
    router.push(`${pathname}?${params.toString()}`)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const qs = `ano=${ano}&mes=${mes}&setor=${setor}`

    Promise.all([
      fetch(`/api/kpis?${qs}`).then(r => r.json()) as Promise<KpisMes>,
      fetch(`/api/ritmo-diario?${qs}`).then(r => r.json()) as Promise<RitmoDiarioItem[]>,
      fetch(`/api/historico-mensal?setor=${setor}`).then(r => r.json()) as Promise<HistoricoMensalItem[]>,
      fetch(`/api/ranking-vendedores?${qs}`).then(r => r.json()) as Promise<RankingVendedorItem[]>,
      fetch(`/api/ranking-produtos?${qs}`).then(r => r.json()) as Promise<RankingProdutoItem[]>,
    ]).then(([kpis, ritmo, historico, vendedores, produtos]) => {
      if (!cancelled) {
        setData({ kpis, ritmo, historico, vendedores, produtos })
        setLoading(false)
      }
    }).catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [setor, ano, mes])

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-4">
      <div className="flex items-center justify-end mb-4">
        <FilterBar
          setor={setor} ano={ano} mes={mes}
          onSetorChange={s => setFilter(s, ano, mes)}
          onAnoMesChange={(a, m) => setFilter(setor, a, m)}
        />
      </div>

      <div className="space-y-6">
        <KpiCards data={data.kpis} loading={loading} />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <RitmoDiarioChart data={data.ritmo}       loading={loading} setor={setor} />
          <RankingVendedores data={data.vendedores}  loading={loading} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <HistoricoMensalChart data={data.historico} loading={loading} setor={setor} />
          <RankingProdutos data={data.produtos}        loading={loading} />
        </div>
      </div>
    </div>
  )
}
