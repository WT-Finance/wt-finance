import { Suspense } from 'react'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { fmtBRL, fmtMi } from '@/lib/fmt'
import PeriodoFilterPillsUrl from '@/components/shared/periodo-filter-pills-url'
import FluxoMensalChart, { type FluxoMensalV3Row } from '@/components/financeiro/fluxo-mensal-chart'
import FluxoAcumuladoChart, { type FluxoAcumuladoRow } from '@/components/financeiro/fluxo-acumulado-chart'
import ComposicaoPeriodo from '@/components/financeiro/composicao-periodo'
import PosicaoPorConta from '@/components/financeiro/posicao-por-conta'
import TopSection from '@/components/shared/top-section'
import CalendarioLiquidez from '@/components/financeiro/calendario-liquidez'
import ProximosLancamentosLateral from '@/components/financeiro/proximos-lancamentos-lateral'

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

interface ProximoVencimento {
  numero:           string | null
  vencimento:       string
  pessoa:           string | null
  descricao:        string | null
  valor_final:      number
  tipo:             'Entrada' | 'Saída'
  status:           string
  dias_para_vencer: number
  aging:            'a_vencer' | 'vencido_ate_30d' | 'vencido_30_a_90d' | 'vencido_mais_90d'
}

interface ProximoLancamento {
  numero:           string | null
  vencimento:       string
  pessoa:           string | null
  descricao:        string | null
  valor_final:      number
  tipo:             'Entrada' | 'Saída'
  status:           string
  dias_para_vencer: number
}

const TOOLTIP_KPI_REALIZADO =
  'Reflete o fluxo de caixa bancário real, com gastos via cartão contabilizados no pagamento da fatura. Diferença esperada em relação à Decomposição por Grupo de Categoria devido ao ciclo de cartão (≤30 dias).'

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
    <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-1 mb-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</p>
        {tooltip && <TooltipIcon text={tooltip} />}
      </div>
      {sub && <p className="text-[10px] text-zinc-400 mb-3">{sub}</p>}
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
        Acesse <a href="/admin/uploads/financeiro" className="underline hover:text-zinc-600">Upload de Arquivos › Financeiro</a> para importar os dados
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

const AGING_LABEL: Record<string, string> = {
  a_vencer:          'A vencer',
  vencido_ate_30d:   'Vencido ≤ 30 dias',
  vencido_30_a_90d:  'Vencido 30–90 dias',
  vencido_mais_90d:  'Vencido > 90 dias',
}

