'use client'

import { useState } from 'react'
import type { VendasEmAberto } from '@/types/api'
import { fmtBRL, fmtDate } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'

const LIMITE = 5

interface Props {
  data: VendasEmAberto | null
}

export default function VendasEmAbertoCard({ data }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const vendas = data?.vendas ?? []
  const visiveis = vendas.slice(0, LIMITE)
  const temMais = (data?.total ?? 0) > LIMITE

  if (!data || data.total === 0) {
    return (
      <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)] min-w-0">
        <p className="text-xs text-zinc-500 mb-3">Vendas com situação Aberta no cadastro</p>
        <div className="h-16 flex items-center justify-center text-sm text-zinc-400">
          Nenhuma venda em aberto.
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)] min-w-0">
      <h2 className="text-base font-semibold text-[--text-primary] leading-snug mb-3">Vendas em Aberto</h2>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-[--text-muted]">Vendas com situação Aberta no cadastro</p>
        <span className="text-xs text-warning font-medium">
          {data.total} {data.total === 1 ? 'venda' : 'vendas'} em aberto
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-140 text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="py-2 px-3 text-left  text-xs font-medium text-zinc-400 whitespace-nowrap">Data</th>
              <th className="py-2 px-3 text-left  text-xs font-medium text-zinc-400">Venda Nº</th>
              <th className="py-2 px-3 text-left  text-xs font-medium text-zinc-400 hidden sm:table-cell">Vendedor</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400 whitespace-nowrap">Valor Total</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400 whitespace-nowrap">Idade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {visiveis.map((v, i) => {
              const velha = v.idade_dias > 30
              return (
                <tr key={i} className={velha ? 'bg-warning-bg hover:bg-warning-bg/80' : 'hover:bg-zinc-50'}>
                  <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">
                    {fmtDate(v.data_venda)}
                  </td>
                  <td className="py-2 px-3 font-medium truncate max-w-40">
                    <span className={velha ? 'text-warning' : 'text-zinc-800'}>
                      {v.venda_no}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-zinc-500 truncate max-w-30 text-xs hidden sm:table-cell">
                    {v.vendedor}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-700 whitespace-nowrap">
                    {fmtBRL(v.valor_total)}
                  </td>
                  <td className={`py-2 px-3 text-right tabular-nums text-xs whitespace-nowrap font-medium ${velha ? 'text-warning' : 'text-zinc-400'}`}>
                    {v.idade_dias}d
                    {velha && (
                      <span className="ml-1 text-amber-500" title="Mais de 30 dias em aberto">⚠</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {temMais && (
        <button
          onClick={() => setDrawerOpen(true)}
          className="mt-3 w-full text-xs text-zinc-400 hover:text-zinc-600 py-1.5 border-t border-zinc-100 transition-colors"
        >
          Ver mais
        </button>
      )}

      {drawerOpen && (
        <ListDrawer
          titulo="Vendas em Aberto"
          subtitulo={`${data.total} ${data.total === 1 ? 'venda' : 'vendas'} com situação Aberta no cadastro`}
          onClose={() => setDrawerOpen(false)}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400 whitespace-nowrap">Data</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Venda Nº</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Vendedor</th>
                <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400 whitespace-nowrap">Valor Total</th>
                <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400 whitespace-nowrap">Idade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {vendas.map((v, i) => {
                const velha = v.idade_dias > 30
                return (
                  <tr key={i} className={velha ? 'bg-warning-bg hover:bg-warning-bg/80' : 'hover:bg-zinc-50'}>
                    <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">
                      {fmtDate(v.data_venda)}
                    </td>
                    <td className="py-2 px-3 font-medium truncate max-w-40">
                      <span className={velha ? 'text-warning' : 'text-zinc-800'}>
                        {v.venda_no}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-zinc-500 truncate max-w-30 text-xs">
                      {v.vendedor}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-700 whitespace-nowrap">
                      {fmtBRL(v.valor_total)}
                    </td>
                    <td className={`py-2 px-3 text-right tabular-nums text-xs whitespace-nowrap font-medium ${velha ? 'text-warning' : 'text-zinc-400'}`}>
                      {v.idade_dias}d
                      {velha && (
                        <span className="ml-1 text-amber-500" title="Mais de 30 dias em aberto">⚠</span>
                      )}
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
