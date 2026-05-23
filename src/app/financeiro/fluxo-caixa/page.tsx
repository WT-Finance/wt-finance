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
  id:              number
  numero:          string | null
  vencimento:      string
  venda_no:        number | null
  pessoa:          string | null
  descricao:       string | null
  valor:           number
  categoria:       string | null
  grupo_categoria: string | null
  conta:           string | null
  tipo_conta:      string | null
  aging:           'a_vencer' | 'vencido_30d' | 'vencido_30_90d' | 'vencido_90d_mais'
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      <p className="text-xl font-semibold text-zinc-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  )
}

const AGING_LABEL: Record<string, string> = {
  a_vencer:           'A vencer',
  vencido_30d:        'Vencido ≤ 30 dias',
  vencido_30_90d:     'Vencido 30–90 dias',
  vencido_90d_mais:   'Vencido > 90 dias',
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

  const [fluxoRes, decomposicaoRes, posicaoRes, vencimentosRes] = await Promise.all([
    rpc('get_fluxo_caixa_mensal',  { p_from: from, p_to: to }),
    rpc('get_decomposicao_grupo',  { p_from: from, p_to: to }),
    rpc('get_posicao_por_conta'),
    rpc('get_proximos_vencimentos', { p_limite: 200, p_offset: 0 }),
  ])

  const fluxoRows    = (fluxoRes.error      ? null : fluxoRes.data      as FluxoMensalRow[]     | null) ?? []
  const decomposicao = (decomposicaoRes.error ? null : decomposicaoRes.data as DecomposicaoGrupo[] | null) ?? []
  const posicoes     = (posicaoRes.error     ? null : posicaoRes.data     as PosicaoConta[]       | null) ?? []

  const vencimentosPayload = vencimentosRes.error
    ? null
    : (vencimentosRes.data as { items: ProximoVencimento[] | null; total: number } | null)
  const vencimentos = vencimentosPayload?.items ?? []

  // KPIs aggregated from fluxo rows
  const realizados    = fluxoRows.filter(r => r.tipo === 'realizado')
  const totalEntradas = realizados.filter(r => r.valor_total > 0).reduce((s, r) => s + r.valor_total, 0)
  const totalSaidas   = realizados.filter(r => r.valor_total < 0).reduce((s, r) => s + Math.abs(r.valor_total), 0)
  const saldoLiquido  = totalEntradas - totalSaidas

  // A receber = unliquidated lançamentos with positive valor (entradas em aberto)
  const aReceber = vencimentos
    .filter(v => v.valor > 0)
    .reduce((s, v) => s + v.valor, 0)

  // Aggregate vencimentos by aging bucket for summary table
  type AgingBucket = { aging: string; aReceber: number; aPagar: number; count: number }
  const agingOrder = ['a_vencer', 'vencido_30d', 'vencido_30_90d', 'vencido_90d_mais']
  const agingMap = new Map<string, AgingBucket>()
  for (const v of vencimentos) {
    if (!agingMap.has(v.aging)) agingMap.set(v.aging, { aging: v.aging, aReceber: 0, aPagar: 0, count: 0 })
    const row = agingMap.get(v.aging)!
    row.count++
    if (v.valor >= 0) row.aReceber += v.valor
    else row.aPagar += Math.abs(v.valor)
  }
  const agingRows = agingOrder.map(a => agingMap.get(a)).filter(Boolean) as AgingBucket[]

  const temDados = fluxoRows.length > 0

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
              <KpiCard label="Entradas realizadas"  value={fmtMi(totalEntradas)} />
              <KpiCard label="Saídas realizadas"    value={fmtMi(totalSaidas)} />
              <KpiCard
                label="Saldo líquido"
                value={fmtMi(saldoLiquido)}
                sub={saldoLiquido >= 0 ? 'Positivo' : 'Negativo'}
              />
              <KpiCard label="A receber (aberto)"   value={fmtMi(aReceber)} />
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
        </>
      )}
    </div>
  )
}
