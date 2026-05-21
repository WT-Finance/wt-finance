import { Suspense } from 'react'
import PeriodoFilter from '@/components/shared/periodo-filter'
import TopSection from '@/components/shared/top-section'
import KpiCard, { KpiCardSkeleton } from '@/components/shared/kpi-card'
import KpiDrawerTrigger from '@/components/shared/kpi-drawer-trigger'
import MargemDrawerTrigger from '@/components/weddings/margem-drawer-trigger'
import MixProdutoTable from '@/components/performance/mix-produto-table'
import VendasReceitaNegativaCard from '@/components/weddings/vendas-receita-negativa-card'
import SumarioSubsetorCard from '@/components/weddings/sumario-subsetor'
import CarteiraMartrixCard from '@/components/weddings/carteira-matrix-card'
import ProximosCasamentosCard from '@/components/weddings/proximos-casamentos-card'
import OperacoesSection from '@/components/weddings/operacoes-section'
import AcumuladoRecebPagChart from '@/components/weddings/acumulado-receb-pag-chart'
import FluxoCaixaMensal from '@/components/weddings/fluxo-caixa-mensal'
import DropdownOperacao from '@/components/weddings/dropdown-operacao'
import VendasEmAbertoCard from '@/components/weddings/vendas-em-aberto-card'
import { getServerClient } from '@/lib/supabase/server'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { getBenchmarks } from '@/lib/config'
import type {
  ExecutivaKpis, TendenciaMargem,
  MixProduto, SumarioSubsetor,
  CarteiraWeddings, ProximosCasamentos, AcumuladoWeddings, VendasEmAberto,
  OperacoesLista, VendasReceitaNegativa,
} from '@/types/api'

interface PeriodoSearchParams {
  preset?:   string
  from?:     string
  to?:       string
  operacao?: string
}

interface Props {
  searchParams: PeriodoSearchParams
}