export default async function FluxoCaixaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp   = await searchParams
  const { from, to } = resolverPeriodoCompleto({ ...sp, defaultPreset: 'este-ano' })

  const db = getAdminClient()

  type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  const rpc = (db.rpc as unknown as BoundRpc).bind(db)

  const [
    fluxoMensalRes,
    fluxoAcumuladoRes,
    kpisRes,
    kpisDiarioRes,
    decomposicaoRes,
    posicaoRes,
    vencimentosRes,
    lancamentos10dRes,
  ] = await Promise.all([
    rpc('get_fluxo_caixa_mensal_v3'),
    rpc('get_fluxo_caixa_acumulado_v1'),
    rpc('get_fluxo_caixa_kpis_b',        { p_from: from, p_to: to }),
    rpc('get_fluxo_caixa_kpis_diario'),
    rpc('get_decomposicao_grupo',         { p_from: from, p_to: to }),
    rpc('get_posicao_por_conta'),
    rpc('get_proximos_vencimentos_v2',    { p_limite: 200, p_offset: 0 }),
    rpc('get_proximos_lancamentos_10d'),
  ])

  const fluxoMensalRows    = (fluxoMensalRes.error    ? null : fluxoMensalRes.data    as FluxoMensalV3Row[]  | null) ?? []
  const fluxoAcumuladoRows = (fluxoAcumuladoRes.error ? null : fluxoAcumuladoRes.data as FluxoAcumuladoRow[] | null) ?? []

  const kpis = (kpisRes.error ? null : kpisRes.data as KpisB | null) ?? {
    entradas_realizadas: 0, saidas_realizadas: 0, saldo_realizado: 0,
    entradas_previstas: 0, saidas_previstas: 0, saldo_previsto: 0,
  }

  const kpisDiario: KpisDiario = (kpisDiarioRes.error ? null : kpisDiarioRes.data as KpisDiario | null) ?? {
    saldo_em_caixa: 0,
    a_receber_10d:  0,
    a_pagar_10d:    0,
    ncg_10d:        0,
  }

  const decomposicao = (decomposicaoRes.error ? null : decomposicaoRes.data as DecomposicaoGrupo[] | null) ?? []
  const posicoes     = (posicaoRes.error      ? null : posicaoRes.data      as PosicaoConta[]       | null) ?? []

  const vencimentosPayload = vencimentosRes.error
    ? null
    : (vencimentosRes.data as { items: ProximoVencimento[] | null; total: number } | null)
  const vencimentos = vencimentosPayload?.items ?? []

  const lancamentos10d: ProximoLancamento[] =
    (lancamentos10dRes.error ? null : lancamentos10dRes.data as ProximoLancamento[] | null) ?? []

  const totalEntradas = kpis.entradas_realizadas
  const totalSaidas   = kpis.saidas_realizadas
  const saldoLiquido  = kpis.saldo_realizado

  type AgingBucket = { aging: string; aReceber: number; aPagar: number; count: number }
  const agingOrder = ['a_vencer', 'vencido_ate_30d', 'vencido_30_a_90d', 'vencido_mais_90d']
  const agingMap = new Map<string, AgingBucket>()
  for (const v of vencimentos) {
    if (!agingMap.has(v.aging)) agingMap.set(v.aging, { aging: v.aging, aReceber: 0, aPagar: 0, count: 0 })
    const row = agingMap.get(v.aging)!
    row.count++
    if (v.tipo === 'Entrada') row.aReceber += v.valor_final
    else row.aPagar += v.valor_final
  }
  const agingRows = agingOrder.map(a => agingMap.get(a)).filter(Boolean) as AgingBucket[]

  const temDados = fluxoMensalRows.length > 0 || kpis.entradas_realizadas > 0 || kpis.saidas_realizadas > 0

  const entradas = decomposicao.filter(d => d.sinal === 'entrada').sort((a, b) => b.valor_total - a.valor_total)
  const saidas   = decomposicao.filter(d => d.sinal === 'saida').sort((a, b) => b.valor_total - a.valor_total)

  const saldoTotal = posicoes.reduce((s, p) => s + p.saldo, 0)

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">

      {/* ── VISÃO GERAL ──────────────────────────────────────────────────────── */}
      <TopSection titulo="Visão Geral">

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
            {/* Fluxo Mensal chart — título dentro do card */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm mb-4">
              <CardTitle titulo="Fluxo de Caixa Mensal" subtitulo="24 meses passados + 18 futuros" />
              <FluxoMensalChart rows={fluxoMensalRows} />
            </div>

            {/* Acumulado chart — título dentro do card */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm mb-4">
              <CardTitle titulo="Recebimentos e Pagamentos Acumulados" subtitulo="24 meses passados + 18 futuros" />
              <FluxoAcumuladoChart rows={fluxoAcumuladoRows} />
            </div>

            {/* Composição + Posição por Conta — títulos dentro dos cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <CardTitle titulo="Composição do Período" />
                <p className="text-[11px] text-zinc-400 mb-3 -mt-2">
                  Decomposição por Grupo de Categoria (Lançamentos — regime contábil). Pode diferir levemente dos KPIs acima, que refletem fluxo bancário real.
                </p>
                <ComposicaoPeriodo entradas={entradas} saidas={saidas} />
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <CardTitle titulo="Posição por Conta" />
                <PosicaoPorConta posicoes={posicoes} saldoTotal={saldoTotal} />
              </div>
            </div>

            {/* Títulos em Aberto por Aging */}
            {agingRows.length > 0 && (
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm mb-4">
                <CardTitle titulo="Títulos em Aberto por Aging" />
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-zinc-400 border-b border-zinc-100">
                        <th className="text-left pb-2 font-medium">Faixa</th>
                        <th className="text-right pb-2 font-medium">Qtd</th>
                        <th className="text-right pb-2 font-medium">A Receber</th>
                        <th className="text-right pb-2 font-medium">A Pagar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agingRows.map(r => (
                        <tr key={r.aging} className="border-b border-zinc-50 last:border-0">
                          <td className="py-1.5 text-zinc-700">{AGING_LABEL[r.aging] ?? r.aging}</td>
                          <td className="py-1.5 text-right text-zinc-500">{r.count}</td>
                          <td className="py-1.5 text-right font-medium text-emerald-700 tabular-nums">
                            {r.aReceber > 0 ? fmtBRL(r.aReceber) : '—'}
                          </td>
                          <td className="py-1.5 text-right font-medium text-amber-700 tabular-nums">
                            {r.aPagar > 0 ? fmtBRL(r.aPagar) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Próximos Vencimentos */}
            {vencimentos.length > 0 && (
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <CardTitle titulo="Próximos Vencimentos" />
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-zinc-400 border-b border-zinc-100">
                        <th className="text-left pb-2 font-medium">Vencimento</th>
                        <th className="text-left pb-2 font-medium">Tipo</th>
                        <th className="text-left pb-2 font-medium">Aging</th>
                        <th className="text-left pb-2 font-medium">Pessoa</th>
                        <th className="text-left pb-2 font-medium">Descrição</th>
                        <th className="text-right pb-2 font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vencimentos.map((v, i) => (
                        <tr key={v.numero ?? i} className="border-b border-zinc-50 last:border-0">
                          <td className="py-1.5 tabular-nums text-zinc-600 whitespace-nowrap">
                            {new Date(v.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-1.5">
                            <span className={[
                              'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium',
                              v.tipo === 'Entrada'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700',
                            ].join(' ')}>
                              {v.tipo === 'Entrada' ? 'A Receber' : 'A Pagar'}
                            </span>
                          </td>
                          <td className="py-1.5">
                            <span className={[
                              'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium',
                              v.aging === 'a_vencer'
                                ? 'bg-zinc-100 text-zinc-500'
                                : v.aging === 'vencido_ate_30d'
                                  ? 'bg-yellow-50 text-yellow-700'
                                  : v.aging === 'vencido_30_a_90d'
                                    ? 'bg-orange-50 text-orange-700'
                                    : 'bg-red-50 text-red-700',
                            ].join(' ')}>
                              {AGING_LABEL[v.aging] ?? v.aging}
                            </span>
                          </td>
                          <td className="py-1.5 text-zinc-600 max-w-[12rem] truncate">{v.pessoa ?? '—'}</td>
                          <td className="py-1.5 text-zinc-500 max-w-[16rem] truncate">{v.descricao ?? '—'}</td>
                          <td className="py-1.5 text-right font-medium tabular-nums text-zinc-800 whitespace-nowrap">
                            {fmtBRL(v.valor_final)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </TopSection>

      {/* ── FLUXO DE CAIXA DIÁRIO ─────────────────────────────────────────── */}
      <TopSection titulo="Fluxo de Caixa Diário">

        {/* 4 KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="Saldo em Caixa"
            value={fmtMi(kpisDiario.saldo_em_caixa)}
          />
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

        {/* Calendário (60%) + Lista Próximos Lançamentos (40%) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <Suspense fallback={<div className="h-64 animate-pulse bg-zinc-100 rounded-xl" />}>
              <CalendarioLiquidez />
            </Suspense>
          </div>
          <div className="lg:col-span-2">
            <ProximosLancamentosLateral lancamentos={lancamentos10d} />
          </div>
        </div>

      </TopSection>

    </div>
  )
}
