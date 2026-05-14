'use client'

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, Cell,
} from 'recharts'
import type { PipelineWeddings } from '@/types/api'
import { fmtBRL } from '@/lib/fmt'

// ── Helpers ──────────────────────────────────────────────────────────────────

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function anoMesLabel(anoMes: string) {
  const [year, month] = anoMes.split('-')
  return `${MESES[parseInt(month) - 1]}/${year.slice(2)}`
}

const COR_HEX: Record<string, string> = {
  verde:    '#10b981',
  amarelo:  '#f59e0b',
  vermelho: '#ef4444',
}

const COR_CLS: Record<string, string> = {
  verde:    'text-emerald-600',
  amarelo:  'text-amber-500',
  vermelho: 'text-red-500',
}

function fmtMiCurto(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mi`
  if (Math.abs(v) >= 1_000)     return `${Math.round(v / 1_000)}k`
  return String(Math.round(v))
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PipelineCard() {
  const [data,    setData]    = useState<PipelineWeddings | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/weddings/pipeline')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setErro(e.message); setLoading(false) })
  }, [])

  const chartData = data?.meses.map(m => ({
    label:              anoMesLabel(m.ano_mes),
    receita_total:      m.receita_total,
    cor:                m.cor,
    n_casamentos:       m.n_casamentos,
    margem_pct_media:   m.margem_pct_media,
    resultado_esperado: m.resultado_esperado,
  })) ?? []

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      {/* Header */}
      <div className="flex items-baseline gap-2 mb-4 flex-wrap">
        <h2 className="text-sm font-semibold text-zinc-700">Pipeline de Eventos</h2>
        {data && !loading && (
          <span className="text-xs text-zinc-400">
            próximos {data.horizonte} meses · {data.total.n_casamentos} casamentos
            · {fmtBRL(data.total.receita_total)} em receita
          </span>
        )}
        {/* Legenda de cores */}
        {!loading && (
          <div className="ml-auto flex gap-3">
            {(['verde', 'amarelo', 'vermelho'] as const).map(cor => (
              <span key={cor} className="flex items-center gap-1 text-[10px] text-zinc-500">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COR_HEX[cor] }} />
                {cor === 'verde' ? 'Margem >15%' : cor === 'amarelo' ? '10–15%' : '<10%'}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-48 rounded-lg bg-zinc-100" />
          <div className="h-36 rounded-lg bg-zinc-100" />
        </div>
      ) : erro ? (
        <p className="text-sm text-zinc-400 text-center py-8">{erro}</p>
      ) : !data || data.meses.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-8">
          Nenhum evento futuro registrado nos próximos {data?.horizonte ?? 18} meses.
        </p>
      ) : (
        <>
          {/* Gráfico de barras */}
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#a1a1aa' }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tickFormatter={fmtMiCurto}
                tick={{ fontSize: 10, fill: '#a1a1aa' }}
                axisLine={false} tickLine={false}
                width={40} tickCount={4}
              />
              <Tooltip
                formatter={(v, _name, props) => {
                  const d = props.payload as typeof chartData[0]
                  return [
                    [fmtBRL(Number(v)), 'Receita'],
                    [`${d.margem_pct_media.toFixed(1)}%`, 'Margem média'],
                    [String(d.n_casamentos), 'Casamentos'],
                  ] as unknown as [string, string]
                }}
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
              />
              <Bar dataKey="receita_total" radius={[3, 3, 0, 0]} maxBarSize={36}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={COR_HEX[entry.cor] ?? '#a1a1aa'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Tabela mensal */}
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="py-2 px-3 text-left  font-medium text-zinc-400">Mês</th>
                  <th className="py-2 px-3 text-right font-medium text-zinc-400">Casamentos</th>
                  <th className="py-2 px-3 text-right font-medium text-zinc-400">Receita</th>
                  <th className="py-2 px-3 text-right font-medium text-zinc-400">Margem</th>
                  <th className="py-2 px-3 text-right font-medium text-zinc-400">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {data.meses.map(m => (
                  <tr key={m.ano_mes} className="hover:bg-zinc-50">
                    <td className="py-2 px-3 font-medium text-zinc-700">{anoMesLabel(m.ano_mes)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-600">{m.n_casamentos}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-700">{fmtBRL(m.receita_total)}</td>
                    <td className={`py-2 px-3 text-right tabular-nums font-medium ${COR_CLS[m.cor] ?? 'text-zinc-500'}`}>
                      {m.margem_pct_media.toFixed(1)}%
                    </td>
                    <td className={`py-2 px-3 text-right tabular-nums ${m.resultado_esperado < 0 ? 'text-red-500' : 'text-zinc-700'}`}>
                      {fmtBRL(m.resultado_esperado)}
                    </td>
                  </tr>
                ))}
                {/* Total */}
                <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold">
                  <td className="py-2 px-3 text-zinc-800">Total</td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-700">{data.total.n_casamentos}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-800">{fmtBRL(data.total.receita_total)}</td>
                  <td className="py-2 px-3" />
                  <td className={`py-2 px-3 text-right tabular-nums font-semibold ${data.total.resultado_esperado < 0 ? 'text-red-500' : 'text-zinc-800'}`}>
                    {fmtBRL(data.total.resultado_esperado)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
