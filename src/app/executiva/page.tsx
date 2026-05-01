import { Suspense } from 'react'
import PeriodoFilter from '@/components/shared/periodo-filter'
import { resolverPeriodoCompleto, formatarLabelPeriodo } from '@/lib/periodo'
import SetorFilter from '@/components/shared/setor-filter'
import KpiCard, { KpiCardSkeleton } from '@/components/shared/kpi-card'
import MixSetorChart from '@/components/executiva/mix-setor-chart'
import PrejuizosKpi from '@/components/executiva/prejuizos-kpi'
import SumarioExecutivo from '@/components/executiva/sumario-executivo'
import Historico12mChart from '@/components/executiva/historico-12m-chart'
import DecomposicaoVariacaoCard from '@/components/executiva/decomposicao-variacao-card'
import PontosAtencaoCard from '@/components/executiva/pontos-atencao-card'
import { getServerClient } from '@/lib/supabase/server'
import { getBenchmarks } from '@/lib/config'
import { gerarSumarioExecutivo } from '@/lib/sumario-executivo'
import { avaliarTodasRegras } from '@/lib/regras-alerta'
import type { ExecutivaKpis, MixSetor, PrejuizosSummary, Historico12m, Sparklines, DecomposicaoVariacao } from '@/types/api'

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
  const { from, to, antFrom, antTo, yoyFrom, yoyTo, eParcial } =
    resolverPeriodoCompleto(sp)
  const setor  = sp.setor ?? 'todos'
  const preset = sp.preset ?? 'mes-passado'

  const db = getServerClient()

  const [
    kpisRes, mixRes, prejRes, prejAntRes,
    histRes, sparkRes, decompRes, benchmarks,
  ] = await Promise.all([
    db.rpc('get_executiva_kpis', {
      p_from:     from,     p_to:       to,     p_setor:    setor,
      p_ant_from: antFrom,  p_ant_to:   antTo,
      p_yoy_from: yoyFrom,  p_yoy_to:   yoyTo,
    }),
    db.rpc('get_mix_setor',    { p_from: from,    p_to: to,    p_setor: setor }),
    db.rpc('get_prejuizos',    { p_from: from,    p_to: to,    p_setor: setor, p_summary: true }),
    db.rpc('get_prejuizos',    { p_from: antFrom, p_to: antTo, p_setor: setor, p_summary: true }),
    db.rpc('get_historico_12m', { p_setor: setor }),
    db.rpc('get_sparklines',   { p_preset: preset, p_from: from, p_to: to, p_setor: setor }),
    db.rpc('get_decomposicao_variacao', {
      p_from: from, p_to: to, p_ant_from: antFrom, p_ant_to: antTo, p_setor: setor,
    }),
    getBenchmarks(db),
  ])

  const kpis         = kpisRes.error    ? null : kpisRes.data    as unknown as ExecutivaKpis
  const mix          = mixRes.error     ? null : mixRes.data     as unknown as MixSetor
  const prejuizos    = prejRes.error    ? null : prejRes.data    as unknown as PrejuizosSummary
  const prejuizosAnt = prejAntRes.error ? null : prejAntRes.data as unknown as PrejuizosSummary
  const historico    = histRes.error    ? null : histRes.data    as unknown as Historico12m
  const sparklines   = sparkRes.error   ? null : sparkRes.data   as unknown as Sparklines | null
  const decomposicao = decompRes.error  ? null : decompRes.data  as unknown as DecomposicaoVariacao

  // Pontos de atenção — avaliados a partir dos dados já carregados, sem chamada extra ao banco
  const alertas = avaliarTodasRegras({
    kpis, mix, prejuizos, prejuizosAnt, historico, decomposicao, benchmarks, eParcial,
  })

  // Sumário Executivo — calculado a partir dos dados já carregados, sem chamada extra ao banco
  const hoje    = new Date()
  const diaLabel = eParcial
    ? (preset === 'este-mes' || preset === 'mes-passado'
        ? String(hoje.getDate())
        : `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}`)
    : undefined

  const textoSumario = kpis ? gerarSumarioExecutivo({
    periodo: {
      label:     formatarLabelPeriodo(preset, from, to),
      eParcial,
      diaLabel,
    },
    faturamento: {
      valor:        kpis.faturamento.valor ?? 0,
      varAnterior:  kpis.faturamento.variacao_anterior,
      varYoY:       kpis.faturamento.variacao_yoy,
    },
    margem: {
      pct:  kpis.margem_pct.valor,
      alvo: benchmarks.margemAlvo,
    },
    setores: (mix?.setores ?? []).map(s => ({
      nome:         s.display_nome,
      pctFat:       s.pct_faturamento,
      margem:       s.margem_pct,
      margemVsAlvo: s.margem_pct != null ? s.margem_pct - benchmarks.margemAlvo : null,
    })),
    prejuizos: {
      quantidade: prejuizos?.quantidade ?? 0,
      valor:      prejuizos?.valor_prejuizo_total ?? 0,
    },
    vendasCount: kpis.vendas.valor ?? 0,
  }) : null

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">
      {/* Filtros */}
      <div className="flex items-center justify-end gap-3 mb-6 flex-wrap">
        <Suspense>
          <PeriodoFilter defaultPreset="mes-passado" />
        </Suspense>
        <Suspense>
          <SetorFilter />
        </Suspense>
      </div>

      {/* Sumário Executivo */}
      {textoSumario && <SumarioExecutivo texto={textoSumario} />}

      {/* Linha temporal 12 meses */}
      <Historico12mChart data={historico} />

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
              isPeriodoProporcional={eParcial}
              sparklineData={sparklines?.faturamento}
              sparklineLabels={sparklines?.labels}
            />
            <KpiCard
              rotulo="Receita"
              metrica={kpis.receita}
              formato="brl"
              periodoAnterior={kpis.periodo_anterior}
              periodoYoY={kpis.periodo_yoy}
              isPeriodoProporcional={eParcial}
              sparklineData={sparklines?.receita}
              sparklineLabels={sparklines?.labels}
            />
            <KpiCard
              rotulo="Margem %"
              metrica={kpis.margem_pct}
              formato="pct"
              periodoAnterior={kpis.periodo_anterior}
              periodoYoY={kpis.periodo_yoy}
              benchmarkAlvo={benchmarks.margemAlvo}
              benchmarkAtencao={benchmarks.margemAtencao}
              isPeriodoProporcional={eParcial}
              sparklineData={(sparklines?.margem_pct ?? []).map(v => v ?? 0)}
              sparklineLabels={sparklines?.labels}
            />
            <KpiCard
              rotulo="Vendas"
              metrica={kpis.vendas}
              formato="numero"
              periodoAnterior={kpis.periodo_anterior}
              periodoYoY={kpis.periodo_yoy}
              isPeriodoProporcional={eParcial}
              sparklineData={sparklines?.vendas}
              sparklineLabels={sparklines?.labels}
            />
            <KpiCard
              rotulo="Ticket Médio"
              metrica={kpis.ticket_medio}
              formato="brl"
              periodoAnterior={kpis.periodo_anterior}
              periodoYoY={kpis.periodo_yoy}
              isPeriodoProporcional={eParcial}
              sparklineData={(sparklines?.ticket_medio ?? []).map(v => v ?? 0)}
              sparklineLabels={sparklines?.labels}
            />
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)
        )}
      </div>

      {/* Mix por Setor + Prejuízos */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <div className="xl:col-span-2">
          <MixSetorChart data={mix} loading={false} />
        </div>
        <div>
          <PrejuizosKpi data={prejuizos} loading={false} />
        </div>
      </div>

      {/* Decomposição de variação */}
      <DecomposicaoVariacaoCard data={decomposicao} />

      {/* Pontos de atenção */}
      <PontosAtencaoCard resultado={alertas} />
    </div>
  )
}
