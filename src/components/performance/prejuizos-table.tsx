import type { PrejuizosDetalhe } from '@/types/api'
import { fmtBRL, fmtDate } from '@/lib/fmt'

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
  data: PrejuizosDetalhe | null
  loading: boolean
}

export default function PrejuizosTable({ data, loading }: Props) {
  const total = data?.total
  const vendas = data?.vendas ?? []
  const mostrando = vendas.length
  const totalNo = data?.total_no_periodo ?? 0

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-zinc-500">Operações com margem negativa no período</p>
        {total && total.quantidade > 0 && (
          <span className="text-xs text-red-500 font-medium">
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
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : !data || vendas.length === 0
              ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-sm text-zinc-400">
                    Nenhuma venda com prejuízo no período.
                  </td>
                </tr>
              )
              : vendas.map((v, i) => (
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
                  <td className="py-2 px-3 text-right tabular-nums font-medium text-red-500">
                    {fmtBRL(v.receitas)}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {!loading && totalNo > mostrando && (
        <p className="mt-2 text-xs text-zinc-400 text-center">
          Mostrando {mostrando} de {totalNo} ocorrências
        </p>
      )}
    </div>
  )
}
