import { Suspense } from 'react'
import PeriodoPills from '@/components/shared/periodo-pills-url'
import SetorFilter from '@/components/shared/setor-filter'
import KpiPrincipalCard from '@/components/performance/kpi-principal-card'
import MixSetorTable from '@/components/performance/mix-setor-table'
import CagrCard from '@/components/performance/cagr-card'
import TendenciaMargemChart from '@/components/performance/tendencia-margem-chart'
import MixProdutoTable from '@/components/performance/mix-produto-table'
import PrejuizosTable from '@/components/performance/prejuizos-table'
import TopVendedoresCard from '@/components/performance/top-vendedores-card'
import VendasEmAbertoCard from '@/components/weddings/vendas-em-aberto-card'
import VendasReceitaNegativaCard from '@/components/weddings/vendas-receita-negativa-card'
import TopSection from '@/components/shared/top-section'
import { getServerClient } from '@/lib/supabase/server'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { getBenchmarks } from '@/lib/config'
import type {
  ExecutivaKpis, MixSetor, TendenciaMargem,
  MixProduto, PrejuizosDetalhe, CagrData, RankingVendedorItem,
  VendasEmAberto, VendasReceitaNegativa,
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

// v4.10.1: layout Trips/Corp no padrão de Weddings (uma única seção "Visão Geral"
// com card KPI unificado, Mix por Produto | Top Vendedores e Vendas em Aberto |
// Receita Negativa). As seções analíticas anteriores — Mix por Setor, Tendência
// de Margem e Prejuízos (margem negativa) — saíram da visão por decisão do usuário,
// mas o código (fetch + JSX) é mantido recuperável atrás desta flag. A Tendência
// de Margem segue acessível dentro do drawer rico (card KPI → "Ver mais").
const MOSTRAR_SECOES_LEGADAS = false

export default async function PerformanceContent({ setor, searchParams: sp }: Props) {
  const { from, to, antFrom, antTo, yoyFrom, yoyTo } =
    resolverPeriodoCompleto({ ...sp, defaultPreset: 'este-ano' })
  const preset = sp.preset ?? 'este-ano'

  const db = getServerClient()

  const [
    [kpisRes, mixRes, tendRes, prodRes, prejRes, cagrRes, benchmarks],
    vendedores,
    vendasAbertoRes,
    receitaNegRes,
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
    // get_vendas_em_aberto (0114) e get_vendas_receita_negativa (0115): RPCs novas.
    // `as any` enquanto não regeneramos os tipos do supabase — padrão das RPCs
    // recém-criadas no projeto.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.rpc as any)('get_vendas_em_aberto', { p_setor: setor, p_limite: 50, p_offset: 0 }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.rpc as any)('get_vendas_receita_negativa', { p_setor: setor, p_from: '2020-01-01', p_to: '2099-12-31' }),
  ])

  const kpis       = kpisRes.error  ? null : kpisRes.data  as unknown as ExecutivaKpis
  const mix        = mixRes.error   ? null : mixRes.data   as unknown as MixSetor
  const tendencia  = tendRes.error  ? null : tendRes.data  as unknown as TendenciaMargem
  const produtos   = prodRes.error  ? null : prodRes.data  as unknown as MixProduto
  const prejuizos  = prejRes.error  ? null : prejRes.data  as unknown as PrejuizosDetalhe
  const cagr       = cagrRes.error  ? null : cagrRes.data  as unknown as CagrData
  const vendasAberto    = vendasAbertoRes?.error ? null : (vendasAbertoRes?.data as VendasEmAberto | undefined) ?? null
  const receitaNegativa = receitaNegRes?.error   ? null : (receitaNegRes?.data   as VendasReceitaNegativa | undefined) ?? null

  const mostrarSetorFilter = setor === 'todos'

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">

      {/* ── VISÃO GERAL ──────────────────────────────────────────── */}
      <TopSection titulo="Visão Geral">

        {/* Filtro de período — pills no início da Visão Geral, alinhadas à esquerda
            (padrão de Weddings). SetorFilter (só no Geral) à direita. */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Suspense>
            <PeriodoPills defaultPreset="este-ano" />
          </Suspense>
          {mostrarSetorFilter && (
            <Suspense>
              <SetorFilter />
            </Suspense>
          )}
        </div>

        {/* KPI principal — card único clicável (abre o drawer rico por setor) */}
        <div className="mb-6">
          {kpis ? (
            <KpiPrincipalCard kpis={kpis} setor={setor} />
          ) : (
            <div className="bg-zinc-100 animate-pulse rounded-xl h-28" />
          )}
        </div>

        {/* Mix por Produto | Top Vendedores */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <MixProdutoTable data={produtos} loading={false} periodoLabel="no período selecionado" />
          <TopVendedoresCard data={vendedores} periodoLabel="no período selecionado" />
        </div>

        {/* Vendas em Aberto | Vendas com Receita Negativa */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <VendasEmAbertoCard data={vendasAberto} />
          <VendasReceitaNegativaCard data={receitaNegativa} />
        </div>

      </TopSection>

      {/* ── SEÇÕES LEGADAS (ocultas v4.10.1 — alternar MOSTRAR_SECOES_LEGADAS) ── */}
      {MOSTRAR_SECOES_LEGADAS && (
        <>
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

          <TopSection titulo="Tendência de Margem">
            <TendenciaMargemChart
              data={tendencia}
              loading={false}
              margemOk={benchmarks.margemAlvo}
              margemAlerta={benchmarks.margemAtencao}
            />
          </TopSection>

          <TopSection titulo="Vendas com Prejuízo (margem negativa)">
            <PrejuizosTable data={prejuizos} loading={false} />
          </TopSection>
        </>
      )}
    </div>
  )
}
