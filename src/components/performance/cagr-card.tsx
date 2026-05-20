import type { CagrData } from '@/types/api'

interface Props {
  data: CagrData | null
  loading: boolean
}

function Pct({ v }: { v: number | null }) {
  if (v == null) return <span className="text-zinc-400">—</span>
  const color = v >= 0 ? 'text-success' : 'text-danger'
  return (
    <span className={`font-semibold tabular-nums ${color}`}>
      {v >= 0 ? '+' : ''}{v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
    </span>
  )
}

export default function CagrCard({ data, loading }: Props) {
  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)]">
      <h2 className="text-base font-semibold text-[--text-primary] mb-3">CAGR</h2>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 w-32 rounded bg-zinc-200" />
          <div className="h-6 w-20 rounded bg-zinc-200" />
        </div>
      ) : !data || data.erro ? (
        <p className="text-sm text-zinc-400">
          {data?.erro ?? 'Sem dados suficientes.'}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">
            {data.ano_inicial} → {data.ano_final} ({data.ano_final - data.ano_inicial} {data.ano_final - data.ano_inicial === 1 ? 'ano' : 'anos'})
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Faturamento</p>
              <p className="text-2xl leading-none"><Pct v={data.cagr_faturamento_pct} /></p>
              <p className="text-xs text-zinc-400 mt-0.5">ao ano</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Receita</p>
              <p className="text-2xl leading-none"><Pct v={data.cagr_receita_pct} /></p>
              <p className="text-xs text-zinc-400 mt-0.5">ao ano</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
