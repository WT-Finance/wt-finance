import { Suspense } from 'react'
import { getServerClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/auth/sessao'
import { unwrapRpc } from '@/lib/rpc'
import { parseRpc } from '@/lib/schemas-rpc'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { fmtMi } from '@/lib/fmt'
import PeriodoFilterPillsUrl from '@/components/shared/periodo-filter-pills-url'
import FluxoMensalChart, { type FluxoMensalV3Row } from '@/components/financeiro/fluxo-mensal-chart'
import FluxoAcumuladoChart, { type FluxoAcumuladoRow } from '@/components/financeiro/fluxo-acumulado-chart'
import ComposicaoPeriodo from '@/components/financeiro/composicao-lancamentos'
import PosicaoPorConta from '@/components/financeiro/posicao-por-conta'
import TopSection from '@/components/shared/top-section'
import CalendarioLiquidez from '@/components/financeiro/calendario-liquidez'
import RunwaySemanal from '@/components/financeiro/runway-semanal'
import HorizontePrevisto from '@/components/financeiro/horizonte-previsto'
import RepasseMensal from '@/components/financeiro/repasse-mensal'
import RankingCaixa from '@/components/financeiro/ranking-caixa'
import SaldoCaixaKpi from '@/components/financeiro/saldo-caixa-kpi'
import type { Conta } from '@/components/financeiro/gerencial/tipos'
import {
  repasseMensalSchema, horizonteSchema, runwaySemanalSchema, rankingCaixaSchema,
  type RepasseMensalRow, type HorizonteBloco,
  type RunwaySemanal as RunwaySemanalData, type RankingCaixa as RankingCaixaData,
} from '@/lib/fluxo/rpc-fluxo'

interface SearchParams {
  preset?: string
  from?:   string
  to?:     string
}

interface KpisB {
  entradas_realizadas: number
  saidas_realizadas:   number
  saldo_realizado:     number
  entradas_previstas:  number
  saidas_previstas:    number
  saldo_previsto:      number
}

interface KpisDiario {
  saldo_em_caixa: number
  a_receber_10d:  number
  a_pagar_10d:    number
  ncg_10d:        number
}

interface PosicaoConta {
  conta:      string
  tipo_conta: string
  saldo:      number
}

interface DecomposicaoGrupo {
  grupo_categoria: string
  sinal:           'entrada' | 'saida'
  valor_total:     number
}

interface DecomposicaoCategoria {
  categoria:       string
  grupo_categoria: string
  sinal:           'entrada' | 'saida'
  valor_total:     number
}

const TOOLTIP_KPI_REALIZADO =
  'Reflete o fluxo de caixa bancário real, com gastos via cartão contabilizados no pagamento da fatura. Diferença esperada em relação à Decomposição por Grupo de Categoria devido ao ciclo de cartão (≤30 dias).'

// Feature flag (v4.9-M7): "Posição por Conta" temporariamente oculta a pedido da
// diretoria. Componente, RPC (get_posicao_por_conta) e dados são MANTIDOS no código
// para revisão futura — basta voltar a flag para `true`.
const MOSTRAR_POSICAO_POR_CONTA = false

/** Ano de hoje em America/Sao_Paulo — alimenta get_repasse_mensal(p_ano). */
function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function TooltipIcon({ text }: { text: string }) {
  return (
    <span title={text} className="text-zinc-300 hover:text-zinc-500 cursor-help">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4"/>
        <path d="M12 8h.01"/>
      </svg>
    </span>
  )
}

function KpiCard({ label, value, sub, tooltip, valueColor }: {
  label: string; value: string; sub?: string; tooltip?: string; valueColor?: string
}) {
  return (
    <div className="rounded-xl shadow-sm bg-white px-5 py-4">
      <div className="flex items-center gap-1 mb-0.5">
        <p className="text-2xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</p>
        {tooltip && <TooltipIcon text={tooltip} />}
      </div>
      {sub && <p className="text-3xs text-zinc-400 mb-3">{sub}</p>}
      {!sub && <div className="mb-3" />}
      <p className="text-2xl font-bold tabular-nums" style={{ color: valueColor ?? 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function NoDataMessage() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-500">Nenhum lançamento financeiro importado ainda</p>
      <p className="text-xs text-zinc-400 mt-1">
        Acesse <a href="/admin/uploads" className="underline hover:text-zinc-600">Upload de Arquivos</a> para importar os dados
      </p>
    </div>
  )
}

function CardTitle({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-4">
      <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{titulo}</h3>
      {subtitulo && <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{subtitulo}</span>}
    </div>
  )
}

export default async function FluxoCaixaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  // v4.13: guard de área (ADR-0109).
  await requireArea('financeiro/fluxo-caixa')

  const sp   = await searchParams
  const { from, to } = resolverPeriodoCompleto({ ...sp, defaultPreset: 'este-ano' })
  const anoAtual = Number(hojeSP().slice(0, 4))

  const db = await getServerClient()

  type RpcResult = { data: unknown; error: { message: string } | null }
  type BoundRpc  = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>
  const rpc = (db.rpc as unknown as BoundRpc).bind(db)

  const empty: RpcResult = { data: null, error: null }

  // v5.2.0/Onda 1 (M4): um único estágio de RPCs (mesmo padrão da v4.39.0). `get_gerencial_saldos`
  // alimenta o Saldo de Caixa KPI (Projetado) — a própria RPC exige 'financeiro/gerencial'
  // internamente (exigir_acesso); quem não tem a área recebe erro AQUI (Promise.allSettled/`rpc`
  // não lançam), e o KPI degrada para "—" (unwrapRpc → null → []) sem quebrar a página. As 4 RPCs
  // novas (repasse mensal, horizonte, runway semanal, ranking de caixa) entram no mesmo estágio.
  const [
    fluxoMensalRes,
    fluxoAcumuladoRes,
    kpisRes,
    kpisDiarioRes,
    decomposicaoRes,
    decomposicaoCategoriaRes,
    posicaoRes,
    saldosRes,
    repasseMensalRes,
    horizonteRes,
    runwaySemanalRes,
    rankingRes,
  ] = await Promise.allSettled([
    rpc('get_fluxo_caixa_mensal_v3'),
    rpc('get_fluxo_caixa_acumulado_v1'),
    rpc('get_fluxo_caixa_kpis_b',        { p_from: from, p_to: to }),
    rpc('get_fluxo_caixa_kpis_diario'),
    rpc('get_decomposicao_grupo',         { p_from: from, p_to: to }),
    rpc('get_decomposicao_categoria',     { p_from: from, p_to: to }),
    rpc('get_posicao_por_conta'),
    rpc('get_gerencial_saldos'),
    rpc('get_repasse_mensal',      { p_ano: anoAtual }),
    rpc('get_fluxo_horizonte'),
    rpc('get_fluxo_runway_semanal'),
    rpc('get_fluxo_ranking'),
  ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : empty))

  const fluxoMensalRows    = unwrapRpc<FluxoMensalV3Row[]>(fluxoMensalRes, 'get_fluxo_caixa_mensal_v3') ?? []
  const fluxoAcumuladoRows = unwrapRpc<FluxoAcumuladoRow[]>(fluxoAcumuladoRes, 'get_fluxo_caixa_acumulado_v1') ?? []

  const kpis = unwrapRpc<KpisB>(kpisRes, 'get_fluxo_caixa_kpis_b') ?? {
    entradas_realizadas: 0, saidas_realizadas: 0, saldo_realizado: 0,
    entradas_previstas: 0, saidas_previstas: 0, saldo_previsto: 0,
  }

  const kpisDiario: KpisDiario = unwrapRpc<KpisDiario>(kpisDiarioRes, 'get_fluxo_caixa_kpis_diario') ?? {
    saldo_em_caixa: 0,
    a_receber_10d:  0,
    a_pagar_10d:    0,
    ncg_10d:        0,
  }

  const decomposicao = unwrapRpc<DecomposicaoGrupo[]>(decomposicaoRes, 'get_decomposicao_grupo') ?? []
  const decomposicaoCategorias =
    unwrapRpc<DecomposicaoCategoria[]>(decomposicaoCategoriaRes, 'get_decomposicao_categoria') ?? []
  const posicoes = unwrapRpc<PosicaoConta[]>(posicaoRes, 'get_posicao_por_conta') ?? []

  // Saldos gerenciais (Conta[]) — vazio (fail-safe) quando o usuário não tem financeiro/gerencial
  // ou a RPC falha; SaldoCaixaKpi degrada para "—" nesse caso, sem quebrar a página.
  const saldosGerencial: Conta[] = unwrapRpc<Conta[]>(saldosRes, 'get_gerencial_saldos') ?? []

  // As 4 RPCs novas do Onda 1 — schema Zod valida o SHAPE; falha (RPC quebrada/drift) degrada
  // para o "vazio" do tipo, e cada componente novo já trata array/objeto vazio internamente
  // ("sem dados"), preservando o invariante "seção indisponível não derruba a página".
  const repasseMensalRows: RepasseMensalRow[] =
    parseRpc(repasseMensalSchema, repasseMensalRes, 'get_repasse_mensal') ?? []
  const horizonteBlocos: HorizonteBloco[] =
    parseRpc(horizonteSchema, horizonteRes, 'get_fluxo_horizonte') ?? []
  const runwaySemanal: RunwaySemanalData =
    parseRpc(runwaySemanalSchema, runwaySemanalRes, 'get_fluxo_runway_semanal') ?? { saldo_operacional: 0, semanas: [] }
  const rankingCaixa: RankingCaixaData =
    parseRpc(rankingCaixaSchema, rankingRes, 'get_fluxo_ranking') ?? { pioraram: [], melhoraram: [] }

  const totalEntradas = kpis.entradas_realizadas
  const totalSaidas   = kpis.saidas_realizadas
  const saldoLiquido  = kpis.saldo_realizado

  const temDados = fluxoMensalRows.length > 0 || kpis.entradas_realizadas > 0 || kpis.saidas_realizadas > 0

  const entradas = decomposicao.filter(d => d.sinal === 'entrada').sort((a, b) => b.valor_total - a.valor_total)
  const saidas   = decomposicao.filter(d => d.sinal === 'saida').sort((a, b) => b.valor_total - a.valor_total)

  const saldoTotal = posicoes.reduce((s, p) => s + p.saldo, 0)

  return (
    <div>

      {/* ── FLUXO PROJETADO ──────────────────────────────────────────────── */}
      <TopSection titulo="Fluxo Projetado" subtitulo="Baseado em lançamentos de Contas a Pagar/a Receber">

        {/* 4 KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SaldoCaixaKpi saldos={saldosGerencial} />
          <KpiCard
            label="A Receber"
            value={fmtMi(kpisDiario.a_receber_10d)}
            sub="próx. 10 dias"
          />
          <KpiCard
            label="A Pagar"
            value={fmtMi(kpisDiario.a_pagar_10d)}
            sub="próx. 10 dias"
          />
          <KpiCard
            label="NCG"
            value={fmtMi(kpisDiario.ncg_10d)}
            sub="próx. 10 dias"
            valueColor={kpisDiario.ncg_10d >= 0 ? 'var(--positive)' : 'var(--negative)'}
            tooltip="Necessidade de Capital de Giro: A Receber − A Pagar nos próximos 10 dias"
          />
        </div>

        {/* Calendário (60%) + Runway Semanal (40%) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
          <div className="lg:col-span-3 flex flex-col">
            <Suspense fallback={<div className="h-64 animate-pulse bg-zinc-100 rounded-xl" />}>
              <CalendarioLiquidez />
            </Suspense>
          </div>
          <div className="lg:col-span-2 flex flex-col">
            <RunwaySemanal data={runwaySemanal} />
          </div>
        </div>

        <HorizontePrevisto blocos={horizonteBlocos} />

      </TopSection>

      {/* ── FLUXO REALIZADO ──────────────────────────────────────────────── */}
      <TopSection titulo="Fluxo Realizado">

        {/* Period filter pills */}
        <div className="mb-6">
          <Suspense>
            <PeriodoFilterPillsUrl defaultPreset="este-ano" />
          </Suspense>
        </div>

        {/* 3 KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <KpiCard
            label="Entradas realizadas"
            value={fmtMi(totalEntradas)}
            sub="do período"
            tooltip={TOOLTIP_KPI_REALIZADO}
          />
          <KpiCard
            label="Saídas realizadas"
            value={fmtMi(totalSaidas)}
            sub="do período"
            tooltip={TOOLTIP_KPI_REALIZADO}
          />
          <KpiCard
            label="Resultado de caixa"
            value={fmtMi(saldoLiquido)}
            sub="do período"
            tooltip={TOOLTIP_KPI_REALIZADO}
            valueColor={saldoLiquido >= 0 ? 'var(--positive)' : 'var(--negative)'}
          />
        </div>

        {!temDados && <NoDataMessage />}

        {temDados && (
          <>
            {/* Fluxo Mensal chart — card e título dentro do componente */}
            <FluxoMensalChart rows={fluxoMensalRows} />

            {/* Acumulado chart — título dentro do card */}
            <div className="rounded-xl shadow-sm bg-white p-5 mb-4">
              <CardTitle titulo="Acumulado de Recebimentos e Pagamentos" subtitulo="24 meses passados + 18 futuros" />
              <FluxoAcumuladoChart rows={fluxoAcumuladoRows} />
            </div>

            {/* Repasse Mensal (v5.2.0/Onda 1) */}
            <div className="mb-4">
              <RepasseMensal rows={repasseMensalRows} />
            </div>

            {/* Ranking de Caixa (v5.2.0/Onda 1) */}
            <div className="mb-4">
              <RankingCaixa data={rankingCaixa} />
            </div>

            {/* Composição dos Lançamentos (largura total) — título dentro do card */}
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div className="rounded-xl shadow-sm bg-white p-5">
                <CardTitle titulo="Composição dos Lançamentos" subtitulo="no período selecionado" />
                <p className="text-2xs text-zinc-400 mb-3 -mt-2">
                  Decomposição por Grupo de Categoria (Lançamentos — regime contábil). Pode diferir levemente dos KPIs acima, que refletem fluxo bancário real.
                </p>
                <ComposicaoPeriodo entradas={entradas} saidas={saidas} categorias={decomposicaoCategorias} />
              </div>

              {/* Posição por Conta — oculta via flag (v4.9-M7); mantida p/ revisão futura */}
              {MOSTRAR_POSICAO_POR_CONTA && (
                <div className="rounded-xl shadow-sm bg-white p-5">
                  <CardTitle titulo="Posição por Conta" />
                  <PosicaoPorConta posicoes={posicoes} saldoTotal={saldoTotal} />
                </div>
              )}
            </div>

          </>
        )}
      </TopSection>

    </div>
  )
}
