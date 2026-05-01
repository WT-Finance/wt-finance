import type { PrejuizosSummary } from '@/types/api'
import { fmtBRL } from '@/lib/fmt'

interface Props {
  data: PrejuizosSummary | null
  loading: boolean
}

export default function PrejuizosKpi({ data, loading }: Props) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
        Vendas com Prejuízo
      </p>

      {loading ? (
        <div className="mt-2 space-y-1 animate-pulse">
          <div className="h-6 w-20 rounded bg-zinc-200" />
          <div className="h-3 w-32 rounded bg-zinc-100" />
        </div>
      ) : !data || data.quantidade === 0 ? (
        <p className="mt-2 text-sm text-zinc-400">Nenhuma no período.</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold text-red-500 tabular-nums leading-none">
            {data.quantidade}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {data.quantidade === 1 ? 'venda' : 'vendas'} · total {fmtBRL(data.valor_prejuizo_total)} em prejuízo
          </p>
        </>
      )}
    </div>
  )
}
