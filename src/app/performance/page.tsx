import { Suspense } from 'react'
import PeriodoFilter from '@/components/shared/periodo-filter'
import SetorFilter from '@/components/shared/setor-filter'
import KpiCard, { KpiCardSkeleton } from '@/components/shared/kpi-card'
import MixSetorTable from '@/components/performance/mix-setor-table'
import CagrCard from '@/components/performance/cagr-card'
import TendenciaMargemChart from '@/components/performance/tendencia-margem-chart'
import MixProdutoTable from '@/components/performance/mix-produto-table'
import PrejuizosTable from '@/components/performance/prejuizos-table'
import { getServerClient } from '@/lib/supabase/server'
import { resolverPeriodoFromParams } from '@/lib/periodo'
import type {
  ExecutivaKpis, MixSetor, TendenciaMargem,
  MixProduto, PrejuizosDetalhe, CagrData,
} from '@/types/api'

interface SearchParams {
  preset?: string
  from?: string
  to?: string
  setor?: string
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp    = await searchParams
  const { from, to } = resolverPeriodoFromParams({ ...sp, defaultPreset: 'este-ano' })
  const setor = sp.setor ?? 'todos'

  const db = getServerClient()

  const [kpisRes, mixRes, tendRes, prodRes, prejRes, cagrRes] = await Promise.all([
    db.rpc('get_executiva_kpis',    { p_from: from, p_to: to, p_setor: setor }),
    db.rpc('get_mix_setor',         { p_from: from, p_to: to, p_setor: setor }),
    db.rpc('get_tendencia_margem',  { p_from: from, p_to: to, p_setor: setor }),
    db.rpc('get_mix_produto',       { p_from: from, p_to: to, p_setor: setor, p_limite: 10 }),
    db.rpc('get_prejuizos',         { p_from: from, p_to: to, p_setor: setor, p_summary: false }),
    db.rpc('get_cagr'),
  ])

  const kpis      = kpisRes.error  ? null : kpisRes.data  as unknown as ExecutivaKpis
  const mix       = mixRes.error   ? null : mixRes.data   as unknown as MixSetor
  const tendencia = tendRes.error  ? null : tendRes.data  as unknown as TendenciaMargem
  const produtos  = prodRes.error  ? null : prodRes.data  as unknown as MixProduto
  const prejuizos = prejRes.error  ? null : prejRes.data  as unknown as PrejuizosDetalhe
  const cagr      = cagrRes.error  ? null : cagrRes.data  as unknown as CagrData

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-4">
      {/* Filtros */}
      <div className="flex items-center justify-end gap-3 mb-6 flex-wrap">
        <Suspense>
          <PeriodoFilter defaultPreset="este-ano" />
        </Suspense>
        <Suspense>
          <SetorFilter />
        </Suspense>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {kpis ? (
          <>
            <KpiCard rotulo="Faturamento"  metrica={kpis.faturamento}   formato="brl"    periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} />
            <KpiCard rotulo="Receita"      metrica={kpis.receita}       formato="brl"    periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} />
            <KpiCard rotulo="Margem %"     metrica={kpis.margem_pct}    formato="pct"    periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} />
            <KpiCard rotulo="Vendas"       metrica={kpis.vendas}        formato="numero" periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} />
            <KpiCard rotulo="Ticket Médio" metrica={kpis.ticket_medio}  formato="brl"    periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} />
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)
        )}
      </div>

      {/* Mix Setor + CAGR */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <div className="xl:col-span-2">
          <MixSetorTable data={mix} loading={false} />
        </div>
        <div>
          <CagrCard data={cagr} loading={false} />
        </div>
      </div>

      {/* Tendência de margem */}
      <div className="mb-6">
        <TendenciaMargemChart data={tendencia} loading={false} />
      </div>

      {/* Mix Produto + Prejuízos */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <MixProdutoTable data={produtos}  loading={false} />
        <PrejuizosTable  data={prejuizos} loading={false} />
      </div>
    </div>
  )
}
