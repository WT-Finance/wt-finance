import { Suspense, type ReactNode } from 'react'
import PeriodoFilter from '@/components/shared/periodo-filter'
import KpiCard, { KpiCardSkeleton } from '@/components/shared/kpi-card'
import KpiDrawerTrigger from '@/components/shared/kpi-drawer-trigger'
import MargemDrawerTrigger from '@/components/weddings/margem-drawer-trigger'
import MixProdutoTable from '@/components/performance/mix-produto-table'
import PrejuizosTable from '@/components/performance/prejuizos-table'
import SumarioSubsetorCard from '@/components/weddings/sumario-subsetor'
import CarteiraMartrixCard from '@/components/weddings/carteira-matrix-card'
import ProximosCasamentosCard from '@/components/weddings/proximos-casamentos-card'
import OperacoesSection from '@/components/weddings/operacoes-section'
import AcumuladoRecebPagChart from '@/components/weddings/acumulado-receb-pag-chart'
import { getServerClient } from '@/lib/supabase/server'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { getBenchmarks } from '@/lib/config'
import type {
  ExecutivaKpis, TendenciaMargem,
  MixProduto, PrejuizosDetalhe, Sparklines, SumarioSubsetor,
  CarteiraWeddings, ProximosCasamentos, AcumuladoWeddings,
} from '@/types/api'

function TopSection({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details open className="group mb-8">
      <summary className="flex items-center gap-3 px-5 py-4 mb-6 cursor-pointer list-none select-none rounded-lg border-l-4 border-[#BD965C] bg-gradient-to-r from-[#FBF1E1] to-transparent hover:from-[#f3e3c8] transition-colors">
        <svg
          className="w-5 h-5 text-[#BD965C] transition-transform group-open:rotate-90 shrink-0"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-base font-bold text-zinc-800 tracking-wide">
          {titulo}
        </span>
      </summary>
      {children}
    </details>
  )
}

