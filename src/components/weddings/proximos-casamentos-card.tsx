'use client'

import { useState } from 'react'
import { Calendar } from 'lucide-react'
import type { ProximosCasamentos } from '@/types/api'
import { fmtDateLong } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'
import EmptyState from '@/components/shared/empty-state'

const LIMITE = 6

interface Props {
  data18m: ProximosCasamentos | null
}

export default function ProximosCasamentosCard({ data18m }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const casamentos = data18m?.casamentos ?? []
  const visiveis = casamentos.slice(0, LIMITE)
  const temMais = casamentos.length > LIMITE

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)] min-w-0 flex flex-col">
      <h2 className="text-base font-semibold text-[--text-primary] leading-snug mb-4">
        Próximos Casamentos a Entregar
      </h2>

      <div className="flex-1 min-h-0">
        {casamentos.length === 0 ? (
          <EmptyState icon={Calendar} message="Nenhum casamento previsto para o horizonte selecionado" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400 whitespace-nowrap">Data do Evento</th>
                  <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Casal</th>
                  <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Hotel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {visiveis.map((c, i) => (
                  <tr key={i} className="hover:bg-zinc-50">
                    <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">
                      {c.data_casamento ? fmtDateLong(c.data_casamento) : '—'}
                    </td>
                    <td className="py-2 px-3 text-zinc-800 font-medium truncate max-w-50">
                      {c.casal ?? '—'}
                    </td>
                    <td className="py-2 px-3 text-zinc-500 text-xs truncate max-w-40">
                      {c.hotel ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-zinc-100">
        {temMais ? (
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-full text-xs text-zinc-400 hover:text-zinc-600 py-1.5 transition-colors"
          >
            Ver mais
          </button>
        ) : (
          <div className="py-1.5" />
        )}
      </div>

      {drawerOpen && (
        <ListDrawer titulo="Próximos Casamentos a Entregar" onClose={() => setDrawerOpen(false)}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400 whitespace-nowrap">Data do Evento</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Casal</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Hotel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {casamentos.map((c, i) => (
                <tr key={i} className="hover:bg-zinc-50">
                  <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">
                    {c.data_casamento ? fmtDateLong(c.data_casamento) : '—'}
                  </td>
                  <td className="py-2 px-3 text-zinc-800 font-medium truncate max-w-50">
                    {c.casal ?? '—'}
                  </td>
                  <td className="py-2 px-3 text-zinc-500 text-xs truncate max-w-40">
                    {c.hotel ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ListDrawer>
      )}
    </div>
  )
}
