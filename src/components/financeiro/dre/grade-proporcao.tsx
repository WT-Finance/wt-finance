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
  'Os percentuais são negativos porque são despesa, como na coluna AV do demonstrativo, mas ' +
  'o eixo está invertido para a leitura ser direta: a linha SUBINDO significa que o grupo ' +
  'passou a consumir mais receita. Os sete gráficos usam a MESMA escala (a mesma altura em ' +
  'pontos percentuais), então as inclinações são comparáveis entre eles — um grupo estável ' +
  'aparece quase reto de propósito, e o número ao lado do nome dá a variação exata. O ano ' +
  'corrente conta só os meses já cobertos pela base.'

/** Altura de cada mini-gráfico. ⚠️ Vai como `height` no wrapper, NUNCA `min-height`: o
 *  `ResponsiveContainer` é um filho com `height: 100%`, e em CSS um percentual de altura
 *  resolve contra a `height` do pai — com `min-height` o filho mede 0 e o gráfico some
 *  sem erro nenhum (medido na v5.8.1). */
const ALTURA = 150

/** Δ em pontos percentuais, sempre com sinal explícito — `+1,7 p.p.` / `−1,8 p.p.`.
 *  O sinal é a informação principal aqui, então ele nunca fica implícito. */
function fmtDeltaPp(v: number): string {
  const s = v < 0 ? '−' : '+'
  return `${s}${Math.abs(v).toFixed(1)} p.p.`
}

/** Cor por SIGNIFICADO, não por sinal aritmético: estas séries são despesas, então um Δ
 *  positivo (menos negativo) quer dizer que o grupo passou a consumir MENOS receita — é
 *  melhora. Zero e ausência ficam neutros: "não mudou" não é boa nem má notícia.
 *
 *  ⚠️ `--success`/`--danger`, e não os `-deep` que o resto da DRE usa (conferência do
 *  Yan, que apontou os cards de KPI como referência — ver `shared/kpi-coluna.tsx`, que
 *  usa este mesmo par). Os `-deep` existem para contrastar sobre a BANDA CLARA da tabela,
 *  onde os tons base reprovam AA; num número pequeno sobre o BRANCO do card, eles leem
 *  como cinza e marrom em vez de verde e vermelho — e aqui a cor é metade da informação.
 *
 *  Sem SETA, ao contrário da referência: lá a métrica é receita, e ↑ quer dizer "subiu, é
 *  bom". Aqui a série é despesa com sinal algébrico — um Δ positivo significa que a
 *  proporção subiu (de −5,1% para −3,3%) E que a despesa passou a pesar MENOS. A seta
 *  teria de escolher entre apontar a direção do número e a do significado, e qualquer
 *  escolha contradiz a outra metade. O sinal `+`/`−` com a cor diz as duas coisas sem
 *  ambiguidade. */
function corDelta(v: number | null): string {
  if (v === null || v === 0) return 'text-text-subtle'
  return v > 0 ? 'text-success' : 'text-danger'
}

/** Um Δ rotulado. O rótulo vem em peso normal e cor esmaecida, o número em peso forte —
 *  quem varre a grade lê os números; o rótulo é só para saber qual é qual na primeira vez. */
function Delta({ rotulo, valor, titulo }: { rotulo: string; valor: number | null; titulo: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap" title={titulo}>
      <span className="font-normal text-text-subtle">{rotulo}</span>
      <span className={`font-semibold ${corDelta(valor)}`}>
        {valor === null ? '—' : fmtDeltaPp(valor)}
      </span>
    </span>
  )
}

function MiniGrafico({ serie }: { serie: SerieProporcao }) {
  // Ponto sem base válida não é plotado (o Recharts corta a linha em `null`), e nunca
  // vira zero — zero diria "não consumiu nada", que é outra afirmação.
  const comAv = serie.pontos.filter(p => p.av !== null)
  const primeiroAno = comAv[0]?.ano
  const ultimoAno = comAv.at(-1)?.ano
  const penultimoAno = comAv.at(-2)?.ano

  const dados = serie.pontos.map(p => ({
    rotulo: p.parcial ? `${p.ano}*` : String(p.ano),
    av: p.av,
    mesesCobertos: p.mesesCobertos,
    parcial: p.parcial,
  }))

  return (
    <div className="rounded-lg border border-wt-border bg-surface p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="truncate text-[11px] font-semibold text-text-primary" title={serie.rotulo}>
          {serie.rotulo}
        </p>
        {/* Os DOIS Δ são o contrapeso da escala comum: com todos os eixos na mesma
            altura, um grupo estável vira quase uma reta — verdade sobre ele, mas que
            esconde a magnitude exata. Os números devolvem a precisão sem depender do olho.
            E são dois porque contam coisas diferentes: uma tendência de três anos pode
            esconder uma virada no último ano, e um salto recente some numa média longa.
            Sinal: positivo = passou a consumir MENOS receita (melhora). */}
        <span className="flex shrink-0 items-baseline gap-2.5 text-[11px] tabular-nums">
          <Delta rotulo="Δ Total" valor={serie.deltaPp} titulo={`De ${primeiroAno} a ${ultimoAno}, em pontos percentuais da Receita Bruta`} />
          <Delta rotulo="Δ YoY" valor={serie.deltaYoY} titulo={`De ${penultimoAno} a ${ultimoAno}, em pontos percentuais da Receita Bruta`} />
        </span>
      </div>
      <div style={{ height: ALTURA }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={chartMargins.default}>
            {ChartGrid()}
            {/* ⚠️ `interval: 0` — o default do primitivo é `preserveStartEnd`, que com
                TRÊS pontos esconderia justamente o do meio. Numa série de 3 anos, o ano
                central é metade da tendência. */}
            {ChartXAxisCategoria('rotulo', { interval: 0 })}
            {/* ⚠️ EIXO INVERTIDO (conferência do Yan). Estas séries são sempre negativas
                — são despesas sobre a receita —, e com o eixo normal um grupo que passa a
                pesar MAIS desenha a curva DESCENDO, que é o contrário do que o olho lê.
                Invertido, "pesa mais" volta a ser "mais alto", e o rótulo continua
                dizendo −5,2%, como a coluna AV do demonstrativo. */}
            {ChartYAxisPct({
              casas: 1,
              invertido: true,
              /* ⚠️ Domínio COMUM às sete séries (`proporcao-grupos.ts`). Sem ele cada
                 gráfico esticava a própria série até preencher o card, e RH (10,2 p.p. de
                 amplitude) desenhava a mesma inclinação que Comerciais (0,36 p.p.) — uma
                 razão de 28× sumia da tela. `ticks` anda junto: com domínio explícito o
                 Recharts divide o intervalo cru e produz marcas quebradas. */
              domain: serie.dominio,
              ticks: serie.ticks,
            })}
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
}

export default function GradeProporcao({ series }: Props) {
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
        <p className="text-[11px] text-text-secondary">Por regime de competência</p>
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
