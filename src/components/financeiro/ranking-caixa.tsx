import Badge from '@/components/ui/badge'
import { numBRL2, fmtAxisPct } from '@/lib/fmt'
import type { RankingCaixa as RankingCaixaData, RankingItem } from '@/lib/fluxo/rpc-fluxo'

// Ranking de Caixa (v5.2.0/Onda 1, ajuste do checkpoint do Yan) — dois CARDS lado a lado
// ("Pioraram"/"Melhoraram" o caixa), no modelo contábil da controladoria: categorias YTD ×
// YTD do ano anterior (get_fluxo_ranking), já ordenadas pelo backend por |Δ| (maior impacto
// no topo — a ordem em si é o marcador de prioridade). No card "Pioraram", as 5 primeiras
// linhas ganham marcador numérico de prioridade + fundo suave (é o que a controladoria olha
// primeiro). Substitui a versão anterior de 2 colunas simples, sem título/nota gerais — os
// cards são autoexplicativos.

interface Props {
  data: RankingCaixaData
}

/** Ano corrente no fuso de São Paulo (mesmo idioma de hojeSP() usado no resto do Fluxo). */
function anoAtualSP(): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 4))
}

export default function RankingCaixa({ data }: Props) {
  const anoAtual    = anoAtualSP()
  const anoAnterior = anoAtual - 1
  const semDados    = data.pioraram.length === 0 && data.melhoraram.length === 0

  if (semDados) {
    return (
      <div className="rounded-xl shadow-sm bg-white p-5">
        <p className="text-sm text-zinc-400">Sem dados comparáveis (YTD × YTD ano anterior)</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <RankingCard
        titulo="Pioraram o caixa — atenção"
        subtitulo={`maior gasto ou menor receita vs ${anoAnterior} · 1–5 = prioridade · etiqueta indica gasto/receita`}
        itens={data.pioraram}
        tom="negativo"
        anoAtual={anoAtual}
        anoAnterior={anoAnterior}
        prioridade
      />
      <RankingCard
        titulo="Melhoraram o caixa — positivo"
        subtitulo={`menor gasto ou maior receita vs ${anoAnterior}`}
        itens={data.melhoraram}
        tom="positivo"
        anoAtual={anoAtual}
        anoAnterior={anoAnterior}
      />
    </div>
  )
}

function RankingCard({ titulo, subtitulo, itens, tom, anoAtual, anoAnterior, prioridade = false }: {
  titulo:      string
  subtitulo:   string
  itens:       RankingItem[]
  tom:         'positivo' | 'negativo'
  anoAtual:    number
  anoAnterior: number
  prioridade?: boolean
}) {
  const negativo  = tom === 'negativo'
  const corTitulo = negativo ? 'text-[var(--negative-deep)]' : 'text-[var(--positive-deep)]'
  const corBorda  = negativo ? 'border-[var(--negative-soft)]' : 'border-[var(--positive-soft)]'
  const corDelta  = negativo ? 'text-[var(--negative-deep)]' : 'text-[var(--positive-deep)]'

  return (
    <div className={`rounded-xl shadow-sm bg-white p-5 border ${corBorda}`}>
      <h3 className={`text-sm font-semibold ${corTitulo}`}>{titulo}</h3>
      <p className="text-2xs mt-0.5 mb-3 text-zinc-400">{subtitulo}</p>

      {itens.length === 0 ? (
        <p className="text-xs text-zinc-400 py-2">Sem categorias nesta lista</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-2xs font-medium text-zinc-400">
              {prioridade && <th className="text-left pb-1.5 w-5" />}
              <th className="text-left pb-1.5">Categoria</th>
              <th className="text-right pb-1.5 pl-2">YTD {anoAnterior}</th>
              <th className="text-right pb-1.5 pl-2">YTD {anoAtual}</th>
              <th className="text-right pb-1.5 pl-2">Δ R$</th>
              <th className="text-right pb-1.5 pl-2">Δ %</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it, i) => {
              const marcado = prioridade && i < 5
              return (
                <tr
                  key={it.c}
                  className={`border-b border-zinc-50 last:border-0 ${marcado ? 'bg-[var(--negative-soft)]' : ''}`}
                >
                  {prioridade && (
                    <td className="py-1.5 pr-1 align-top">
                      {marcado && (
                        <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-[var(--negative-deep)] text-white text-3xs font-semibold tabular-nums">
                          {i + 1}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="py-1.5 pr-2 min-w-0 align-top">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge variant="neutro">{it.nat === 'desp' ? 'gasto' : 'receita'}</Badge>
                      <span className="text-2xs text-zinc-700 truncate">{it.c || '(sem categoria)'}</span>
                    </div>
                  </td>
                  <td className="py-1.5 pl-2 text-right align-top">
                    <ValorParen v={it.t25} />
                  </td>
                  <td className="py-1.5 pl-2 text-right align-top">
                    <ValorParen v={it.t26} />
                  </td>
                  <td className="py-1.5 pl-2 text-right align-top">
                    <ValorParen v={it.d} corClasse={corDelta} />
                  </td>
                  <td className="py-1.5 pl-2 text-right align-top">
                    {it.pct === null ? (
                      <span className="text-3xs text-zinc-400">sem base</span>
                    ) : (
                      <span className={`text-2xs font-medium tabular-nums ${corDelta}`}>
                        {it.pct >= 0 ? '+' : ''}{fmtAxisPct(it.pct, 1)}
                      </span>
                    )}
                  </td>
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
 * Formato contábil (modelo da controladoria): negativo entre parênteses + cor de alerta;
 * positivo normal (herda a cor do texto). `corClasse` FORÇA a cor (usado no Δ R$, que segue
 * o tom do card, não o sinal bruto do valor individual — embora aqui coincidam sempre, já
 * que o backend só traz delta<0 no card "Pioraram" e delta>0 no "Melhoraram").
 */
function ValorParen({ v, corClasse }: { v: number; corClasse?: string }) {
  const neg = v < 0
  const cor = corClasse ?? (neg ? 'text-[var(--negative-deep)]' : '')
  return (
    <span className={`text-2xs font-medium tabular-nums ${cor}`}>
      {neg ? `(${numBRL2(Math.abs(v))})` : numBRL2(v)}
    </span>
  )
}
