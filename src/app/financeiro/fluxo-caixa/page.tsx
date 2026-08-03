import { Suspense } from 'react'
import { getServerClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/auth/sessao'
import { unwrapRpc } from '@/lib/rpc'
import { parseRpc } from '@/lib/schemas-rpc'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { fmtMi, hojeSP } from '@/lib/fmt'
import PeriodoFilterPillsUrl from '@/components/shared/periodo-filter-pills-url'
import FluxoMensalChart, { type FluxoMensalV3Row } from '@/components/financeiro/fluxo-mensal-chart'
import FluxoAcumuladoChart, { type FluxoAcumuladoRow } from '@/components/financeiro/fluxo-acumulado-chart'
import PosicaoPorConta from '@/components/financeiro/posicao-por-conta'
import TopSection from '@/components/shared/top-section'
import CalendarioLiquidez from '@/components/financeiro/calendario-liquidez'
import RunwaySemanal from '@/components/financeiro/runway-semanal'
import HorizontePrevisto from '@/components/financeiro/horizonte-previsto'
import RepasseMensal from '@/components/financeiro/repasse-mensal'
import RankingCaixa from '@/components/financeiro/ranking-caixa'
import PosicaoProjetado from '@/components/financeiro/posicao-projetado'
import UiTooltip from '@/components/ui/tooltip'
import TempoVidaCaixa from '@/components/financeiro/tempo-vida-caixa'
import {
  repasseMensalSchema, horizonteSchema, runwaySemanalSchema, rankingCaixaSchema, saldoCaixaSchema,
  coberturaSchema, previstoDiarioSchema, saldoRepasseSchema,
  type RepasseMensalRow, type HorizonteData, type SaldoCaixaConta,
  type RunwaySemanal as RunwaySemanalData, type RankingCaixa as RankingCaixaData,
  type CoberturaData, type PrevistoDiario,
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

interface PosicaoConta {
  conta:      string
  tipo_conta: string
  saldo:      number
}

// Feature flag (v4.9-M7): "Posição por Conta" temporariamente oculta a pedido da
// diretoria. Componente, RPC (get_posicao_por_conta) e dados são MANTIDOS no código
// para revisão futura — basta voltar a flag para `true`.
const MOSTRAR_POSICAO_POR_CONTA = false

// Feature flag (v5.2.0, checkpoint): "Acumulado de Recebimentos e Pagamentos" oculto do
// Fluxo Realizado — código MANTIDO por enquanto (voltar a flag se o card retornar); se
// não voltar, remover na próxima auditoria de código morto.
const MOSTRAR_ACUMULADO = false

/** Célula de KPI do card principal do Realizado — divisórias verticais entre células
 *  (mesmo idioma do card de posição do Projetado). Sem subtítulos (checkpoint); ajuda
 *  pontual via botão "?" (padrão da plataforma), só onde pedida. */
function KpiCelula({ label, value, tooltip, valueColor, primeiro = false }: {
  label: string; value: string; tooltip?: string; valueColor?: string; primeiro?: boolean
}) {
  return (
    <div className={`flex-1 min-w-[150px] ${primeiro ? 'pr-7' : 'px-7 border-l border-zinc-100'}`}>
      <p className="text-2xs font-semibold uppercase tracking-wide inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
        {label}
        {tooltip && (
          <UiTooltip conteudo={tooltip} className="z-30 w-64 !whitespace-normal font-normal normal-case tracking-normal leading-snug">
            <span aria-label={`Ajuda sobre ${label}`} className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400">?</span>
          </UiTooltip>
        )}
      </p>
      <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: valueColor ?? 'var(--text-primary)' }}>{value}</p>
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

  // v5.2.0/Onda 1 (M4): um único estágio de RPCs (mesmo padrão da v4.39.0). `get_saldo_caixa`
  // alimenta o Saldo de Caixa KPI (Projetado) — tabela PRÓPRIA financeiro.saldo_caixa
  // (desconectada do Fluxo de Caixa Gerencial no ajuste do checkpoint), preenchível no modal
  // do drill. RPC falhou/sem acesso → KPI degrada para "—" sem quebrar a página. As 4 RPCs
  // novas (repasse mensal, horizonte, runway semanal, ranking de caixa) entram no mesmo estágio.
  const [
    fluxoMensalRes,
    fluxoAcumuladoRes,
    kpisRes,
    previstoDiarioRes,
    posicaoRes,
    saldosRes,
    repasseMensalRes,
    horizonteRes,
    runwaySemanalRes,
    rankingRes,
    coberturaRes,
    saldoRepasseRes,
  ] = await Promise.allSettled([
    rpc('get_fluxo_caixa_mensal_v3'),
    rpc('get_fluxo_caixa_acumulado_v1'),
    rpc('get_fluxo_caixa_kpis_b',        { p_from: from, p_to: to }),
    rpc('get_fluxo_previsto_diario'),
    rpc('get_posicao_por_conta'),
    rpc('get_saldo_caixa'),
    rpc('get_repasse_mensal',      { p_ano: anoAtual }),
    rpc('get_fluxo_horizonte'),
    rpc('get_fluxo_runway_semanal'),
    rpc('get_fluxo_ranking'),
    rpc('get_fluxo_cobertura'),
    rpc('get_saldo_repasse', { p_from: from, p_to: to }),
  ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : empty))

  const fluxoMensalRows    = unwrapRpc<FluxoMensalV3Row[]>(fluxoMensalRes, 'get_fluxo_caixa_mensal_v3') ?? []
  const fluxoAcumuladoRows = unwrapRpc<FluxoAcumuladoRow[]>(fluxoAcumuladoRes, 'get_fluxo_caixa_acumulado_v1') ?? []

  const kpis = unwrapRpc<KpisB>(kpisRes, 'get_fluxo_caixa_kpis_b') ?? {
    entradas_realizadas: 0, saidas_realizadas: 0, saldo_realizado: 0,
    entradas_previstas: 0, saidas_previstas: 0, saldo_previsto: 0,
  }

  // Série diária do previsto (0196) — o card de posição soma a janela do horizonte no
  // cliente. Falha → série vazia (KPIs zeram, card não quebra a página).
  const previstoDiario: PrevistoDiario =
    parseRpc(previstoDiarioSchema, previstoDiarioRes, 'get_fluxo_previsto_diario') ??
    { vencido_r: 0, vencido_p: 0, dias: [] }

  const posicoes = unwrapRpc<PosicaoConta[]>(posicaoRes, 'get_posicao_por_conta') ?? []

  // Saldo de caixa PRÓPRIO do Fluxo Projetado (financeiro.saldo_caixa) — vazio (fail-safe)
  // se a RPC falhar; PosicaoProjetado degrada o saldo para "—" nesse caso, sem quebrar a página.
  const saldosCaixa: SaldoCaixaConta[] = parseRpc(saldoCaixaSchema, saldosRes, 'get_saldo_caixa') ?? []

  // As 4 RPCs novas do Onda 1 — schema Zod valida o SHAPE; falha (RPC quebrada/drift) degrada
  // para o "vazio" do tipo, e cada componente novo já trata array/objeto vazio internamente
  // ("sem dados"), preservando o invariante "seção indisponível não derruba a página".
  const repasseMensalRows: RepasseMensalRow[] =
    parseRpc(repasseMensalSchema, repasseMensalRes, 'get_repasse_mensal') ?? []
  const horizonte: HorizonteData =
    parseRpc(horizonteSchema, horizonteRes, 'get_fluxo_horizonte') ??
    { mes_corrente: 0, ano_corrente: 0, meses: [], anos: [] }
  const runwaySemanal: RunwaySemanalData =
    parseRpc(runwaySemanalSchema, runwaySemanalRes, 'get_fluxo_runway_semanal') ?? { saldo_operacional: 0, semanas: [] }
  const rankingCaixa: RankingCaixaData =
    parseRpc(rankingCaixaSchema, rankingRes, 'get_fluxo_ranking') ?? { pioraram: [], melhoraram: [] }
  const cobertura: CoberturaData =
    parseRpc(coberturaSchema, coberturaRes, 'get_fluxo_cobertura') ?? { recebiveis: 0, saidas_mensais: [] }

  const totalEntradas = kpis.entradas_realizadas
  const totalSaidas   = kpis.saidas_realizadas
  const saldoLiquido  = kpis.saldo_realizado

  // Saldo de repasse do PERÍODO filtrado (0198) — sensível às pills como os demais
  // indicadores (ajuste do checkpoint; antes era o acumulado do ano).
  const saldoRepasse =
    parseRpc(saldoRepasseSchema, saldoRepasseRes, 'get_saldo_repasse')?.sal ?? 0

  const temDados = fluxoMensalRows.length > 0 || kpis.entradas_realizadas > 0 || kpis.saidas_realizadas > 0

  const saldoTotal = posicoes.reduce((s, p) => s + p.saldo, 0)

  return (
    <div>

      {/* ── FLUXO PROJETADO ──────────────────────────────────────────────── */}
      <TopSection titulo="Fluxo Projetado">

        {/* Card ÚNICO de posição (checkpoint/mockup variante A): Saldo de Caixa |
            A receber · A pagar · NCG com horizonte ajustável (Dias/Meses/Sempre). */}
        <div className="mb-6">
          <PosicaoProjetado saldos={saldosCaixa} previsto={previstoDiario} />
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

        <div className="mb-4">
          <TempoVidaCaixa data={cobertura} />
        </div>

        <HorizontePrevisto data={horizonte} />

      </TopSection>

      {/* ── FLUXO REALIZADO ──────────────────────────────────────────────── */}
      <TopSection titulo="Fluxo Realizado">

        {/* Card PRINCIPAL do Realizado (mockup do checkpoint aprovado): pills de período
            DENTRO do card + os 4 indicadores do PERÍODO filtrado (Resultado, Entradas,
            Saídas e Saldo de repasse — todos sensíveis às pills; repasse via 0198). */}
        <div className="rounded-xl shadow-sm bg-white px-5 py-4 mb-6">
          <div className="mb-5">
            <Suspense>
              <PeriodoFilterPillsUrl defaultPreset="este-ano" />
            </Suspense>
          </div>
          <div className="flex flex-wrap gap-y-4">
            <KpiCelula
              label="Resultado de caixa"
              value={fmtMi(saldoLiquido)}
              valueColor={saldoLiquido >= 0 ? 'var(--positive)' : 'var(--negative)'}
              primeiro
            />
            <KpiCelula
              label="Entradas realizadas"
              value={fmtMi(totalEntradas)}
            />
            <KpiCelula
              label="Saídas realizadas"
              value={fmtMi(totalSaidas)}
            />
            <KpiCelula
              label="Saldo de repasse"
              value={fmtMi(saldoRepasse)}
              tooltip="Repasse BRUTO do período selecionado: Entrada de Clientes − Pagamento ao Fornecedor."
              valueColor={saldoRepasse >= 0 ? 'var(--positive-deep)' : 'var(--negative-deep)'}
            />
          </div>
        </div>

        {!temDados && <NoDataMessage />}

        {temDados && (
          <>
            {/* Tendência da Margem de Repasse — LOGO ABAIXO do card principal (checkpoint) */}
            <div className="mb-4">
              <RepasseMensal rows={repasseMensalRows} />
            </div>

            {/* Fluxo Mensal chart — card e título dentro do componente */}
            {/* `mesHoje` vem do SERVIDOR: o slider do gráfico ancora no mês corrente
                de São Paulo sem depender do relógio do cliente (e sem risco de
                divergência na hidratação). */}
            <FluxoMensalChart rows={fluxoMensalRows} mesHoje={hojeSP().slice(0, 7)} />

            {/* Acumulado chart — oculto via flag (v5.2.0, checkpoint); código mantido */}
            {MOSTRAR_ACUMULADO && (
              <div className="rounded-xl shadow-sm bg-white p-5 mb-4">
                <CardTitle titulo="Acumulado de Recebimentos e Pagamentos" subtitulo="24 meses passados + 18 futuros" />
                <FluxoAcumuladoChart rows={fluxoAcumuladoRows} />
              </div>
            )}

            {/* Ranking de Caixa (v5.2.0/Onda 1) */}
            <div className="mb-4">
              <RankingCaixa data={rankingCaixa} />
            </div>

            {/* Composição dos Lançamentos MUDOU para a aba DRE (/financeiro/dre) —
                checkpoint v5.2.0: lá é a semente da DRE por Fluxo de Caixa (Onda 2). */}

            {/* Posição por Conta — oculta via flag (v4.9-M7); mantida p/ revisão futura */}
            {MOSTRAR_POSICAO_POR_CONTA && (
              <div className="rounded-xl shadow-sm bg-white p-5 mb-4">
                <CardTitle titulo="Posição por Conta" />
                <PosicaoPorConta posicoes={posicoes} saldoTotal={saldoTotal} />
              </div>
            )}

          </>
        )}
      </TopSection>

    </div>
  )
}
