import type { MixSetor } from '@/types/api'
import { fmtBRL } from '@/lib/fmt'
import { MARGEM_OK, MARGEM_ALERTA } from '@/lib/config'

function margemColor(v: number | null) {
  if (v == null)           return 'text-zinc-400'
  if (v >= MARGEM_OK)     return 'text-emerald-600'
  if (v >= MARGEM_ALERTA) return 'text-amber-500'
  return 'text-red-500'
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="py-2 px-3">
          <div className="h-3 rounded bg-zinc-100" style={{ width: i === 0 ? 80 : 64 }} />
        </td>
      ))}
    </tr>
  )
}

interface Props {
  data: MixSetor | null
  loading: boolean
}

export default function MixSetorTable({ data, loading }: Props) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <h2 className="text-sm font-semibold text-zinc-700 mb-3">Mix por Setor</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-120 text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Setor</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">Faturamento</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">% Fat.</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">Receita</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">% Rec.</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">Margem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
              : !data
              ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-sm text-zinc-400">
                    Sem dados para o período selecionado.
                  </td>
                </tr>
              )
              : (
                <>
                  {data.setores.map(s => (
                    <tr key={s.setor_macro} className="hover:bg-zinc-50">
                      <td className="py-2 px-3 font-medium" style={{ color: s.cor_hex }}>
                        {s.display_nome}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-zinc-700">
                        {fmtBRL(s.faturamento)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-zinc-500">
                        {s.pct_faturamento.toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-zinc-700">
                        {fmtBRL(s.receita)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-zinc-500">
                        {s.pct_receita.toFixed(1)}%
                      </td>
                      <td className={`py-2 px-3 text-right tabular-nums font-medium ${margemColor(s.margem_pct)}`}>
                        {s.margem_pct != null ? `${s.margem_pct.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold">
                    <td className="py-2 px-3 text-zinc-700">Total</td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-800">
                      {fmtBRL(data.total.faturamento)}
                    </td>
                    <td className="py-2 px-3 text-right text-zinc-400">100%</td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-800">
                      {fmtBRL(data.total.receita)}
                    </td>
                    <td className="py-2 px-3 text-right text-zinc-400">100%</td>
                    <td className={`py-2 px-3 text-right tabular-nums ${margemColor(data.total.margem_pct)}`}>
                      {data.total.margem_pct != null ? `${data.total.margem_pct.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                </>
              )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
