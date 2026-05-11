import { Suspense, type ReactNode } from 'react'
import PeriodoFilter from '@/components/shared/periodo-filter'
import KpiCard, { KpiCardSkeleton } from '@/components/shared/kpi-card'
import KpiDrawerTrigger from '@/components/shared/kpi-drawer-trigger'
import TendenciaMargemChart from '@/components/performance/tendencia-margem-chart'
import MixProdutoTable from '@/components/performance/mix-produto-table'
import PrejuizosTable from '@/components/performance/prejuizos-table'
import SumarioSubsetorCard from '@/components/weddings/sumario-subsetor'
import { getServerClient } from '@/lib/supabase/server'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { getBenchmarks } from '@/lib/config'
import type {
  ExecutivaKpis, TendenciaMargem,
  MixProduto, PrejuizosDetalhe, Sparklines, SumarioSubsetor,
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

interface PeriodoSearchParams {
  preset?: string
  from?:   string
  to?:     string
}

interface Props {
  searchParams: PeriodoSearchParams
}

export default async function WeddingsContent({ searchParams: sp }: Props) {
  const { from, to, antFrom, antTo, yoyFrom, yoyTo, eParcial } =
    resolverPeriodoCompleto({ ...sp, defaultPreset: 'este-ano' })
  const preset = sp.preset ?? 'este-ano'
  const setor  = 'Weddings'

  const db = getServerClient()

  const [kpisRes, tendRes, prodRes, prejRes, sparkRes, sumarioRes, benchmarks] = await Promise.all([
    db.rpc('get_executiva_kpis', {
      p_from:     from,
      p_to:       to,
      p_setor:    setor,
      p_ant_from: antFrom,
      p_ant_to:   antTo,
      p_yoy_from: yoyFrom,
      p_yoy_to:   yoyTo,
    }),
    db.rpc('get_tendencia_margem', { p_from: from, p_to: to, p_setor: setor }),
    db.rpc('get_mix_produto',      { p_from: from, p_to: to, p_setor: setor, p_limite: 10 }),
    db.rpc('get_prejuizos',        { p_from: from, p_to: to, p_setor: setor, p_summary: false }),
    db.rpc('get_sparklines',       { p_preset: preset, p_from: from, p_to: to, p_setor: setor }),
    db.rpc('get_sumario_subsetor', { p_from: from, p_to: to }),
    getBenchmarks(db),
  ])

  const kpis      = kpisRes.error    ? null : kpisRes.data    as unknown as ExecutivaKpis
  const tendencia = tendRes.error    ? null : tendRes.data    as unknown as TendenciaMargem
  const produtos  = prodRes.error    ? null : prodRes.data    as unknown as MixProduto
  const prejuizos = prejRes.error    ? null : prejRes.data    as unknown as PrejuizosDetalhe
  const sparklines = sparkRes.error  ? null : sparkRes.data   as unknown as Sparklines | null
  const sumario   = sumarioRes.error ? null : sumarioRes.data as unknown as SumarioSubsetor

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">
      {/* Filtros */}
      <div className="flex items-center justify-end gap-3 mb-6 flex-wrap">
        <Suspense>
          <PeriodoFilter defaultPreset="este-ano" />
        </Suspense>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {kpis ? (
          <>
            <KpiDrawerTrigger metrica="faturamento" rotulo="Faturamento" setor={setor}>
              <KpiCard rotulo="Faturamento" formula="Soma do valor total das vendas" metrica={kpis.faturamento} formato="brl" periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial} sparklineData={sparklines?.faturamento} sparklineLabels={sparklines?.labels} />
            </KpiDrawerTrigger>
            <KpiDrawerTrigger metrica="receita" rotulo="Receita" setor={setor}>
              <KpiCard rotulo="Receita" formula="Faturamento − custos e reembolsos" metrica={kpis.receita} formato="brl" periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial} sparklineData={sparklines?.receita} sparklineLabels={sparklines?.labels} />
            </KpiDrawerTrigger>
            <KpiCard rotulo="Margem %"      formula="Receita ÷ Faturamento × 100"  metrica={kpis.margem_pct}    formato="pct"    periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} benchmarkAlvo={benchmarks.margemAlvo} benchmarkAtencao={benchmarks.margemAtencao} isPeriodoProporcional={eParcial} sparklineData={(sparklines?.margem_pct ?? []).map(v => v ?? 0)} sparklineLabels={sparklines?.labels} />
            <KpiCard rotulo="Vendas"        formula="Contagem de vendas no período" metrica={kpis.vendas}        formato="numero" periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial} sparklineData={sparklines?.vendas}                                    sparklineLabels={sparklines?.labels} />
            <KpiCard rotulo="Ticket Médio"  formula="Faturamento ÷ Vendas"          metrica={kpis.ticket_medio}  formato="brl"    periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial} sparklineData={(sparklines?.ticket_medio ?? []).map(v => v ?? 0)}   sparklineLabels={sparklines?.labels} />
            <KpiCard rotulo="Receita/Venda" formula="Receita ÷ Vendas"              metrica={kpis.receita_media} formato="brl"    periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy} isPeriodoProporcional={eParcial} sparklineData={(sparklines?.receita_media ?? []).map(v => v ?? 0)} sparklineLabels={sparklines?.labels} />
          </>
        ) : (
          Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
        )}
      </div>

      {/* Tendência de margem */}
      <Section titulo="Tendência de Margem">
        <TendenciaMargemChart
          data={tendencia}
          loading={false}
          margemOk={benchmarks.margemAlvo}
          margemAlerta={benchmarks.margemAtencao}
        />
      </Section>

      {/* Mix de Produtos + Prejuízos */}
      <Section titulo="Mix de Produtos e Prejuízos">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <MixProdutoTable data={produtos}  loading={false} />
          <PrejuizosTable  data={prejuizos} loading={false} />
        </div>
      </Section>

      {/* Bloco 2.1 — Resumo por Subsetor */}
      <Section titulo="Operações — Resumo por Subsetor">
        <SumarioSubsetorCard data={sumario} />
      </Section>
    </div>
  )
}
