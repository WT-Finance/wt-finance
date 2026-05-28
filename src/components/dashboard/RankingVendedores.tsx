import type { RankingVendedorItem } from '@/types/api'

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="py-2 px-3"><div className="h-3 w-4 rounded bg-zinc-200" /></td>
      <td className="py-2 px-3"><div className="h-3 w-32 rounded bg-zinc-200" /></td>
      <td className="py-2 px-3"><div className="h-3 w-20 rounded bg-zinc-200" /></td>
      <td className="py-2 px-3"><div className="h-3 w-6 rounded bg-zinc-200" /></td>
    </tr>
  )
}

export default function RankingVendedores({
  data, loading,
}: { data: RankingVendedorItem[]; loading: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-[--border] px-5 py-4">
      <h2 className="text-sm font-semibold text-zinc-700 mb-3">Ranking Vendedores</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400 w-8">#</th>
              <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Nome</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">Valor</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">Vnd.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : data.map((v, i) => (
                  <tr key={v.vendedor_id} className="hover:bg-zinc-50">
                    <td className="py-2 px-3 text-xs text-zinc-400">{i + 1}</td>
                    <td className="py-2 px-3 text-zinc-800 font-medium truncate max-w-[160px]">{v.nome}</td>
                    <td className="py-2 px-3 text-right text-zinc-700 tabular-nums">{fmtBRL(v.valor_total)}</td>
                    <td className="py-2 px-3 text-right text-zinc-500 tabular-nums">{v.vendas_count}</td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}
