import { Suspense } from 'react'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { fmtBRL, fmtMi } from '@/lib/fmt'
import PeriodoFilterUrl from '@/components/shared/periodo-filter-url'
import FluxoMensalChart, { type FluxoMensalRow } from '@/components/financeiro/fluxo-mensal-chart'
import TopSection from '@/components/shared/top-section'

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

interface DecomposicaoGrupo {
  grupo_categoria: string
  sinal:           'entrada' | 'saida'
  valor_total:     number
}

interface ProximoVencimento {
  numero:          string | null
  vencimento:      string
  pessoa:          string | null
  descricao:       string | null
  valor_final:     number
  tipo:            'Entrada' | 'Saída'
  status:          string
  dias_para_vencer: number
  aging:           'a_vencer' | 'vencido_ate_30d' | 'vencido_30_a_90d' | 'vencido_mais_90d'
}

const TOOLTIP_KPI_REALIZADO =
  "Reflete o fluxo de caixa bancário real, com gastos via cartão contabilizados no pagamento da fatura. Diferença esperada em relação à Decomposição por Grupo de Categoria devido ao ciclo de cartão (≤30 dias)."

const TOOLTIP_A_RECEBER =
  "Total previsto de entradas futuras da CAP/CAR (exceto faturas de cartão pendentes)."

