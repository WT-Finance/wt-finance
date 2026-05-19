import type { MixProduto } from '@/types/api'
import { fmtBRL } from '@/lib/fmt'
import { margemColor } from '@/lib/config'

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="py-2 px-3">
          <div className="h-3 rounded bg-zinc-100" style={{ width: i === 0 ? 120 : 56 }} />
        </td>
      ))}
    </tr>
  )
}

interface Props {
  data: MixProduto | null
  loading: boolean
}

export default function MixProdutoTable({ data, loading }: Props) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4 min-w-0">
      <p className="text-xs text-zinc-500 mb-3">Faturamento e margem por produto no período</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-105 text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400 w-8">#</th>
              <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Produto</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">Faturamento</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">% Total</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">Margem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {loading
              ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
              : !data
              ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-sm text-zinc-400">
                    Sem dados para o período selecionado.
                  </td>
                </tr>
              )
              : (
                <>
                  {data.produtos.map((p, i) => (
                    <tr key={p.produto_nome} className="hover:bg-zinc-50">
                      <td className="py-2 px-3 text-xs text-zinc-400">{i + 1}</td>
                      <td className="py-2 px-3 text-zinc-800 font-medium truncate max-w-45">
                        {p.produto_nome}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-zinc-700">
                        {fmtBRL(p.faturamento)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-zinc-500">
                        {p.pct_faturamento.toFixed(1)}%
                      </td>
                      <td className={`py-2 px-3 text-right tabular-nums font-medium ${margemColor(p.margem_pct)}`}>
                        {p.margem_pct != null ? `${p.margem_pct.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                  {data.outros.quantidade_produtos > 0 && (
                    <tr className="bg-zinc-50 text-zinc-500 italic">
                      <td className="py-2 px-3 text-xs text-zinc-300">+{data.outros.quantidade_produtos}</td>
                      <td className="py-2 px-3 text-sm">Outros</td>
                      <td className="py-2 px-3 text-right tabular-nums not-italic">
                        {fmtBRL(data.outros.faturamento)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums not-italic">
                        {data.outros.pct_faturamento.toFixed(1)}%
                      </td>
                      <td className={`py-2 px-3 text-right tabular-nums not-italic font-medium ${margemColor(data.outros.margem_pct)}`}>
                        {data.outros.margem_pct != null ? `${data.outros.margem_pct.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  )}
                </>
              )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
