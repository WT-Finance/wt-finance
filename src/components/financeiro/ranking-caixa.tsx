import { fmtMi, fmtAxisPct } from '@/lib/fmt'
import Badge from '@/components/ui/badge'
import type { RankingCaixa as RankingCaixaData, RankingItem } from '@/lib/fluxo/rpc-fluxo'

// Ranking de Caixa (v5.2.0/Onda 1) — categorias que mais PIORARAM/MELHORARAM o caixa,
// YTD × YTD do ano anterior (get_fluxo_ranking). Já vem ordenado do backend por |Δ|
// (maior impacto no topo) — a ordem em si é o marcador de prioridade (nº da linha).

interface Props {
  data: RankingCaixaData
}

export default function RankingCaixa({ data }: Props) {
  const semDados = data.pioraram.length === 0 && data.melhoraram.length === 0

  if (semDados) {
    return (
      <div className="rounded-xl shadow-sm bg-white p-5">
        <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Ranking de Caixa</h3>
        <p className="text-sm text-zinc-400">Sem dados comparáveis (YTD × YTD ano anterior)</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl shadow-sm bg-white p-5">
      <div className="mb-1">
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Ranking de Caixa</h3>
      </div>
      <p className="text-2xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Categorias com maior variação de impacto no caixa — este ano até hoje vs. mesmo período do ano anterior.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
        <RankingColuna titulo="Pioraram o caixa" itens={data.pioraram} tom="negativo" />
        <RankingColuna titulo="Melhoraram o caixa" itens={data.melhoraram} tom="positivo" />
      </div>
    </div>
  )
}

function RankingColuna({ titulo, itens, tom }: {
  titulo: string
  itens:  RankingItem[]
  tom:    'positivo' | 'negativo'
}) {
  const corTitulo = tom === 'positivo' ? 'var(--positive)'      : 'var(--negative)'
  const corDelta   = tom === 'positivo' ? 'var(--positive-deep)' : 'var(--negative-deep)'

  if (!itens.length) {
    return (
      <div>
        <p className="text-xs mb-2 font-medium" style={{ color: corTitulo }}>{titulo}</p>
        <p className="text-xs text-zinc-400">Sem categorias nesta lista</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs mb-2 font-medium" style={{ color: corTitulo }}>{titulo}</p>
      <table className="w-full">
        <thead>
          <tr className="text-3xs font-medium text-zinc-400">
            <th className="text-left font-semibold pb-1.5 w-5">#</th>
            <th className="text-left font-semibold pb-1.5">Categoria</th>
            <th className="text-right font-semibold pb-1.5">Variação</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it, i) => {
            const semBase = it.t25 === 0
            const sinal   = it.d >= 0 ? '+' : '−'
            return (
              <tr key={it.c} className="border-b border-zinc-50 last:border-0">
                <td className="py-1.5 pr-1 text-2xs text-zinc-400 tabular-nums align-top">{i + 1}</td>
                <td className="py-1.5 pr-2 min-w-0 align-top">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-2xs text-zinc-700 truncate">{it.c || '(sem categoria)'}</span>
                    <Badge variant="neutro" className="shrink-0">
                      {it.nat === 'desp' ? 'Despesa' : 'Receita'}
                    </Badge>
                  </div>
                  <p className="text-3xs text-zinc-400 tabular-nums">
                    {fmtMi(it.t25)} → {fmtMi(it.t26)}
                  </p>
                </td>
                <td className="py-1.5 text-right align-top">
                  <p className="text-2xs font-semibold tabular-nums" style={{ color: corDelta }}>
                    {sinal}{fmtMi(Math.abs(it.d))}
                  </p>
                  <p className="text-3xs text-zinc-400 tabular-nums">
                    {semBase || it.pct == null
                      ? 'sem base comparável'
                      : `${it.pct >= 0 ? '+' : ''}${fmtAxisPct(it.pct, 0)}`}
                  </p>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
