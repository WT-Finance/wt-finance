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
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { getServerClient, type ServerClient } from '@/lib/supabase/server'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { unwrapRpc, unwrapRpcComErro } from '@/lib/rpc'
import {
  parseRpc,
  mixProdutoSchema,
  tendenciaMargemSchema,
  rankingVendedoresRangeSchema,
  vendasEmAbertoSchema,
  vendasReceitaNegativaSchema,
} from '@/lib/schemas-rpc'
import { getBenchmarks } from '@/lib/config'
import type {
  ExecutivaKpis, MixSetor,
  PrejuizosDetalhe, CagrData, RankingVendedorItem,
} from '@/types/api'

// v4.12/M4 (F3): Top Vendedores em UMA chamada. get_ranking_vendedores_range
// (migration 0117) agrega o intervalo de meses NO BANCO — fim do fan-out mensal
// (até 36 chamadas) da v4.10. Limite alto (100) para o ranking do período ser exato.
async function fetchTopVendedores(
  db: ServerClient,
  from: string, to: string, setor: string,
): Promise<RankingVendedorItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (db.rpc as any)('get_ranking_vendedores_range', {
    p_from: from, p_to: to, p_setor: setor, p_limite: 100,
  })
  return parseRpc(rankingVendedoresRangeSchema, res, 'get_ranking_vendedores_range') ?? []
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
// por Conta). MANTIDA (F12, v4.12). DESTRAVA = horizonte de dado confiável por
// setor + entendimento da diretoria sobre a métrica (taxa alisada, sensível a
// histórico curto).
const MOSTRAR_CAGR = false

// v4.10.1: layout Trips/Corp no padrão de Weddings (uma única seção "Visão Geral"
// com card KPI unificado, Mix por Produto | Top Vendedores e Vendas em Aberto |
// Receita Negativa). As seções analíticas anteriores — Mix por Setor, Tendência
// de Margem e Prejuízos (margem negativa) — saíram da visão por decisão do usuário,
// mas o código (fetch + JSX) é mantido recuperável atrás desta flag. A Tendência
// de Margem segue acessível dentro do drawer rico (card KPI → "Ver mais").
// MANTIDA (F12, v4.12). DESTRAVA = aba Geral (v5.0), onde Mix por Setor
// (breakdown cross-setor) volta a fazer sentido.
const MOSTRAR_SECOES_LEGADAS = false

export default async function PerformanceContent({ setor, searchParams: sp }: Props) {
  const { from, to, antFrom, antTo, yoyFrom, yoyTo } =
    resolverPeriodoCompleto({ ...sp, defaultPreset: 'este-ano' })
  const preset = sp.preset ?? 'este-ano'

  const db = await getServerClient()

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

  // F5 (v4.12): erro ≠ vazio. unwrapRpc loga a falha com contexto (sai do silêncio);
  // o KPI principal usa a flag de erro para mostrar estado discreto em vez de skeleton eterno.
  const { data: kpis, erro: kpisErro } = unwrapRpcComErro<ExecutivaKpis>(kpisRes, 'get_executiva_kpis')
  const mix        = unwrapRpc<MixSetor>(mixRes, 'get_mix_setor')
  const tendencia  = parseRpc(tendenciaMargemSchema, tendRes, 'get_tendencia_margem') // F7: valida shape
  const produtos   = parseRpc(mixProdutoSchema, prodRes, 'get_mix_produto') // F7: valida shape
  const prejuizos  = unwrapRpc<PrejuizosDetalhe>(prejRes, 'get_prejuizos')
  const cagr       = unwrapRpc<CagrData>(cagrRes, 'get_cagr')
  const vendasAberto    = parseRpc(vendasEmAbertoSchema, vendasAbertoRes, 'get_vendas_em_aberto') // F7
  const receitaNegativa = parseRpc(vendasReceitaNegativaSchema, receitaNegRes, 'get_vendas_receita_negativa') // F7

  const mostrarSetorFilter = setor === 'todos'

  return (
    <div className="max-w-7xl mx-auto px-6">

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
          {kpisErro ? (
            <div className="bg-white rounded-xl shadow-sm px-5 py-8 flex justify-center">
              <ErroCarregamento />
            </div>
          ) : kpis ? (
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
