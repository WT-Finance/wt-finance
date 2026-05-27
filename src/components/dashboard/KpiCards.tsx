import type { KpisMes } from '@/types/api'

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-[--border] px-5 py-4">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900 tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-[--border] px-5 py-4 animate-pulse">
      <div className="h-3 w-20 rounded bg-zinc-200" />
      <div className="mt-2 h-7 w-32 rounded bg-zinc-200" />
    </div>
  )
}

export default function KpiCards({ data, loading }: { data: KpisMes | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  const yoyDiff =
    data.vendas_count > 0 && data.valor_ano_anterior > 0
      ? (data.valor_realizado / data.valor_ano_anterior - 1) * 100
      : null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
      <Card label="Realizado"   value={fmtBRL(data.valor_realizado)}  sub={`${data.vendas_count} vendas`} />
      <Card label="Meta"        value={fmtBRL(data.valor_meta)} />
      <Card
        label="Atingimento"
        value={data.pct_atingimento != null ? `${data.pct_atingimento.toFixed(1)}%` : '—'}
      />
      <Card
        label="Projeção"
        value={data.projecao_fim_mes != null ? fmtBRL(data.projecao_fim_mes) : '—'}
        sub={data.projecao_fim_mes != null ? 'fim do mês' : 'mês encerrado'}
      />
      <Card
        label="Ano anterior"
        value={fmtBRL(data.valor_ano_anterior)}
        sub={yoyDiff != null ? `${yoyDiff >= 0 ? '+' : ''}${yoyDiff.toFixed(1)}% YoY` : undefined}
      />
    </div>
  )
}
