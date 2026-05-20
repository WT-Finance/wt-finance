'use client'

import { useState } from 'react'
import type { ProximosCasamentos } from '@/types/api'
import { fmtBRL, fmtDate } from '@/lib/fmt'
import { margemColor } from '@/lib/config'

const HORIZONTES = [3, 6, 12, 18] as const
type Horizonte = typeof HORIZONTES[number]
const LIMITE = 5

interface Props {
  data18m: ProximosCasamentos | null
}

export default function ProximosCasamentosCard({ data18m }: Props) {
  const [horizonte, setHorizonte] = useState<Horizonte>(6)
  const [verTodos, setVerTodos] = useState(false)

  const hoje = new Date()
  const limite = new Date(hoje.getFullYear(), hoje.getMonth() + horizonte, hoje.getDate())
  const casamentos = (data18m?.casamentos ?? []).filter(c => {
    if (!c.data_casamento) return false
    return new Date(c.data_casamento) <= limite
  })
  const visiveis = verTodos ? casamentos : casamentos.slice(0, LIMITE)

  const margemHist = data18m?.margem_historica_pct

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)] min-w-0">
      <h2 className="text-base font-semibold text-[--text-primary] leading-snug mb-4">Próximos Casamentos a Entregar</h2>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-[13px] text-[--text-muted]">
          {margemHist != null
            ? `RL prevista baseada em margem histórica de ${margemHist.toFixed(1)}%`
            : 'Ordenado por data do casamento'}
        </p>
        <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-xs">
          {HORIZONTES.map(h => (
            <button
              key={h}
              onClick={() => setHorizonte(h)}
              className={`px-2.5 py-1.5 transition-colors ${
                horizonte === h
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:bg-zinc-50'
              }`}
            >
              {h}m
            </button>
          ))}
        </div>
      </div>

      {casamentos.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-6">
          Nenhum casamento previsto nos próximos {horizonte} meses.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="py-2 px-3 text-left   text-xs font-medium text-zinc-400 whitespace-nowrap">Data</th>
                <th className="py-2 px-3 text-left   text-xs font-medium text-zinc-400">Casal</th>
                <th className="py-2 px-3 text-left   text-xs font-medium text-zinc-400">Hotel</th>
                <th className="py-2 px-3 text-right  text-xs font-medium text-zinc-400 whitespace-nowrap">Faturamento</th>
                <th className="py-2 px-3 text-right  text-xs font-medium text-zinc-400 whitespace-nowrap">Receita Bruta</th>
                <th className="py-2 px-3 text-right  text-xs font-medium text-zinc-400 whitespace-nowrap">Margem %</th>
                <th className="py-2 px-3 text-right  text-xs font-medium text-zinc-400 whitespace-nowrap">RL Prevista</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {visiveis.map((c, i) => (
                <tr key={i} className="hover:bg-zinc-50">
                  <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">
                    {c.data_casamento ? fmtDate(c.data_casamento) : '—'}
                  </td>
                  <td className="py-2 px-3 text-zinc-800 font-medium truncate max-w-[160px]">
                    {c.casal ?? '—'}
                  </td>
                  <td className="py-2 px-3 text-zinc-500 truncate max-w-[120px] text-xs">
                    {c.hotel ?? '—'}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-700 whitespace-nowrap">
                    {fmtBRL(c.faturamento)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-700 whitespace-nowrap">
                    {fmtBRL(c.receita_bruta)}
                  </td>
                  <td className={`py-2 px-3 text-right tabular-nums font-medium whitespace-nowrap ${margemColor(c.margem_pct)}`}>
                    {c.margem_pct.toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-500 text-xs whitespace-nowrap italic">
                    {c.receita_liquida_prevista > 0 ? fmtBRL(c.receita_liquida_prevista) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {casamentos.length > LIMITE && (
        <button
          onClick={() => setVerTodos(v => !v)}
          className="mt-3 w-full text-xs text-zinc-400 hover:text-zinc-600 py-1.5 border-t border-zinc-100 transition-colors"
        >
          {verTodos ? 'Ver menos' : `Ver todos (${casamentos.length})`}
        </button>
      )}
    </div>
  )
}