function Section({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details open className="group mb-6">
      <summary className="flex items-center gap-2 cursor-pointer list-none mb-4 select-none">
        <svg
          className="w-4 h-4 text-[#BD965C] transition-transform group-open:rotate-90 shrink-0"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-semibold text-zinc-700">{titulo}</span>
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

  const [
    kpisRes, tendRes, prodRes, prejRes, sparkRes, sumarioRes,
    cartCasRes, cartFatRes, cartRbRes, proximosRes, benchmarks, acumuladoRes,
  ] = await Promise.all([
    db.rpc('get_executiva_kpis', {
      p_from: from, p_to: to, p_setor: setor,
      p_ant_from: antFrom, p_ant_to: antTo,
      p_yoy_from: yoyFrom, p_yoy_to: yoyTo,
    }),
    db.rpc('get_tendencia_margem', { p_from: from, p_to: to, p_setor: setor }),
    db.rpc('get_mix_produto',      { p_from: from, p_to: to, p_setor: setor, p_limite: 10 }),
    db.rpc('get_prejuizos',        { p_from: from, p_to: to, p_setor: setor, p_summary: false }),
    db.rpc('get_sparklines',       { p_preset: preset, p_from: from, p_to: to, p_setor: setor }),
    db.rpc('get_sumario_subsetor', { p_from: from, p_to: to }),
    db.rpc('get_carteira_weddings', { p_metric: 'casamentos' }),
    db.rpc('get_carteira_weddings', { p_metric: 'faturamento' }),
    db.rpc('get_carteira_weddings', { p_metric: 'receita_bruta' }),
    db.rpc('get_proximos_casamentos', { p_horizonte_meses: 18 }),
    getBenchmarks(db),
    db.rpc('get_acumulado_weddings', { p_meses_passados: 24, p_meses_futuros: 18 }),
  ])

  const kpis      = kpisRes.error    ? null : kpisRes.data    as unknown as ExecutivaKpis
  const tendencia = tendRes.error    ? null : tendRes.data    as unknown as TendenciaMargem
  const produtos  = prodRes.error    ? null : prodRes.data    as unknown as MixProduto
  const prejuizos = prejRes.error    ? null : prejRes.data    as unknown as PrejuizosDetalhe
  const sparklines = sparkRes.error  ? null : sparkRes.data   as unknown as Sparklines | null
  const sumario   = sumarioRes.error ? null : sumarioRes.data as unknown as SumarioSubsetor
  const cartCas   = cartCasRes.error ? null : cartCasRes.data as unknown as CarteiraWeddings
  const cartFat   = cartFatRes.error ? null : cartFatRes.data as unknown as CarteiraWeddings
  const cartRb    = cartRbRes.error  ? null : cartRbRes.data  as unknown as CarteiraWeddings
  const proximos  = proximosRes.error? null : proximosRes.data as unknown as ProximosCasamentos
  const acumulado = acumuladoRes.error ? null : acumuladoRes.data as unknown as AcumuladoWeddings

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">
      {/* Filtros */}
      <div className="flex items-center justify-end gap-3 mb-6 flex-wrap">
        <Suspense>
          <PeriodoFilter defaultPreset="este-ano" />
        </Suspense>
      </div>

      {/* ── VISÃO GERAL ──────────────────────────────────────────── */}
      <TopSection titulo="Visão Geral">

        {/* KPI Grid — ordem: Fat · Rec Bruta · Margem% · Ticket · Rec Média · Casamentos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          {kpis ? (
            <>
              <KpiDrawerTrigger metrica="faturamento" rotulo="Faturamento" setor={setor}>
                <KpiCard
                  rotulo="Faturamento"
                  formula="Soma do valor total das vendas"
                  metrica={kpis.faturamento} formato="brl"
                  periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
                  isPeriodoProporcional={eParcial}
                  sparklineData={sparklines?.faturamento} sparklineLabels={sparklines?.labels}
                />
              </KpiDrawerTrigger>

              <KpiDrawerTrigger metrica="receita" rotulo="Receita Bruta" setor={setor}>
                <KpiCard
                  rotulo="Receita Bruta"
                  formula="Faturamento − pagamento ao fornecedor (hotel, cia. aérea). No turismo de agenciamento, a receita real é o que sobra após o repasse ao fornecedor. (ADR-0026)"
                  metrica={kpis.receita} formato="brl"
                  periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
                  isPeriodoProporcional={eParcial}
                  sparklineData={sparklines?.receita} sparklineLabels={sparklines?.labels}
                />
              </KpiDrawerTrigger>

              <MargemDrawerTrigger
                tendencia={tendencia}
                sumario={sumario}
                margemOk={benchmarks.margemAlvo}
                margemAlerta={benchmarks.margemAtencao}
              >
                <KpiCard
                  rotulo="Margem %"
                  formula="Receita Bruta ÷ Faturamento × 100"
                  metrica={kpis.margem_pct} formato="pct"
                  periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
                  benchmarkAlvo={benchmarks.margemAlvo} benchmarkAtencao={benchmarks.margemAtencao}
                  isPeriodoProporcional={eParcial}
                  sparklineData={(sparklines?.margem_pct ?? []).map(v => v ?? 0)} sparklineLabels={sparklines?.labels}
                />
              </MargemDrawerTrigger>

              <KpiCard
                rotulo="Ticket Médio"
                formula="Faturamento ÷ Casamentos"
                metrica={kpis.ticket_medio} formato="brl"
                periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
                isPeriodoProporcional={eParcial}
                sparklineData={(sparklines?.ticket_medio ?? []).map(v => v ?? 0)} sparklineLabels={sparklines?.labels}
              />

              <KpiCard
                rotulo="Receita Média"
                formula="Receita Bruta ÷ Casamentos"
                metrica={kpis.receita_media} formato="brl"
                periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
                isPeriodoProporcional={eParcial}
                sparklineData={(sparklines?.receita_media ?? []).map(v => v ?? 0)} sparklineLabels={sparklines?.labels}
              />

              <KpiCard
                rotulo="Casamentos Entregues"
                formula="Operações com Contrato de Casamento realizadas no período"
                metrica={kpis.vendas} formato="numero"
                periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
                isPeriodoProporcional={eParcial}
                sparklineData={sparklines?.vendas} sparklineLabels={sparklines?.labels}
              />
            </>
          ) : (
            Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
          )}
        </div>

        {/* Composição por Subsetor */}
        <Section titulo="Composição por Subsetor">
          <SumarioSubsetorCard data={sumario} />
        </Section>

        {/* Carteira: Vendas × Entregas */}
        <Section titulo="Carteira: Vendas × Entregas">
          <CarteiraMartrixCard
            casamentos={cartCas}
            faturamento={cartFat}
            receita_bruta={cartRb}
          />
        </Section>

        {/* Próximos Casamentos a Entregar */}
        <Section titulo="Próximos Casamentos a Entregar">
          <ProximosCasamentosCard data18m={proximos} />
        </Section>

        {/* Mix de Produtos + Prejuízos */}
        <Section titulo="Mix de Produtos e Prejuízos">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <MixProdutoTable data={produtos}  loading={false} />
            <PrejuizosTable  data={prejuizos} loading={false} />
          </div>
        </Section>

      </TopSection>

      {/* ── VISÃO ANALÍTICA POR OPERAÇÃO ─────────────────────────── */}
      <TopSection titulo="Visão Analítica por Operação">

        <Section titulo="Lista de Operações">
          <OperacoesSection />
        </Section>

        <Section titulo="Acumulado de Recebimentos e Pagamentos">
          <AcumuladoRecebPagChart data={acumulado} />
        </Section>

      </TopSection>
    </div>
  )
}