export default async function WeddingsContent({ searchParams: sp }: Props) {
  const { from, to, antFrom, antTo, yoyFrom, yoyTo, eParcial } =
    resolverPeriodoCompleto({ ...sp, defaultPreset: 'este-ano' })
  const preset   = sp.preset ?? 'este-ano'
  const setor    = 'Weddings'
  const operacao = sp.operacao ?? null

  const db = getServerClient()

  const [
    kpisRes, tendRes, prodRes, prejRes, sumarioRes,
    cartCasRes, cartFatRes, cartRbRes, proximosRes, benchmarks, acumuladoRes, vendasAbertoRes,
    operacoesRes,
  ] = await Promise.all([
    db.rpc('get_executiva_kpis', {
      p_from: from, p_to: to, p_setor: setor,
      p_ant_from: antFrom, p_ant_to: antTo,
      p_yoy_from: yoyFrom, p_yoy_to: yoyTo,
    }),
    db.rpc('get_tendencia_margem', { p_from: from, p_to: to, p_setor: setor }),
    db.rpc('get_mix_produto',      { p_from: from, p_to: to, p_setor: setor, p_limite: 10 }),
    db.rpc('get_vendas_prejuizo_weddings', { p_from: from, p_to: to }),
    db.rpc('get_sumario_subsetor', { p_from: from, p_to: to }),
    db.rpc('get_carteira_weddings', { p_metric: 'casamentos' }),
    db.rpc('get_carteira_weddings', { p_metric: 'faturamento' }),
    db.rpc('get_carteira_weddings', { p_metric: 'receita_bruta' }),
    db.rpc('get_proximos_casamentos', { p_horizonte_meses: 18 }),
    getBenchmarks(db),
    db.rpc('get_acumulado_weddings', { p_meses_passados: 24, p_meses_futuros: 18, p_operacao: operacao }),
    db.rpc('get_vendas_em_aberto_weddings', { p_limite: 50, p_offset: 0 }),
    db.rpc('get_operacoes_lista_weddings'),
  ])

  const kpis          = kpisRes.error         ? null : kpisRes.data         as unknown as ExecutivaKpis
  const tendencia     = tendRes.error         ? null : tendRes.data         as unknown as TendenciaMargem
  const produtos      = prodRes.error         ? null : prodRes.data         as unknown as MixProduto
  const prejuizos     = prejRes.error         ? null : prejRes.data         as unknown as VendasReceitaNegativa
  const sumario       = sumarioRes.error      ? null : sumarioRes.data      as unknown as SumarioSubsetor
  const cartCas       = cartCasRes.error      ? null : cartCasRes.data      as unknown as CarteiraWeddings
  const cartFat       = cartFatRes.error      ? null : cartFatRes.data      as unknown as CarteiraWeddings
  const cartRb        = cartRbRes.error       ? null : cartRbRes.data       as unknown as CarteiraWeddings
  const proximos      = proximosRes.error     ? null : proximosRes.data     as unknown as ProximosCasamentos
  const acumulado     = acumuladoRes.error    ? null : acumuladoRes.data    as unknown as AcumuladoWeddings
  const vendasAberto  = vendasAbertoRes.error ? null : vendasAbertoRes.data as unknown as VendasEmAberto
  const operacoesList = operacoesRes.error    ? [] as OperacoesLista : operacoesRes.data as unknown as OperacoesLista

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

        {/* 1. KPIs — panorama agregado */}
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
                />
              </KpiDrawerTrigger>

              <KpiDrawerTrigger metrica="receita" rotulo="Receita Bruta" setor={setor}>
                <KpiCard
                  rotulo="Receita Bruta"
                  formula="Faturamento − pagamento ao fornecedor (hotel, cia. aérea). No turismo de agenciamento, a receita real é o que sobra após o repasse ao fornecedor. (ADR-0026)"
                  metrica={kpis.receita} formato="brl"
                  periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
                  isPeriodoProporcional={eParcial}
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
                />
              </MargemDrawerTrigger>

              <KpiCard
                rotulo="Ticket Médio"
                formula="Faturamento ÷ Casamentos"
                metrica={kpis.ticket_medio} formato="brl"
                periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
                isPeriodoProporcional={eParcial}
              />

              <KpiCard
                rotulo="Receita Média"
                formula="Receita Bruta ÷ Casamentos"
                metrica={kpis.receita_media} formato="brl"
                periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
                isPeriodoProporcional={eParcial}
              />

              <KpiCard
                rotulo="Casamentos Entregues"
                formula="Operações com Contrato de Casamento realizadas no período"
                metrica={kpis.vendas} formato="numero"
                periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
                isPeriodoProporcional={eParcial}
              />
            </>
          ) : (
            Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
          )}
        </div>

        {/* 2. Próximos Casamentos | Mix por Produto — ação + composição imediata */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ProximosCasamentosCard data18m={proximos} />
          <MixProdutoTable data={produtos} loading={false} />
        </div>

        {/* 3. Composição por Subsetor — estrutura analítica */}
        <div className="mb-6">
          <SumarioSubsetorCard data={sumario} />
        </div>

        {/* 4. Carteira: Vendas × Entregas — par estratégico */}
        <div className="mb-6">
          <CarteiraMartrixCard
            casamentos={cartCas}
            faturamento={cartFat}
            receita_bruta={cartRb}
          />
        </div>

        {/* 5. Vendas em Aberto | Vendas com Receita Negativa — exceções operacionais */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <VendasEmAbertoCard data={vendasAberto} />
          <VendasReceitaNegativaCard data={prejuizos} />
        </div>

      </TopSection>

      {/* ── VISÃO ANALÍTICA POR OPERAÇÃO ─────────────────────────── */}
      <TopSection titulo="Visão Analítica por Operação">

        <div className="mb-6">
          <OperacoesSection />
        </div>

        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-[--text-muted]">Filtrar gráficos por operação:</span>
          <Suspense>
            <DropdownOperacao
              operacoes={operacoesList}
              operacaoAtiva={operacao}
            />
          </Suspense>
        </div>

        <FluxoCaixaMensal data={acumulado} operacaoLabel={operacoesList.find(o => o.operacao === operacao)?.label.split(' - ')[1] ?? undefined} />

        <div className="mt-6">
          <AcumuladoRecebPagChart data={acumulado} operacaoLabel={operacoesList.find(o => o.operacao === operacao)?.label.split(' - ')[1] ?? undefined} />
        </div>

      </TopSection>
    </div>
  )
}
