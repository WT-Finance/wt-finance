import { Suspense } from 'react'
import PeriodoFilter from '@/components/shared/periodo-filter-url'
import SetorFilter from '@/components/shared/setor-filter'
import KpiCard, { KpiCardSkeleton } from '@/components/shared/kpi-card'
import KpiDrawerTrigger from '@/components/shared/kpi-drawer-trigger'
import MixSetorTable from '@/components/performance/mix-setor-table'
import CagrCard from '@/components/performance/cagr-card'
import TendenciaMargemChart from '@/components/performance/tendencia-margem-chart'
import MixProdutoTable from '@/components/performance/mix-produto-table'
import PrejuizosTable from '@/components/performance/prejuizos-table'
import TopSection from '@/components/shared/top-section'
import { getServerClient } from '@/lib/supabase/server'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { getBenchmarks } from '@/lib/config'
import type {
  ExecutivaKpis, MixSetor, TendenciaMargem,
  MixProduto, PrejuizosDetalhe, CagrData,
} from '@/types/api'

interface PeriodoSearchParams {
  preset?: string
  from?:   string
  to?:     string
}

interface Props {
  setor:        string
  searchParams: PeriodoSearchParams
}

export default async function PerformanceContent({ setor, searchParams: sp }: Props) {
  const { from, to, antFrom, antTo, yoyFrom, yoyTo, eParcial } =
    resolverPeriodoCompleto({ ...sp, defaultPreset: 'este-ano' })
  const preset = sp.preset ?? 'este-ano'

  const db = getServerClient()

  const [kpisRes, mixRes, tendRes, prodRes, prejRes, cagrRes, benchmarks] = await Promise.all([
    db.rpc('get_executiva_kpis', {
      p_from:     from,
      p_to:       to,
      p_setor:    setor,
      p_ant_from: antFrom,
      p_ant_to:   antTo,
      p_yoy_from: yoyFrom,
      p_yoy_to:   yoyTo,
    }),
    db.rpc('get_mix_setor',        { p_from: from, p_to: to, p_setor: setor }),
    db.rpc('get_tendencia_margem', { p_from: from, p_to: to, p_setor: setor }),
    db.rpc('get_mix_produto',      { p_from: from, p_to: to, p_setor: setor, p_limite: 10 }),
    db.rpc('get_prejuizos',        { p_from: from, p_to: to, p_setor: setor, p_summary: false }),
    db.rpc('get_cagr'),
    getBenchmarks(db),
  ])

  const kpis       = kpisRes.error  ? null : kpisRes.data  as unknown as ExecutivaKpis
  const mix        = mixRes.error   ? null : mixRes.data   as unknown as MixSetor
  const tendencia  = tendRes.error  ? null : tendRes.data  as unknown as TendenciaMargem
  const produtos   = prodRes.error  ? null : prodRes.data  as unknown as MixProduto
  const prejuizos  = prejRes.error  ? null : prejRes.data  as unknown as PrejuizosDetalhe
  const cagr       = cagrRes.error  ? null : cagrRes.data  as unknown as CagrData

  const mostrarSetorFilter = setor === 'todos'

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">
      {/* Filtros */}
      <div className="flex items-center justify-end gap-3 mb-6 flex-wrap">
        <Suspense>
          <PeriodoFilter defaultPreset="este-ano" />
        </Suspense>
        {mostrarSetorFilter && (
          <Suspense>
            <SetorFilter />
          </Suspense>
        )}
      </div>

      {/* KPI Grid */}
      <TopSection titulo="Visão Geral">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          {kpis ? (
            <>
              <KpiDrawerTrigger metrica="faturamento" rotulo="Faturamento" setor={setor} drawer="rico">
                <KpiCard rotulo="Faturamento" formula="Soma do valor total das vendas" metrica={kpis.faturamento} formato="brl" periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial} />
              </KpiDrawerTrigger>
              <KpiDrawerTrigger metrica="receita" rotulo="Receita" setor={setor} drawer="rico">
                <KpiCard rotulo="Receita" formula="Faturamento − custos e reembolsos" metrica={kpis.receita} formato="brl" periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial} />
              </KpiDrawerTrigger>
              <KpiCard rotulo="Margem %"      formula="Receita ÷ Faturamento × 100"      metrica={kpis.margem_pct}    formato="pct"    periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} benchmarkAlvo={benchmarks.margemAlvo} benchmarkAtencao={benchmarks.margemAtencao} isPeriodoProporcional={eParcial} />
              <KpiCard rotulo="Vendas"        formula="Contagem de vendas no período"     metrica={kpis.vendas}        formato="numero" periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial}                                    />
              <KpiCard rotulo="Ticket Médio"  formula="Faturamento ÷ Vendas"             metrica={kpis.ticket_medio}  formato="brl"    periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial}   />
              <KpiCard rotulo="Receita/Venda" formula="Receita ÷ Vendas"                 metrica={kpis.receita_media} formato="brl"    periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial} />
            </>
          ) : (
            Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
          )}
        </div>
      </TopSection>

      {/* Mix Setor + CAGR */}
      <TopSection titulo="Mix por Setor">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <MixSetorTable data={mix} loading={false} margemAlvo={benchmarks.margemAlvo} preset={preset} />
          </div>
          <div>
            <CagrCard data={cagr} loading={false} />
          </div>
        </div>
      </TopSection>

      {/* Tendência de margem */}
      <TopSection titulo="Tendência de Margem">
        <TendenciaMargemChart
          data={tendencia}
          loading={false}
          margemOk={benchmarks.margemAlvo}
          margemAlerta={benchmarks.margemAtencao}
        />
      </TopSection>

      {/* Mix Produto + Prejuízos */}
      <TopSection titulo="Mix de Produtos e Prejuízos">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <MixProdutoTable data={produtos}  loading={false} />
          <PrejuizosTable  data={prejuizos} loading={false} />
        </div>
      </TopSection>
    </div>
  )
}
