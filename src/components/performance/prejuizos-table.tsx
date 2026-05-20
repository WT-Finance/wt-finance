'use client'

import { useState } from 'react'
import type { PrejuizosDetalhe } from '@/types/api'
import { fmtBRL, fmtDate } from '@/lib/fmt'

const LIMITE = 5

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="py-2 px-3">
          <div className="h-3 rounded bg-zinc-100" style={{ width: i === 1 ? 100 : 64 }} />
        </td>
      ))}
    </tr>
  )
}

interface Props {
  data:    PrejuizosDetalhe | null
  loading: boolean
  titulo?: string
}

export default function PrejuizosTable({ data, loading, titulo = 'Vendas com Prejuízo' }: Props) {
  const [verTodos, setVerTodos] = useState(false)

  const total = data?.total
  const vendas = data?.vendas ?? []
  const visiveis = verTodos ? vendas : vendas.slice(0, LIMITE)
  const temMais = vendas.length > LIMITE
  const totalNo = data?.total_no_periodo ?? 0

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)] min-w-0">
      <h2 className="text-base font-semibold text-[--text-primary] leading-snug mb-3">{titulo}</h2>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-[--text-muted]">Operações com margem negativa no período</p>
        {total && total.quantidade > 0 && (
          <span className="text-xs text-danger font-medium">
            {total.quantidade} {total.quantidade === 1 ? 'venda' : 'vendas'} · {fmtBRL(total.valor_prejuizo_total)} em prejuízo
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-96 text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Data</th>
              <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Vendedor</th>
              <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400 hidden sm:table-cell">Produto</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">Valor</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">Receita</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {loading
              ? Array.from({ length: LIMITE }).map((_, i) => <SkeletonRow key={i} />)
              : !data || vendas.length === 0
              ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-sm text-zinc-400">
                    Nenhuma venda com prejuízo no período.
                  </td>
                </tr>
              )
              : visiveis.map((v, i) => (
                <tr key={i} className="hover:bg-zinc-50">
                  <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">
                    {fmtDate(v.data_venda)}
                  </td>
                  <td className="py-2 px-3 text-zinc-700 font-medium truncate max-w-30">
                    {v.vendedor_nome}
                  </td>
                  <td className="py-2 px-3 text-zinc-500 truncate max-w-40 hidden sm:table-cell">
                    {v.produto_nome}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-600">
                    {fmtBRL(v.valor_total)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums font-medium text-danger">
                    {fmtBRL(v.receitas)}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {!loading && temMais && (
        <button
          onClick={() => setVerTodos(v => !v)}
          className="mt-3 w-full text-xs text-zinc-400 hover:text-zinc-600 py-1.5 border-t border-zinc-100 transition-colors"
        >
          {verTodos ? 'Ver menos' : `Ver todos (${totalNo > vendas.length ? totalNo : vendas.length})`}
        </button>
      )}
    </div>
  )
}
