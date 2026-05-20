'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { fmtMi } from '@/lib/fmt'

interface SeriePonto {
  ano: number; mes: number; label: string; valor: number
}
interface Ultimos6Item extends SeriePonto {
  var_anterior_pct: number | null
  var_yoy_pct:      number | null
}
interface DrawerData {
  metrica: string
  setor:   string
  serie:   SeriePonto[]
  ultimos_6: Ultimos6Item[]
}

function fmtCurto(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`
  if (Math.abs(v) >= 1_000)     return `${Math.round(v / 1_000)}k`
  return String(v)
}

function VarCell({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-zinc-300">—</span>
  const abs = Math.abs(pct)
  if (abs < 0.5)   return <span className="text-zinc-400">{pct.toFixed(1)}%</span>
  const color = pct > 0 ? 'text-success' : 'text-danger'
  const arrow = pct > 0 ? '▲' : '▼'
  const sign  = pct > 0 ? '+' : ''
  return <span className={color}>{arrow} {sign}{pct.toFixed(1)}%</span>
}

interface Props {
  metrica: 'faturamento' | 'receita'
  rotulo:  string
  setor:   string
  onClose: () => void
}

export default function KpiDetailDrawer({ metrica, rotulo, setor, onClose }: Props) {
  const [data,    setData]    = useState<DrawerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  // slide-in
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

  // body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // fetch data
  useEffect(() => {
    fetch(`/api/dashboard/kpi-historico?metrica=${metrica}&setor=${encodeURIComponent(setor)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [metrica, setor])

  const setorLabel = setor === 'todos'
    ? 'Todos'
    : setor.charAt(0).toUpperCase() + setor.slice(1)

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.5)', opacity: visible ? 1 : 0, transition: 'opacity 280ms ease' }}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col w-full md:w-[60vw] max-w-2xl bg-white shadow-2xl"
        style={{
          transform:  visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
          <div>
            <p className="text-lg font-semibold text-zinc-900">{rotulo} — Histórico</p>
            <p className="text-sm text-zinc-400 mt-0.5">Setor: {setorLabel} · Últimos 24 meses</p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-52 rounded-xl bg-zinc-100" />
              <div className="h-44 rounded-xl bg-zinc-100" />
            </div>
          ) : !data ? (
            <p className="text-sm text-zinc-400 text-center py-12">Erro ao carregar dados.</p>
          ) : (
            <>
              {/* Gráfico de linha */}
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#a1a1aa' }}
                    axisLine={false}
                    tickLine={false}
                    interval={5}
                  />
                  <YAxis
                    tickFormatter={fmtCurto}
                    tick={{ fontSize: 10, fill: '#a1a1aa' }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                    tickCount={4}
                  />
                  <Tooltip
                    formatter={(v) => [fmtMi(Number(v)), rotulo]}
                    labelStyle={{ fontSize: 11, color: '#3f3f46' }}
                    contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: 'var(--primary)', strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>

              {/* Tabela últimos 6 meses */}
              <div className="mt-4">
                <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                  Últimos 6 meses
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="py-2 text-left   text-xs font-medium text-zinc-400">Mês</th>
                      <th className="py-2 text-right  text-xs font-medium text-zinc-400">Valor</th>
                      <th className="py-2 text-right  text-xs font-medium text-zinc-400">vs anterior</th>
                      <th className="py-2 text-right  text-xs font-medium text-zinc-400">YoY</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {data.ultimos_6.map((item, i) => (
                      <tr key={item.label} className={i === 0 ? 'font-semibold' : ''}>
                        <td className="py-2 text-zinc-700">{item.label}</td>
                        <td className="py-2 text-right tabular-nums text-zinc-800">{fmtMi(item.valor)}</td>
                        <td className="py-2 text-right tabular-nums"><VarCell pct={item.var_anterior_pct} /></td>
                        <td className="py-2 text-right tabular-nums"><VarCell pct={item.var_yoy_pct} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
