'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import type { DrilldownOperacao, VisaoFinanceira } from '@/types/api'
import { fmtBRL, fmtDate } from '@/lib/fmt'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMi(v: number) {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mi`
  if (Math.abs(v) >= 1_000)     return `R$ ${(v / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} k`
  return fmtBRL(v)
}

const SUBSETOR_LABELS: Record<string, string> = {
  COMERCIAL:        'Comercial',
  CONVIDADOS:       'Convidados',
  'PRODUÇÃO':       'Produção',
  PLANEJAMENTO:     'Planejamento',
  NÃO_CLASSIFICADO: 'Não Classif.',
}

const SUBSETOR_COLORS = ['#BA7517', '#c8861e', '#d49530', '#dfa543', '#a16207']

const SITUACAO_LABEL: Record<string, string> = {
  futuro:   'Futuro',
  passado:  'Passado',
  sem_data: 'Sem data',
}

const SITUACAO_CLS: Record<string, string> = {
  futuro:   'bg-blue-100 text-blue-700',
  passado:  'bg-zinc-100 text-zinc-600',
  sem_data: 'bg-zinc-50  text-zinc-400',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-3">
      {children}
    </p>
  )
}

function FluxoRow({ label, total, sub1Label, sub1, sub2Label, sub2, isEntrada }: {
  label: string; total: number
  sub1Label: string; sub1: number
  sub2Label: string; sub2: number
  isEntrada: boolean
}) {
  const color = isEntrada ? 'text-emerald-600' : 'text-red-500'
  return (
    <div className="mb-3">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-semibold text-zinc-700">{label}</span>
        <span className={`text-sm font-semibold tabular-nums ${color}`}>{fmtBRL(total)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 pl-3 border-l-2 border-zinc-100">
        <div>
          <p className="text-[10px] text-zinc-400">{sub1Label}</p>
          <p className="text-xs tabular-nums text-zinc-600">{fmtBRL(sub1)}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-400">{sub2Label}</p>
          <p className="text-xs tabular-nums text-zinc-600">{fmtBRL(sub2)}</p>
        </div>
      </div>
    </div>
  )
}

function EqRow({
  prefix, label, value, highlight, deduction, formula,
}: {
  prefix: string
  label: string
  value: number | null
  highlight?: boolean
  deduction?: boolean
  formula?: string
}) {
  const textCls = highlight
    ? value != null && value < 0 ? 'text-red-600 font-bold' : 'text-zinc-900 font-bold'
    : deduction ? 'text-zinc-500' : 'text-zinc-700'
  return (
    <div className={`flex justify-between items-baseline py-1.5 ${highlight ? 'border-t border-zinc-200 mt-0.5' : ''}`}>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-[10px] text-zinc-400 w-5 shrink-0 tabular-nums">{prefix}</span>
        <span className={`text-xs ${highlight ? 'font-semibold text-zinc-700' : deduction ? 'text-zinc-500' : 'text-zinc-600'}`}>
          {label}
        </span>
        {formula && (
          <span className="text-[10px] text-zinc-400 hidden sm:inline truncate">— {formula}</span>
        )}
      </div>
      {value != null ? (
        <span className={`text-xs tabular-nums shrink-0 ml-2 ${textCls}`}>
          {deduction ? `(${fmtBRL(Math.abs(value))})` : fmtBRL(value)}
        </span>
      ) : (
        <span className="text-xs text-zinc-300 shrink-0 ml-2">N/D</span>
      )}
    </div>
  )
}

function EquacaoFinanceira({ vf }: { vf: VisaoFinanceira }) {
  const custoFornecedor = vf.faturamento - vf.receita_bruta
  const temCaixa = vf.entradas_total > 0 || vf.saidas_total > 0

  return (
    <div className="border border-zinc-100 rounded-lg px-3 py-1 mb-4 bg-zinc-50/40">
      <EqRow
        prefix=""    label="Faturamento"      value={vf.faturamento}
        highlight    formula="valor total das vendas"
      />
      <EqRow
        prefix="(−)" label="Custo Fornecedor" value={custoFornecedor}
        deduction    formula="repasse hotel / cia. aérea"
      />
      <EqRow
        prefix="="   label="Receita Bruta"    value={vf.receita_bruta}
        highlight    formula={`${vf.margem_pct.toFixed(1)}% do faturamento`}
      />
      {temCaixa ? (
        <>
          <EqRow
            prefix="(−)" label="Custos Internos" value={vf.custos_internos}
            deduction    formula="RB − resultado de caixa"
          />
          <EqRow
            prefix="="   label="Receita Líquida" value={vf.resultado_caixa}
            highlight    formula={`${vf.margem_liquida_pct.toFixed(1)}% do faturamento`}
          />
        </>
      ) : (
        <p className="text-[10px] text-zinc-400 pt-1.5 pb-0.5 border-t border-zinc-100 mt-0.5">
          Custos e Receita Líquida calculados após registro de lançamentos (caixa).
        </p>
      )}
    </div>
  )
}

// ── Main Drawer ───────────────────────────────────────────────────────────────

interface Props {
  operacao: string
  onClose:  () => void
}

export default function DrilldownDrawer({ operacao, onClose }: Props) {
  const [requestState, setRequestState] = useState<{
    operacao: string
    data: DrilldownOperacao | null
  }>({ operacao: '', data: null })
  const [visible, setVisible] = useState(false)

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  // Slide-in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  // Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Fetch
  useEffect(() => {
    let cancelled = false

    fetch(`/api/dashboard/weddings/operacao/${encodeURIComponent(operacao)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DrilldownOperacao>
      })
      .then(data => {
        if (!cancelled) setRequestState({ operacao, data })
      })
      .catch(() => {
        if (!cancelled) setRequestState({ operacao, data: null })
      })

    return () => { cancelled = true }
  }, [operacao])

  const loading = requestState.operacao !== operacao
  const data = loading ? null : requestState.data
  const vf = data?.visao_financeira

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.45)', opacity: visible ? 1 : 0, transition: 'opacity 280ms ease' }}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col w-full md:w-[56vw] max-w-xl bg-white shadow-2xl"
        style={{
          transform:  visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-base font-semibold text-zinc-900 truncate">{operacao}</p>
              {data && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${SITUACAO_CLS[data.situacao] ?? 'bg-zinc-100 text-zinc-500'}`}>
                  {SITUACAO_LABEL[data.situacao] ?? data.situacao}
                </span>
              )}
            </div>
            {data?.nome_casal && (
              <p className="text-sm text-zinc-500 mt-0.5 truncate">{data.nome_casal}</p>
            )}
            {data?.data_evento && (
              <p className="text-xs text-zinc-400 mt-0.5">Evento: {fmtDate(data.data_evento)}</p>
            )}
            {data?.hotel && (
              <p className="text-xs text-zinc-400 mt-0.5">Hotel: {data.hotel}</p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors shrink-0"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-24 rounded-xl bg-zinc-100" />
              <div className="h-40 rounded-xl bg-zinc-100" />
              <div className="h-48 rounded-xl bg-zinc-100" />
              <div className="h-36 rounded-xl bg-zinc-100" />
            </div>
          ) : !data || !vf ? (
            <p className="text-sm text-zinc-400 text-center py-12">Erro ao carregar dados da operação.</p>
          ) : (
            <>
              {/* ── Seção 1: Visão Financeira ─────────────────────────── */}
              <div>
                <SectionTitle>Equação Financeira</SectionTitle>

                {/* Waterfall: Faturamento → RB → RL */}
                <EquacaoFinanceira vf={vf} />

                {/* Fluxo de caixa */}
                <SectionTitle>Fluxo de Caixa</SectionTitle>
                <div className="border border-zinc-100 rounded-lg p-3">
                  <FluxoRow
                    label="Entradas" total={vf.entradas_total} isEntrada
                    sub1Label="Recebido"   sub1={vf.recebido}
                    sub2Label="A Receber"  sub2={vf.a_receber}
                  />
                  <FluxoRow
                    label="Saídas"   total={vf.saidas_total} isEntrada={false}
                    sub1Label="Pago"    sub1={vf.pago}
                    sub2Label="A Pagar" sub2={vf.a_pagar}
                  />
                  <div className="flex justify-between items-baseline pt-2 border-t border-zinc-100 mt-1">
                    <div>
                      <span className="text-xs font-semibold text-zinc-700">Resultado Caixa</span>
                      <span className="text-[10px] text-zinc-400 ml-1">({vf.resultado_pct.toFixed(1)}%)</span>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums ${vf.resultado_caixa >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {fmtBRL(vf.resultado_caixa)}
                    </span>
                  </div>
                  {vf.ncg > 0 && (
                    <div className="flex justify-between items-baseline mt-1.5">
                      <span className="text-xs text-zinc-500">NCG (capital de giro)</span>
                      <span className={`text-xs tabular-nums font-medium ${vf.ncg > 50000 ? 'text-amber-600' : 'text-zinc-600'}`}>
                        {fmtBRL(vf.ncg)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Seção 2: Decomposição por Subsetor ───────────────── */}
              {data.decomposicao_subsetor.length > 0 && (
                <div>
                  <SectionTitle>Receita por Subsetor</SectionTitle>
                  <div className="space-y-2">
                    {data.decomposicao_subsetor.map((item, i) => (
                      <div key={item.subsetor}>
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-xs text-zinc-700 font-medium">
                            {SUBSETOR_LABELS[item.subsetor] ?? item.subsetor}
                          </span>
                          <div className="flex gap-3 text-xs tabular-nums">
                            <span className="text-zinc-500">{item.pct.toFixed(1)}%</span>
                            <span className="text-zinc-700 w-24 text-right">{fmtBRL(item.receita)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${item.pct}%`, background: SUBSETOR_COLORS[i % SUBSETOR_COLORS.length] }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Seção 3: Acumulado Mensal ─────────────────────────── */}
              {data.acumulado_mensal.length > 0 && (
                <div>
                  <SectionTitle>Caixa Acumulado por Mês</SectionTitle>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart
                      data={data.acumulado_mensal}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="gradEntrada" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}  />
                        </linearGradient>
                        <linearGradient id="gradSaida" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#f97316" stopOpacity={0.20} />
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0.0}  />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="mes"
                        tick={{ fontSize: 9, fill: '#a1a1aa' }}
                        axisLine={false} tickLine={false}
                        tickFormatter={s => s.slice(5)}
                      />
                      <YAxis
                        tickFormatter={v => fmtMi(Number(v))}
                        tick={{ fontSize: 9, fill: '#a1a1aa' }}
                        axisLine={false} tickLine={false}
                        width={52} tickCount={4}
                      />
                      <Tooltip
                        formatter={(v, name) => [fmtBRL(Number(v)), name === 'entrada_acum' ? 'Entradas' : 'Saídas']}
                        labelStyle={{ fontSize: 11 }}
                        contentStyle={{ fontSize: 11, borderRadius: 6 }}
                      />
                      <Area
                        type="monotone" dataKey="entrada_acum"
                        stroke="#10b981" strokeWidth={2}
                        fill="url(#gradEntrada)" dot={false} isAnimationActive={false}
                      />
                      <Area
                        type="monotone" dataKey="saida_acum"
                        stroke="#f97316" strokeWidth={2}
                        fill="url(#gradSaida)" dot={false} isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-1 justify-center">
                    <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                      <span className="inline-block w-3 h-0.5 bg-emerald-500 rounded" /> Entradas
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                      <span className="inline-block w-3 h-0.5 bg-orange-400 rounded" /> Saídas
                    </span>
                  </div>
                </div>
              )}

              {/* ── Seção 4: Lançamentos Recentes ─────────────────────── */}
              {data.lancamentos_recentes.length > 0 && (
                <div>
                  <SectionTitle>Últimos Lançamentos</SectionTitle>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100">
                        <th className="py-1.5 text-left  font-medium text-zinc-400">Data</th>
                        <th className="py-1.5 text-left  font-medium text-zinc-400">Tipo</th>
                        <th className="py-1.5 text-left  font-medium text-zinc-400">Descrição</th>
                        <th className="py-1.5 text-right font-medium text-zinc-400">Valor</th>
                        <th className="py-1.5 text-right font-medium text-zinc-400">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {data.lancamentos_recentes.map((l, i) => (
                        <tr key={i} className="hover:bg-zinc-50">
                          <td className="py-1.5 text-zinc-500 whitespace-nowrap">
                            {l.data ? fmtDate(l.data) : '—'}
                          </td>
                          <td className="py-1.5 pr-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              l.tipo === 'Entrada'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-orange-50 text-orange-700'
                            }`}>
                              {l.tipo}
                            </span>
                          </td>
                          <td className="py-1.5 text-zinc-600 max-w-40 truncate" title={l.descricao ?? ''}>
                            {l.descricao ?? '—'}
                          </td>
                          <td className={`py-1.5 text-right tabular-nums font-medium ${
                            l.tipo === 'Entrada' ? 'text-emerald-600' : 'text-orange-600'
                          }`}>
                            {fmtBRL(l.valor)}
                          </td>
                          <td className="py-1.5 text-right text-zinc-400 whitespace-nowrap">
                            {l.status ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
