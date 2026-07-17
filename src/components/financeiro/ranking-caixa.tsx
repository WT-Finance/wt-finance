import type { RankingCaixa as RankingCaixaData, RankingItem } from '@/lib/fluxo/rpc-fluxo'
import { numBRL2, fmtAxisPct } from '@/lib/fmt'

// Ranking de Caixa (v5.2.0/Onda 1 — repensado no round 2 do checkpoint). Dois cards
// ("Pioraram"/"Melhoraram" o caixa) comparando o acumulado do ano (YTD) com o mesmo
// período do ano anterior, por categoria, no modelo contábil da controladoria.
//
// Desenho ADAPTATIVO — a lição do round anterior: quando NÃO há base comparável
// (histórico do ano anterior ausente, ex.: base recém-carregada só com o ano corrente),
// as colunas do ano-1 e Δ viram puro ruído ("0,00" e "sem base" em toda linha) e
// quebram o layout. Nesse estado o card ESCONDE essas colunas (Δ ≡ YTD atual quando a
// base é zero) e explica a ausência UMA vez, no subtítulo — quando o histórico chegar,
// a comparação completa aparece sozinha.
//
// Densidade: linhas compactas (py-2, align-middle), números com whitespace-nowrap +
// tabular-nums (nunca quebram linha), categoria com truncate + title. Prioridade 1–5
// só no card "Pioraram" (círculo numerado + fundo suave), como no modelo.

interface Props {
  data: RankingCaixaData
}

/** Ano corrente no fuso de São Paulo (mesmo idioma do hojeSP() do resto do Fluxo). */
function anoAtualSP(): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 4))
}

export default function RankingCaixa({ data }: Props) {
  const anoAtual    = anoAtualSP()
  const anoAnterior = anoAtual - 1

  if (data.pioraram.length === 0 && data.melhoraram.length === 0) {
    return (
      <div className="rounded-xl shadow-sm bg-white p-5">
        <p className="text-sm text-zinc-400">Sem movimentações realizadas para ranquear no ano.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <RankingCard
        titulo="Pioraram o caixa — atenção"
        itens={data.pioraram}
        tom="negativo"
        anoAtual={anoAtual}
        anoAnterior={anoAnterior}
        prioridade
      />
      <RankingCard
        titulo="Melhoraram o caixa — positivo"
        itens={data.melhoraram}
        tom="positivo"
        anoAtual={anoAtual}
        anoAnterior={anoAnterior}
      />
    </div>
  )
}

function RankingCard({ titulo, itens, tom, anoAtual, anoAnterior, prioridade = false }: {
  titulo:      string
  itens:       RankingItem[]
  tom:         'positivo' | 'negativo'
  anoAtual:    number
  anoAnterior: number
  prioridade?: boolean
}) {
  const negativo  = tom === 'negativo'
  const corTitulo = negativo ? 'var(--negative-deep)' : 'var(--positive-deep)'
  const corDelta  = negativo ? 'var(--negative-deep)' : 'var(--positive-deep)'

  // Sem NENHUM item com base no ano anterior → modo compacto (só o acumulado do ano).
  const temBase = itens.some(i => i.t25 !== 0)

  const subtitulo = temBase
    ? (negativo
        ? `maior gasto ou menor receita · acumulado do ano vs ${anoAnterior} · 1–5 = prioridade`
        : `menor gasto ou maior receita · acumulado do ano vs ${anoAnterior}`)
    : `acumulado de ${anoAtual} · a comparação com ${anoAnterior} aparece quando o histórico estiver carregado`

  return (
    <div className="rounded-xl shadow-sm bg-white p-5">
      <h3 className="text-sm font-semibold" style={{ color: corTitulo }}>{titulo}</h3>
      <p className="text-2xs mt-0.5 mb-3 text-zinc-400">{subtitulo}</p>

      {itens.length === 0 ? (
        <p className="text-xs text-zinc-400 py-2">Sem categorias nesta lista.</p>
      ) : (
        <table className="w-full table-fixed">
          <thead>
            <tr className="text-2xs font-medium text-zinc-400">
              {prioridade && <th className="w-[26px] pb-1.5" aria-label="Prioridade" />}
              <th className="text-left pb-1.5 font-medium">Categoria</th>
              {temBase && <th className="w-[104px] text-right pb-1.5 pl-2 font-medium whitespace-nowrap">{anoAnterior}</th>}
              <th className={`${temBase ? 'w-[104px]' : 'w-[128px]'} text-right pb-1.5 pl-2 font-medium whitespace-nowrap`}>{anoAtual}</th>
              {temBase && <th className="w-[112px] text-right pb-1.5 pl-2 font-medium whitespace-nowrap">Δ R$</th>}
              {temBase && <th className="w-[58px] text-right pb-1.5 pl-2 font-medium whitespace-nowrap">Δ %</th>}
            </tr>
          </thead>
          <tbody>
            {itens.map((it, i) => {
              const marcado = prioridade && i < 5
              const tdBase  = `py-2 align-middle ${marcado ? 'bg-[var(--negative-soft)]' : 'border-b border-zinc-50'}`
              return (
                <tr key={it.c} className="[&:last-child>td]:border-0">
                  {prioridade && (
                    <td className={`${tdBase} ${marcado ? 'rounded-l-md' : ''} pl-1`}>
                      {marcado && (
                        <span
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-3xs font-semibold tabular-nums"
                          style={{ background: 'var(--negative-deep)' }}
                        >
                          {i + 1}
                        </span>
                      )}
                    </td>
                  )}
                  <td className={`${tdBase} pr-2 min-w-0`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0 rounded bg-zinc-100 px-1 py-px text-3xs leading-4 text-zinc-500">
                        {it.nat === 'desp' ? 'gasto' : 'receita'}
                      </span>
                      <span className="truncate text-2xs text-zinc-700" title={it.c}>{it.c || '(sem categoria)'}</span>
                    </div>
                  </td>
                  {temBase && (
                    <td className={`${tdBase} pl-2 text-right whitespace-nowrap`}>
                      <ValorParen v={it.t25} />
                    </td>
                  )}
                  <td className={`${tdBase} ${!temBase ? 'rounded-r-md' : ''} pl-2 text-right whitespace-nowrap`}>
                    <ValorParen v={it.t26} />
                  </td>
                  {temBase && (
                    <td className={`${tdBase} pl-2 text-right whitespace-nowrap`}>
                      <ValorParen v={it.d} cor={corDelta} />
                    </td>
                  )}
                  {temBase && (
                    <td className={`${tdBase} rounded-r-md pl-2 text-right whitespace-nowrap`}>
                      {it.pct === null ? (
                        <span className="text-2xs text-zinc-300">—</span>
                      ) : (
                        <span className="text-2xs font-medium tabular-nums" style={{ color: corDelta }}>
                          {it.pct >= 0 ? '+' : ''}{fmtAxisPct(it.pct, 1)}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

/**
 * Formato contábil (modelo da controladoria): negativo entre parênteses e em cor de
 * alerta; positivo herda a cor do texto. `cor` força a cor (Δ segue o tom do card).
 */
function ValorParen({ v, cor }: { v: number; cor?: string }) {
  const neg   = v < 0
  const style = cor ? { color: cor } : (neg ? { color: 'var(--negative-deep)' } : undefined)
  return (
    <span className="text-2xs font-medium tabular-nums" style={style}>
      {neg ? `(${numBRL2(Math.abs(v))})` : numBRL2(v)}
    </span>
  )
}
