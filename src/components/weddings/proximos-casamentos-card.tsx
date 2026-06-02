'use client'

import { useState } from 'react'
import { Calendar } from 'lucide-react'
import type { ProximosCasamentos } from '@/types/api'
import { fmtDateMid } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'
import EmptyState from '@/components/shared/empty-state'

const LIMITE = 6

type HorizontePill = '3m' | '6m' | '12m'

interface Props {
  data18m: ProximosCasamentos | null
}

function ResultadoCell({ valor }: { valor: number }) {
  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)

  return (
    <td className="py-2 px-3 text-xs tabular-nums text-right whitespace-nowrap text-zinc-500">
      <span title="Total de entradas menos total de saídas da operação (coincide com Rec. Líq. na Lista de Operações)">
        {fmt}
      </span>
    </td>
  )
}

function DrawerContent({ casamentos }: { casamentos: NonNullable<ProximosCasamentos>['casamentos'] }) {
  const [horizonte, setHorizonte] = useState<HorizontePill>('3m')

  const hoje = new Date()
  const limite = new Date(hoje)
  if (horizonte === '3m')  limite.setMonth(limite.getMonth() + 3)
  if (horizonte === '6m')  limite.setMonth(limite.getMonth() + 6)
  if (horizonte === '12m') limite.setFullYear(limite.getFullYear() + 1)

  const filtrados = casamentos.filter(c => {
    if (!c.data_casamento) return false
    return new Date(c.data_casamento) <= limite
  })

  return (
    <>
      <div className="sticky -top-5 z-20 bg-white -mx-6 -mt-5 px-6 pt-5 pb-3 mb-3 border-b border-zinc-100 flex items-center gap-1.5">
        {(['3m', '6m', '12m'] as HorizontePill[]).map(h => (
          <button
            key={h}
            onClick={() => setHorizonte(h)}
            className={[
              'text-[11px] px-2.5 py-0.5 rounded-full border transition-colors',
              horizonte === h
                ? 'bg-zinc-800 text-white border-zinc-800'
                : 'text-zinc-500 border-zinc-200 hover:border-zinc-400 hover:text-zinc-700',
            ].join(' ')}
          >
            {h === '3m' ? '3 meses' : h === '6m' ? '6 meses' : '12 meses'}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100">
            <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400 whitespace-nowrap">Data</th>
            <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Casal</th>
            <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Hotel</th>
            <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400 whitespace-nowrap">Resultado Previsto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {filtrados.map((c, i) => (
            <tr key={i} className="hover:bg-zinc-50">
              <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">
                {c.data_casamento ? fmtDateMid(c.data_casamento) : '—'}
              </td>
              <td className="py-2 px-3 text-zinc-800 font-medium truncate max-w-50">
                {c.casal ?? '—'}
              </td>
              <td className="py-2 px-3 text-zinc-500 text-xs truncate max-w-40">
                {c.hotel ?? '—'}
              </td>
              <ResultadoCell valor={c.resultado_previsto ?? 0} />
            </tr>
          ))}
        </tbody>
      </table>
      {filtrados.length === 0 && (
        <div className="py-8 text-center text-xs text-zinc-400">
          Nenhum casamento no horizonte selecionado
        </div>
      )}
    </>
  )
}

export default function ProximosCasamentosCard({ data18m }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const casamentos = data18m?.casamentos ?? []
  const visiveis = casamentos.slice(0, LIMITE)
  const temMais = casamentos.length > LIMITE

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4 min-w-0 flex flex-col">
      <h2 className="text-base font-semibold text-[--text-primary] leading-snug mb-4">
        Próximos Casamentos a Entregar
      </h2>

      <div className="flex-1 min-h-0">
        {casamentos.length === 0 ? (
          <EmptyState icon={Calendar} message="Nenhum casamento previsto para o horizonte selecionado" />
        ) : (
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-32" />
              <col />
              <col />
              <col className="w-28" />
            </colgroup>
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Data</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Casal</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Hotel</th>
                <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400 whitespace-nowrap">Resultado Prev.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {visiveis.map((c, i) => (
                <tr key={i} className="hover:bg-zinc-50">
                  <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">
                    {c.data_casamento ? fmtDateMid(c.data_casamento) : '—'}
                  </td>
                  <td className="py-2 px-3 text-zinc-800 font-medium truncate">
                    {c.casal ?? '—'}
                  </td>
                  <td className="py-2 px-3 text-zinc-500 text-xs truncate">
                    {c.hotel ?? '—'}
                  </td>
                  <ResultadoCell valor={c.resultado_previsto ?? 0} />
                </tr>
              ))}
            </tbody>
          </table>
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
        <ListDrawer titulo="Próximos Casamentos a Entregar" subtitulo="Listagem dos próximos casamentos a entregar" onClose={() => setDrawerOpen(false)}>
          <DrawerContent casamentos={casamentos} />
        </ListDrawer>
      )}
    </div>
  )
}
