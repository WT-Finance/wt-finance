import { Suspense } from 'react'
import PeriodoFilter from '@/components/shared/periodo-filter'
import { resolverPeriodoFromParams } from '@/lib/periodo'
import SetorFilter from '@/components/shared/setor-filter'
import KpiCard, { KpiCardSkeleton } from '@/components/shared/kpi-card'
import MixSetorChart from '@/components/executiva/mix-setor-chart'
import PrejuizosKpi from '@/components/executiva/prejuizos-kpi'
import { getServerClient } from '@/lib/supabase/server'
import type { ExecutivaKpis, MixSetor, PrejuizosSummary } from '@/types/api'

interface SearchParams {
  preset?: string
  from?: string
  to?: string
  setor?: string
}

export default async function ExecutivaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp    = await searchParams
  const { from, to } = resolverPeriodoFromParams(sp)
  const setor = sp.setor ?? 'todos'

  const db = getServerClient()

  const [kpisRes, mixRes, prejRes] = await Promise.all([
    db.rpc('get_executiva_kpis', { p_from: from, p_to: to, p_setor: setor }),
    db.rpc('get_mix_setor',      { p_from: from, p_to: to, p_setor: setor }),
    db.rpc('get_prejuizos',      { p_from: from, p_to: to, p_setor: setor, p_summary: true }),
  ])

  const kpis      = kpisRes.error ? null : kpisRes.data as unknown as ExecutivaKpis
  const mix       = mixRes.error  ? null : mixRes.data  as unknown as MixSetor
  const prejuizos = prejRes.error ? null : prejRes.data as unknown as PrejuizosSummary

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-4">
      {/* Filtros */}
      <div className="flex items-center justify-end gap-3 mb-6 flex-wrap">
        <Suspense>
          <PeriodoFilter defaultPreset="este-mes" />
        </Suspense>
        <Suspense>
          <SetorFilter />
        </Suspense>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {kpis ? (
          <>
            <KpiCard
              rotulo="Faturamento"
              metrica={kpis.faturamento}
              formato="brl"
              periodoAnterior={kpis.periodo_anterior}
              periodoYoY={kpis.periodo_yoy}
            />
            <KpiCard
              rotulo="Receita"
              metrica={kpis.receita}
              formato="brl"
              periodoAnterior={kpis.periodo_anterior}
              periodoYoY={kpis.periodo_yoy}
            />
            <KpiCard
              rotulo="Margem %"
              metrica={kpis.margem_pct}
              formato="pct"
              periodoAnterior={kpis.periodo_anterior}
              periodoYoY={kpis.periodo_yoy}
            />
            <KpiCard
              rotulo="Vendas"
              metrica={kpis.vendas}
              formato="numero"
              periodoAnterior={kpis.periodo_anterior}
              periodoYoY={kpis.periodo_yoy}
            />
            <KpiCard
              rotulo="Ticket Médio"
              metrica={kpis.ticket_medio}
              formato="brl"
              periodoAnterior={kpis.periodo_anterior}
              periodoYoY={kpis.periodo_yoy}
            />
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)
        )}
      </div>

      {/* Mix por Setor + Prejuízos */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <MixSetorChart data={mix} loading={false} />
        </div>
        <div>
          <PrejuizosKpi data={prejuizos} loading={false} />
        </div>
      </div>
    </div>
  )
}
