import { Suspense, type ReactNode } from 'react'
import PeriodoFilter from '@/components/shared/periodo-filter'
import SetorFilter from '@/components/shared/setor-filter'
import KpiCard, { KpiCardSkeleton } from '@/components/shared/kpi-card'
import MixSetorTable from '@/components/performance/mix-setor-table'
import CagrCard from '@/components/performance/cagr-card'
import TendenciaMargemChart from '@/components/performance/tendencia-margem-chart'
import MixProdutoTable from '@/components/performance/mix-produto-table'
import PrejuizosTable from '@/components/performance/prejuizos-table'
import { getServerClient } from '@/lib/supabase/server'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { getBenchmarks } from '@/lib/config'
import type {
  ExecutivaKpis, MixSetor, TendenciaMargem,
  MixProduto, PrejuizosDetalhe, CagrData, Sparklines,
} from '@/types/api'

function Section({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details open className="group mb-6">
      <summary className="flex items-center gap-2 cursor-pointer list-none mb-4 select-none">
        <svg
          className="w-4 h-4 text-zinc-400 transition-transform group-open:rotate-90 shrink-0"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-semibold text-zinc-600">{titulo}</span>
      </summary>
      {children}
    </details>
  )
}

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
  const { from, to, antFrom, antTo, yoyFrom, yoyTo, eParcial } =
    resolverPeriodoCompleto({ ...sp, defaultPreset: 'este-ano' })
  const setor = sp.setor ?? 'todos'

  const db = getServerClient()

  const preset = sp.preset ?? 'este-ano'

  const [kpisRes, mixRes, tendRes, prodRes, prejRes, cagrRes, sparkRes, benchmarks] = await Promise.all([
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
    db.rpc('get_sparklines',       { p_preset: preset, p_from: from, p_to: to, p_setor: setor }),
    getBenchmarks(db),
  ])

  const kpis       = kpisRes.error  ? null : kpisRes.data  as unknown as ExecutivaKpis
  const mix        = mixRes.error   ? null : mixRes.data   as unknown as MixSetor
  const tendencia  = tendRes.error  ? null : tendRes.data  as unknown as TendenciaMargem
  const produtos   = prodRes.error  ? null : prodRes.data  as unknown as MixProduto
  const prejuizos  = prejRes.error  ? null : prejRes.data  as unknown as PrejuizosDetalhe
  const cagr       = cagrRes.error  ? null : cagrRes.data  as unknown as CagrData
  const sparklines = sparkRes.error ? null : sparkRes.data as unknown as Sparklines | null

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">
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
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {kpis ? (
          <>
            <KpiCard rotulo="Faturamento"   formula="Soma do valor total das vendas"    metrica={kpis.faturamento}   formato="brl"    periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial} sparklineData={sparklines?.faturamento}                               sparklineLabels={sparklines?.labels} />
            <KpiCard rotulo="Receita"       formula="Faturamento − custos e reembolsos" metrica={kpis.receita}       formato="brl"    periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial} sparklineData={sparklines?.receita}                                   sparklineLabels={sparklines?.labels} />
            <KpiCard rotulo="Margem %"      formula="Receita ÷ Faturamento × 100"      metrica={kpis.margem_pct}    formato="pct"    periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} benchmarkAlvo={benchmarks.margemAlvo} benchmarkAtencao={benchmarks.margemAtencao} isPeriodoProporcional={eParcial} sparklineData={(sparklines?.margem_pct ?? []).map(v => v ?? 0)} sparklineLabels={sparklines?.labels} />
            <KpiCard rotulo="Vendas"        formula="Contagem de vendas no período"     metrica={kpis.vendas}        formato="numero" periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial} sparklineData={sparklines?.vendas}                                    sparklineLabels={sparklines?.labels} />
            <KpiCard rotulo="Ticket Médio"  formula="Faturamento ÷ Vendas"             metrica={kpis.ticket_medio}  formato="brl"    periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial} sparklineData={(sparklines?.ticket_medio ?? []).map(v => v ?? 0)}   sparklineLabels={sparklines?.labels} />
            <KpiCard rotulo="Receita/Venda" formula="Receita ÷ Vendas"                 metrica={kpis.receita_media} formato="brl"    periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial} sparklineData={(sparklines?.receita_media ?? []).map(v => v ?? 0)} sparklineLabels={sparklines?.labels} />
          </>
        ) : (
          Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
        )}
      </div>

      {/* Mix Setor + CAGR */}
      <Section titulo="Mix por Setor">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <MixSetorTable data={mix} loading={false} margemAlvo={benchmarks.margemAlvo} />
          </div>
          <div>
            <CagrCard data={cagr} loading={false} />
          </div>
        </div>
      </Section>

      {/* Tendência de margem */}
      <Section titulo="Tendência de Margem">
        <TendenciaMargemChart
          data={tendencia}
          loading={false}
          margemOk={benchmarks.margemAlvo}
          margemAlerta={benchmarks.margemAtencao}
        />
      </Section>

      {/* Mix Produto + Prejuízos */}
      <Section titulo="Mix de Produtos e Prejuízos">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <MixProdutoTable data={produtos}  loading={false} />
          <PrejuizosTable  data={prejuizos} loading={false} />
        </div>
      </Section>
    </div>
  )
}
