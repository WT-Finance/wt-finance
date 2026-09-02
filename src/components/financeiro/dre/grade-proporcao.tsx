'use client'

import { ResponsiveContainer, LineChart, Line, Tooltip } from 'recharts'
import Tooltipzinho from '@/components/ui/tooltip'
import {
  ChartGrid, ChartXAxisCategoria, ChartYAxisPct, CustomTooltip,
  chartMargins, strokeWidths,
} from '@/components/charts'
import { fmtAv } from '@/lib/dre/av'
import type { SerieProporcao } from '@/lib/dre/proporcao-grupos'

// ── Grade de proporção sobre a Receita Bruta (v5.9.2) ─────────────────────────
// Sete mini-gráficos de linha: quanto cada grupo consumiu da Receita Bruta, ano a ano.
// A página mostrava valores e a AV de UM recorte; faltava a TENDÊNCIA da estrutura de
// custo — que RH saiu de 32,1% para 38,9% da receita em dois anos não aparecia em lugar
// nenhum, porque o valor absoluto dele cresceu junto com o faturamento.
//
// ── Layout ──────────────────────────────────────────────────────────────────
// `CUSTO` ISOLADO na primeira linha, em largura cheia (decisão do Yan); as seis despesas
// num grid 2×3 abaixo. O custo dos serviços é custo DIRETO do que se vendeu — natureza
// diferente das despesas de estrutura que vêm depois, e a separação visual diz isso sem
// precisar de texto.
//
// ── O sinal ─────────────────────────────────────────────────────────────────
// A AV de despesa é NEGATIVA, como na coluna AV do demonstrativo. Consequência que vale
// avisar no "?": a linha DESCE quando o grupo passa a consumir mais receita. Mostrar o
// módulo deixaria a linha mais intuitiva, mas faria a mesma grandeza aparecer de dois
// jeitos na mesma página — o defeito que a v5.7.2 corrigiu ao unificar a base da AV.

const AJUDA =
  'Quanto cada grupo consumiu da Receita Bruta em cada ano, no regime de competência. ' +
  'Serve para ver se um grupo cresceu MAIS RÁPIDO que a receita: o valor absoluto sobe ' +
  'junto com o faturamento, mas a proporção só sobe se o grupo pesar mais. ' +
  'Os percentuais são negativos porque são despesa, como na coluna AV do demonstrativo — ' +
  'então a linha DESCENDO significa que o grupo passou a pesar mais. O ano corrente conta ' +
  'só os meses já cobertos pela base.'

/** Altura de cada mini-gráfico. ⚠️ Vai como `height` no wrapper, NUNCA `min-height`: o
 *  `ResponsiveContainer` é um filho com `height: 100%`, e em CSS um percentual de altura
 *  resolve contra a `height` do pai — com `min-height` o filho mede 0 e o gráfico some
 *  sem erro nenhum (medido na v5.8.1). */
const ALTURA = 150

function MiniGrafico({ serie }: { serie: SerieProporcao }) {
  // Ponto sem base válida não é plotado (o Recharts corta a linha em `null`), e nunca
  // vira zero — zero diria "não consumiu nada", que é outra afirmação.
  const dados = serie.pontos.map(p => ({
    rotulo: p.parcial ? `${p.ano}*` : String(p.ano),
    av: p.av,
    mesesCobertos: p.mesesCobertos,
    parcial: p.parcial,
  }))

  return (
    <div className="rounded-lg border border-wt-border bg-surface p-3">
      <p className="mb-1 truncate text-[11px] font-semibold text-text-primary" title={serie.rotulo}>
        {serie.rotulo}
      </p>
      <div style={{ height: ALTURA }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={chartMargins.default}>
            {ChartGrid()}
            {/* ⚠️ `interval: 0` — o default do primitivo é `preserveStartEnd`, que com
                TRÊS pontos esconderia justamente o do meio. Numa série de 3 anos, o ano
                central é metade da tendência. */}
            {ChartXAxisCategoria('rotulo', { interval: 0 })}
            {ChartYAxisPct({ casas: 1 })}
            <Tooltip
              cursor={{ stroke: 'var(--chart-grid)' }}
              content={(p) => {
                const item = p.payload?.[0]?.payload as { parcial?: boolean; mesesCobertos?: number } | undefined
                return (
                  <CustomTooltip
                    {...p}
                    labelFormatter={(l) =>
                      item?.parcial ? `${String(l).replace('*', '')} · ${item.mesesCobertos} meses` : String(l)
                    }
                    formatter={(v) => [fmtAv(Number(v)), 'da Receita Bruta']}
                  />
                )
              }}
            />
            {/* Série principal única → `--brand` (skill `graficos`, ADR-0103). `connectNulls`
                fica FALSO de propósito: um ano sem base é uma lacuna real, e ligá-lo aos
                vizinhos desenharia uma tendência que não foi medida. */}
            <Line
              type="monotone"
              dataKey="av"
              stroke="var(--brand)"
              strokeWidth={strokeWidths.line}
              dot={{ r: 3, fill: 'var(--brand)' }}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

interface Props {
  series: SerieProporcao[]
  /** Rótulo da janela do ano corrente, para o subtítulo (ex.: "jan–ago"). */
  janela: string
  anoParcial: number | null
}

export default function GradeProporcao({ series, janela, anoParcial }: Props) {
  if (series.length === 0) return null

  // `CUSTO` é o primeiro da lista por construção (ver `GRUPOS_PROPORCAO`).
  const [custo, ...despesas] = series

  return (
    <div className="rounded-xl bg-surface p-5 shadow-sm">
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-1.5">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Proporção sobre a Receita Bruta
          </h2>
          {/* `<button type="button">`, nunca `<span>`: o balão abre no FOCO e um `span`
              fica fora do tab-order (skill ui-design-system §2). */}
          <Tooltipzinho conteudo={AJUDA} className="z-30 w-72 !whitespace-normal font-normal normal-case tracking-normal leading-snug">
            <button
              type="button"
              aria-label={`Proporção sobre a Receita Bruta: ${AJUDA}`}
              className="foco-neutro inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400"
            >
              ?
            </button>
          </Tooltipzinho>
        </div>
        <p className="text-[11px] text-text-secondary">
          Competência · ano a ano
          {anoParcial !== null && janela !== '' && ` · ${anoParcial}* = ${janela}`}
        </p>
      </div>

      <div className="space-y-3">
        <MiniGrafico serie={custo} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {despesas.map(s => <MiniGrafico key={s.chave} serie={s} />)}
        </div>
      </div>
    </div>
  )
}
