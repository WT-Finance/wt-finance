'use client'

import { useState } from 'react'
import { TrendingDown } from 'lucide-react'
import type { VendasReceitaNegativa } from '@/types/api'
import { fmtBRL, fmtDate } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'
import EmptyState from '@/components/shared/empty-state'

const LIMITE = 5

interface Props {
  data: VendasReceitaNegativa | null
}

export default function VendasReceitaNegativaCard({ data }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const vendas = data?.vendas ?? []
  const visiveis = vendas.slice(0, LIMITE)
  const temMais = (data?.total ?? 0) > LIMITE

  if (!data || data.total === 0) {
    return (
      <div className="bg-white rounded-xl border border-[--border] px-5 py-4 min-w-0">
        <p className="text-xs text-zinc-500 mb-3">Vendas com receita bruta negativa</p>
        <EmptyState icon={TrendingDown} message="Nenhuma operação com receita negativa registrada" />
      </div>
    )
  }

  const subtitulo = 'Vendas com receita bruta negativa'

  return (
    <div className="bg-white rounded-xl border border-[--border] px-5 py-4 min-w-0 flex flex-col">
      <h2 className="text-base font-semibold text-[--text-primary] leading-snug mb-3">Vendas com Receita Negativa</h2>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-[--text-muted]">{subtitulo}</p>
        <span className="text-xs text-danger font-medium">
          {data.total} {data.total === 1 ? 'venda' : 'vendas'} com receita negativa
        </span>
      </div>

      <div className="flex-1 min-h-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="py-2 px-3 text-left  text-xs font-medium text-zinc-400 whitespace-nowrap">Data da Venda</th>
              <th className="py-2 px-3 text-left  text-xs font-medium text-zinc-400">Venda Nº</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400 whitespace-nowrap">Valor Total</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400 whitespace-nowrap">Receita</th>
              <th className="py-2 px-3 text-left  text-xs font-medium text-zinc-400 hidden sm:table-cell">Vendedor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {visiveis.map((item, i) => {
              return (
                <tr key={i} className="hover:bg-zinc-50">
                  <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">
                    {fmtDate(item.data_venda)}
                  </td>
                  <td className="py-2 px-3 font-medium truncate max-w-40">
                    {item.venda_no}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-700 whitespace-nowrap">
                    {fmtBRL(item.valor_total)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-danger whitespace-nowrap">
                    {fmtBRL(item.receita)}
                  </td>
                  <td className="py-2 px-3 text-zinc-500 truncate max-w-30 text-xs hidden sm:table-cell">
                    {item.vendedor}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
        <ListDrawer
          titulo="Vendas com Receita Negativa"
          subtitulo={subtitulo}
          onClose={() => setDrawerOpen(false)}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400 whitespace-nowrap">Data da Venda</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Venda Nº</th>
                <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400 whitespace-nowrap">Valor Total</th>
                <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400 whitespace-nowrap">Receita</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Vendedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {vendas.map((item, i) => {
                return (
                  <tr key={i} className="hover:bg-zinc-50">
                    <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">
                      {fmtDate(item.data_venda)}
                    </td>
                    <td className="py-2 px-3 font-medium truncate max-w-40">
                      {item.venda_no}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-700 whitespace-nowrap">
                      {fmtBRL(item.valor_total)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-danger whitespace-nowrap">
                      {fmtBRL(item.receita)}
                    </td>
                    <td className="py-2 px-3 text-zinc-500 truncate max-w-30 text-xs">
                      {item.vendedor}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ListDrawer>
      )}
    </div>
  )
}
