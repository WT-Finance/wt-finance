import { Suspense } from 'react'
import PeriodoFilter from '@/components/shared/periodo-filter'
import TopSection from '@/components/shared/top-section'
import WeddingsKpisSection from '@/components/weddings/weddings-kpis-section'
import WeddingsMixSection from '@/components/weddings/weddings-mix-section'
import VendasReceitaNegativaCard from '@/components/weddings/vendas-receita-negativa-card'
import CarteiraMartrixCard from '@/components/weddings/carteira-matrix-card'
import ProximosCasamentosCard from '@/components/weddings/proximos-casamentos-card'
import OperacoesSection from '@/components/weddings/operacoes-section'
import AcumuladoRecebPagChart from '@/components/weddings/acumulado-receb-pag-chart'
import FluxoCaixaMensal from '@/components/weddings/fluxo-caixa-mensal'
import DropdownOperacao from '@/components/weddings/dropdown-operacao'
import VendasEmAbertoCard from '@/components/weddings/vendas-em-aberto-card'
import { getServerClient } from '@/lib/supabase/server'
import { unwrapRpc } from '@/lib/rpc'
import { getBenchmarks } from '@/lib/config'
import type {
  CarteiraWeddings, ProximosCasamentos, AcumuladoWeddings, VendasEmAberto,
  OperacoesLista, VendasReceitaNegativa,
} from '@/types/api'

interface Props {
  searchParams: { operacao?: string }
}

// OCULTADO v4.8.2 — cards de diagnóstico (Vendas em Aberto / Receita Negativa)
// mantidos no código para possível retorno; basta alternar a flag para true.
const MOSTRAR_VENDAS_DIAGNOSTICO = false

export default async function WeddingsContent({ searchParams: sp }: Props) {
  const operacao = sp.operacao ?? null
  const db = getServerClient()

  const [
    cartCasRes,
    proximosRes, benchmarks, acumuladoRes,
    vendasAbertoRes, operacoesRes, prejRes,
  ] = await Promise.all([
    db.rpc('get_carteira_weddings', { p_metric: 'casamentos' }),
    db.rpc('get_proximos_casamentos', { p_horizonte_meses: 18 }),
    getBenchmarks(db),
    db.rpc('get_acumulado_weddings', { p_meses_passados: 24, p_meses_futuros: 18, p_operacao: operacao }),
    db.rpc('get_vendas_em_aberto_weddings', { p_limite: 50, p_offset: 0 }),
    db.rpc('get_operacoes_lista_weddings'),
    // Vendas com Receita Negativa: exibe histórico completo (ADR-0053)
    db.rpc('get_vendas_prejuizo_weddings', { p_from: '2020-01-01', p_to: '2099-12-31' }),
  ])

  const cartCas       = unwrapRpc<CarteiraWeddings>(cartCasRes, 'get_carteira_weddings')
  const proximos      = unwrapRpc<ProximosCasamentos>(proximosRes, 'get_proximos_casamentos')
  const acumulado     = unwrapRpc<AcumuladoWeddings>(acumuladoRes, 'get_acumulado_weddings')
  const vendasAberto  = unwrapRpc<VendasEmAberto>(vendasAbertoRes, 'get_vendas_em_aberto_weddings')
  const operacoesList = unwrapRpc<OperacoesLista>(operacoesRes, 'get_operacoes_lista_weddings') ?? [] as OperacoesLista
  const prejuizos     = unwrapRpc<VendasReceitaNegativa>(prejRes, 'get_vendas_prejuizo_weddings')

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">

      {/* ── VISÃO GERAL ──────────────────────────────────────────── */}
      <TopSection titulo="Visão Geral">

        {/* Filtro de período — pills posicionadas no início da Visão Geral */}
        <div className="mb-6">
          <Suspense>
            <PeriodoFilter />
          </Suspense>
        </div>

        {/* 1. KPIs — panorama agregado */}
        <div className="mb-6">
          <WeddingsKpisSection benchmarks={benchmarks} />
        </div>

        {/* 2. Próximos Casamentos | Mix por Produto — ação + composição imediata */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ProximosCasamentosCard data18m={proximos} />
          <WeddingsMixSection />
        </div>

        {/* 3. Carteira: Vendas × Entregas — par estratégico */}
        <div className="mb-6">
          <CarteiraMartrixCard casamentos={cartCas} />
        </div>

        {/* 4. Vendas em Aberto | Vendas com Receita Negativa — exceções operacionais */}
        {/* OCULTADO v4.8.2 — manter para possível retorno (alternar MOSTRAR_VENDAS_DIAGNOSTICO) */}
        {MOSTRAR_VENDAS_DIAGNOSTICO && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <VendasEmAbertoCard data={vendasAberto} />
            <VendasReceitaNegativaCard data={prejuizos} />
          </div>
        )}

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