function KpiCard({ label, value, sub, tooltip }: { label: string; value: string; sub?: string; tooltip?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-1 mb-1">
        <p className="text-xs text-zinc-400">{label}</p>
        {tooltip && (
          <span title={tooltip} className="text-zinc-300 hover:text-zinc-500 cursor-help">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
          </span>
        )}
      </div>
      <p className="text-xl font-semibold text-zinc-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  )
}

const AGING_LABEL: Record<string, string> = {
  a_vencer:          'A vencer',
  vencido_ate_30d:   'Vencido ≤ 30 dias',
  vencido_30_a_90d:  'Vencido 30–90 dias',
  vencido_mais_90d:  'Vencido > 90 dias',
}

const TIPO_CONTA_LABEL: Record<string, string> = {
  banco:              'Banco',
  gateway:            'Gateway',
  carteira_interna:   'Carteira',
  caixa_fisico:       'Caixa',
  outro:              'Outro',
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

  const [fluxoRes, kpisRes, decomposicaoRes, posicaoRes, vencimentosRes] = await Promise.all([
    rpc('get_fluxo_caixa_mensal_b', { p_from: from, p_to: to }),
    rpc('get_fluxo_caixa_kpis_b',   { p_from: from, p_to: to }),
    rpc('get_decomposicao_grupo',   { p_from: from, p_to: to }),
    rpc('get_posicao_por_conta'),
    rpc('get_proximos_vencimentos_v2', { p_limite: 200, p_offset: 0 }),
  ])

  const fluxoRows    = (fluxoRes.error      ? null : fluxoRes.data      as FluxoMensalRow[]     | null) ?? []
  const kpis         = (kpisRes.error       ? null : kpisRes.data       as KpisB                | null) ?? {
    entradas_realizadas: 0, saidas_realizadas: 0, saldo_realizado: 0,
    entradas_previstas: 0, saidas_previstas: 0, saldo_previsto: 0,
  }
  const decomposicao = (decomposicaoRes.error ? null : decomposicaoRes.data as DecomposicaoGrupo[] | null) ?? []
  const posicoes     = (posicaoRes.error     ? null : posicaoRes.data     as PosicaoConta[]       | null) ?? []

  const vencimentosPayload = vencimentosRes.error
    ? null
    : (vencimentosRes.data as { items: ProximoVencimento[] | null; total: number } | null)
  const vencimentos = vencimentosPayload?.items ?? []

  // KPIs from Abordagem B RPC
  const totalEntradas = kpis.entradas_realizadas
  const totalSaidas   = kpis.saidas_realizadas
  const saldoLiquido  = kpis.saldo_realizado

  // Aggregate vencimentos by aging bucket for summary table
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

  const temDados = fluxoRows.length > 0 || kpis.entradas_realizadas > 0 || kpis.saidas_realizadas > 0

  const entradas = decomposicao.filter(d => d.sinal === 'entrada').sort((a, b) => b.valor_total - a.valor_total)
  const saidas   = decomposicao.filter(d => d.sinal === 'saida').sort((a, b) => b.valor_total - a.valor_total)

  const saldoTotal = posicoes.reduce((s, p) => s + p.saldo, 0)

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">
      {/* Filtro */}
      <div className="flex items-center justify-end mb-6">
        <Suspense>
          <PeriodoFilterUrl defaultPreset="este-ano" />
        </Suspense>
      </div>

      {!temDados && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-500">Nenhum lançamento financeiro importado ainda</p>
          <p className="text-xs text-zinc-400 mt-1">
            Acesse <a href="/admin/uploads/financeiro" className="underline hover:text-zinc-600">Upload de Arquivos › Financeiro</a> para importar os dados
          </p>
        </div>
      )}

      {temDados && (
        <>
          {/* KPIs */}
          <TopSection titulo="Visão Geral">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KpiCard label="Entradas realizadas"  value={fmtMi(totalEntradas)} tooltip={TOOLTIP_KPI_REALIZADO} />
              <KpiCard label="Saídas realizadas"    value={fmtMi(totalSaidas)} tooltip={TOOLTIP_KPI_REALIZADO} />
              <KpiCard
                label="Saldo líquido"
                value={fmtMi(saldoLiquido)}
                sub={saldoLiquido >= 0 ? 'Positivo' : 'Negativo'}
                tooltip={TOOLTIP_KPI_REALIZADO}
              />
              <KpiCard label="A receber (previsto)"  value={fmtMi(kpis.entradas_previstas)} tooltip={TOOLTIP_A_RECEBER} />
            </div>
          </TopSection>

          {/* Fluxo Mensal */}
          <TopSection titulo="Fluxo de Caixa Mensal">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm mb-4">
              <FluxoMensalChart rows={fluxoRows} />
            </div>
          </TopSection>

          {/* Decomposição + Posição por Conta */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Decomposição */}
            <TopSection titulo="Composição do Período">
              <p className="text-[11px] text-zinc-400 mb-3 -mt-1">
                Decomposição por Grupo de Categoria (Lançamentos puro — regime contábil). Pode diferir levemente dos KPIs do topo, que refletem fluxo bancário real.
              </p>
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm h-full">
                {entradas.length === 0 && saidas.length === 0 ? (
                  <p className="text-xs text-zinc-400">Sem dados</p>
                ) : (
                  <div className="space-y-4">
                    {entradas.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-emerald-600 mb-2">Entradas por grupo</p>
                        <div className="space-y-1.5">
                          {entradas.map(d => (
                            <div key={d.grupo_categoria} className="flex justify-between text-xs">
                              <span className="text-zinc-600 truncate pr-4">{d.grupo_categoria || '(sem categoria)'}</span>
                              <span className="text-zinc-800 font-medium tabular-nums shrink-0">{fmtBRL(d.valor_total)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {saidas.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-amber-600 mb-2">Saídas por grupo</p>
                        <div className="space-y-1.5">
                          {saidas.map(d => (
                            <div key={d.grupo_categoria} className="flex justify-between text-xs">
                              <span className="text-zinc-600 truncate pr-4">{d.grupo_categoria || '(sem categoria)'}</span>
                              <span className="text-zinc-800 font-medium tabular-nums shrink-0">{fmtBRL(d.valor_total)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TopSection>

            {/* Posição por Conta */}
            <TopSection titulo="Posição por Conta">
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm h-full">
                {posicoes.length === 0 ? (
                  <p className="text-xs text-zinc-400">Sem dados</p>
                ) : (
                  <div className="space-y-2">
                    {posicoes.map(p => (
                      <div key={p.conta} className="flex justify-between items-center text-xs border-b border-zinc-50 pb-2 last:border-0 last:pb-0">
                        <div>
                          <span className="text-zinc-700 font-medium">{p.conta}</span>
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 text-zinc-400">
                            {TIPO_CONTA_LABEL[p.tipo_conta] ?? p.tipo_conta}
                          </span>
                        </div>
                        <span className={['font-medium tabular-nums', p.saldo >= 0 ? 'text-zinc-800' : 'text-red-600'].join(' ')}>
                          {fmtBRL(p.saldo)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs pt-1 border-t border-zinc-200 font-semibold">
                      <span className="text-zinc-600">Total</span>
                      <span className={saldoTotal >= 0 ? 'text-zinc-900' : 'text-red-600'}>{fmtBRL(saldoTotal)}</span>
                    </div>
                  </div>
                )}
              </div>
            </TopSection>
          </div>

          {/* Títulos em Aberto por Aging */}
          {agingRows.length > 0 && (
            <TopSection titulo="Títulos em Aberto por Aging">
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
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
            </TopSection>
          )}

          {/* Próximos Vencimentos — lista de títulos */}
          {vencimentos.length > 0 && (
            <TopSection titulo="Próximos Vencimentos">
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
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
            </TopSection>
          )}
        </>
      )}
    </div>
  )
}
