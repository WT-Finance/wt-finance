import { Suspense } from 'react'
import PeriodoPills from '@/components/shared/periodo-pills-url'
import SetorFilter from '@/components/shared/setor-filter'
import KpiCard, { KpiCardSkeleton } from '@/components/shared/kpi-card'
import KpiDrawerTrigger from '@/components/shared/kpi-drawer-trigger'
import MixSetorTable from '@/components/performance/mix-setor-table'
import CagrCard from '@/components/performance/cagr-card'
import TendenciaMargemChart from '@/components/performance/tendencia-margem-chart'
import MixProdutoTable from '@/components/performance/mix-produto-table'
import PrejuizosTable from '@/components/performance/prejuizos-table'
import TopVendedoresCard from '@/components/performance/top-vendedores-card'
import TopSection from '@/components/shared/top-section'
import { getServerClient } from '@/lib/supabase/server'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { getBenchmarks } from '@/lib/config'
import type {
  ExecutivaKpis, MixSetor, TendenciaMargem,
  MixProduto, PrejuizosDetalhe, CagrData, RankingVendedorItem,
} from '@/types/api'

// v4.10/M5: Top Vendedores. A RPC get_ranking_vendedores é MENSAL (p_ano, p_mes);
// para respeitar o período (range), enumeramos os meses do intervalo (capados no
// mês atual) e agregamos por vendedor. As chamadas são paralelas (Promise.all),
// sobre uma MV pré-computada → custo ≈ uma ida ao banco. Reusa a RPC existente
// (sem RPC nova). Limite alto por mês (100) para o ranking do período ser exato.
function mesesNoIntervalo(from: string, to: string): { ano: number; mes: number }[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const now = new Date()
  const capY = now.getFullYear()
  const capM = now.getMonth() + 1
  const meses: { ano: number; mes: number }[] = []
  let y = fy, m = fm
  while ((y < ty || (y === ty && m <= tm)) && meses.length <= 36) {
    if (y < capY || (y === capY && m <= capM)) meses.push({ ano: y, mes: m })
    m++; if (m > 12) { m = 1; y++ }
  }
  return meses
}

async function fetchTopVendedores(
  db: ReturnType<typeof getServerClient>,
  from: string, to: string, setor: string,
): Promise<RankingVendedorItem[]> {
  const meses = mesesNoIntervalo(from, to)
  if (meses.length === 0) return []
  const results = await Promise.all(
    meses.map(({ ano, mes }) =>
      db.rpc('get_ranking_vendedores', { p_ano: ano, p_mes: mes, p_setor: setor, p_limite: 100 }),
    ),
  )
  const acc = new Map<number, RankingVendedorItem>()
  for (const r of results) {
    const rows = (r.error ? [] : (r.data as unknown as RankingVendedorItem[])) ?? []
    for (const v of rows) {
      const cur = acc.get(v.vendedor_id) ?? {
        vendedor_id: v.vendedor_id, nome: v.nome, valor_total: 0, receitas: 0, vendas_count: 0,
      }
      cur.valor_total  += v.valor_total
      cur.receitas     += v.receitas
      cur.vendas_count += v.vendas_count
      acc.set(v.vendedor_id, cur)
    }
  }
  return [...acc.values()].sort((a, b) => b.valor_total - a.valor_total)
}

interface PeriodoSearchParams {
  preset?: string
  from?:   string
  to?:     string
}

interface Props {
  setor:        string
  searchParams: PeriodoSearchParams
}

// v4.10/M7: CAGR ocultado por ora via flag (código + RPC mantidos, como Posição
// por Conta). Pendência: depende do horizonte de dado confiável por setor e do
// entendimento da diretoria sobre a métrica (taxa alisada, sensível a histórico curto).
const MOSTRAR_CAGR = false

export default async function PerformanceContent({ setor, searchParams: sp }: Props) {
  const { from, to, antFrom, antTo, yoyFrom, yoyTo, eParcial } =
    resolverPeriodoCompleto({ ...sp, defaultPreset: 'este-ano' })
  const preset = sp.preset ?? 'este-ano'

  const db = getServerClient()

  const [
    [kpisRes, mixRes, tendRes, prodRes, prejRes, cagrRes, benchmarks],
    vendedores,
  ] = await Promise.all([
    Promise.all([
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
    ] as const),
    fetchTopVendedores(db, from, to, setor),
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
          <PeriodoPills defaultPreset="este-ano" />
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

      {/* Mix Setor (+ CAGR oculto por flag — M7). Sem CAGR, o Mix ocupa a largura toda. */}
      <TopSection titulo="Mix por Setor">
        {MOSTRAR_CAGR ? (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <MixSetorTable data={mix} loading={false} margemAlvo={benchmarks.margemAlvo} preset={preset} />
            </div>
            <div>
              <CagrCard data={cagr} loading={false} />
            </div>
          </div>
        ) : (
          <MixSetorTable data={mix} loading={false} margemAlvo={benchmarks.margemAlvo} preset={preset} />
        )}
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

      {/* Top Vendedores (M5) — agregado pelo período, por setor */}
      <TopSection titulo="Top Vendedores">
        <TopVendedoresCard data={vendedores} />
      </TopSection>
    </div>
  )
}
