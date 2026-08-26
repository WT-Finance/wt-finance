'use client'

import { ResponsiveContainer, BarChart, Bar, Cell, LabelList, Tooltip } from 'recharts'
import {
  ChartGrid, ChartXAxisBRL, ChartYAxisCategoria, ChartZeroLineX, CustomTooltip,
  chartMargins, barSizes, fluxoColors,
} from '@/components/charts'
import { fmtBRL2, fmtMi } from '@/lib/fmt'
import type { Cascata } from '@/lib/dre/cascata'

// ── Cascata (waterfall) — primitivo de gráfico (v5.8.1) ───────────────────────
// Duas âncoras e os degraus que levam de uma à outra. Serve os DOIS cards novos da
// seção de competência (decomposição da variação e ponte entre regimes), que são a
// mesma figura com conteúdos diferentes.
//
// ── Por que HORIZONTAL ──────────────────────────────────────────────────────
// São até 18 barras com rótulos como "Rec./Desp. Não Operacionais". Em colunas, esses
// rótulos giram, truncam ou empilham — e os cards vivem num grid de 2 colunas, onde a
// largura já é curta. Deitado, cada rótulo ocupa uma linha inteira de texto legível e o
// eixo de valor fica contínuo. É também o layout em que o `LabelList` não quebra o
// texto na largura da barra (a armadilha registrada na skill `graficos`, v5.6.1).
//
// ── Como um waterfall se desenha sem hack de empilhamento ────────────────────
// O truque clássico — uma barra transparente embaixo da visível — QUEBRA com valores
// negativos: o Recharts empilha negativos para o outro lado, e as duas âncoras desta
// figura cruzam o zero na vida real (o resultado por competência está negativo no YTD e
// o de caixa, positivo). A barra de FAIXA (`dataKey` apontando para `[início, fim]`)
// não tem esse problema: cada degrau declara onde começa e onde termina, e o sinal sai
// de graça. Nenhuma soma acontece aqui — o acumulado vem pronto do módulo puro.
//
// ── Cor ─────────────────────────────────────────────────────────────────────
// Semântica de cash-flow (ADR-0103): melhora → `--positive`, piora → `--negative`, via
// `fluxoColors`. As âncoras são NEUTRAS de propósito: elas não são um movimento, são o
// ponto de partida e o de chegada — pintá-las de verde ou vermelho sugeriria que o
// resultado em si é "bom" ou "ruim", que é leitura do usuário, não do gráfico. O
// residual é neutro esmaecido: ele não é um fato econômico, é o que sobrou.

const COR_ANCORA = 'var(--text-secondary)'
const COR_RESIDUAL = 'var(--chart-neutral)'

interface Ponto {
  rotulo: string
  /** [início, fim] em REAIS — a barra vai de um ao outro. */
  faixa: [number, number]
  /** Reais, com sinal. Para a âncora é o próprio valor. */
  valor: number
  narrativa: string
  tipo: 'ancora' | 'degrau' | 'residual'
}

/** Altura em px para `n` barras — o card aplica como `minHeight` do wrapper. */
export function alturaCascata(qtdBarras: number): number {
  return Math.max(260, qtdBarras * 26 + 48)
}

/** Largura do eixo de rótulos, justa para o maior nome presente.
 *
 *  O teto é generoso (280px) porque os cards ocupam a LARGURA CHEIA da seção: rótulos
 *  como "Despesas Operacionais de RH Benefícios" cabem numa linha só. Quando os dois
 *  cards dividiam a largura em duas colunas, esses nomes quebravam em duas linhas e
 *  colidiam com o rótulo de valor da barra vizinha. */
function larguraEixoY(rotulos: string[]): number {
  const maior = rotulos.reduce((m, r) => Math.max(m, r.length), 0)
  return Math.min(Math.ceil(48 + maior * 6.4), 280)
}

/** Domínio SIMÉTRICO em torno do zero: a linha do zero fica no centro do gráfico e as
 *  barras crescem para os dois lados a partir dela (pedido do Yan na conferência).
 *
 *  Precisa ser calculado aqui, com os dados em mãos, e não pelas funções de `domain` do
 *  Recharts: cada uma delas recebe só o SEU extremo (`dataMin` ou `dataMax`), então
 *  nenhuma consegue enxergar o outro lado para espelhá-lo.
 *
 *  A folga de 8% é o espaço em que o rótulo de valor (`LabelList position="right"`) cabe
 *  sem encostar na borda. O `|| 1` cobre a cascata inteiramente zerada, que produziria o
 *  domínio degenerado `[0, 0]`. */
function dominioSimetrico(dados: Ponto[]): [number, number] {
  const extremo = dados.reduce(
    (m, d) => Math.max(m, Math.abs(d.faixa[0]), Math.abs(d.faixa[1])),
    0,
  ) || 1
  const M = extremo * 1.08
  return [-M, M]
}

function corDe(p: Ponto): string {
  if (p.tipo === 'ancora') return COR_ANCORA
  if (p.tipo === 'residual') return COR_RESIDUAL
  return p.valor >= 0 ? fluxoColors.entrada : fluxoColors.saida
}

/** Converte a cascata (centavos) na sequência de faixas acumuladas (reais). */
function pontos(c: Cascata): Ponto[] {
  const out: Ponto[] = [{
    rotulo: c.inicial.rotulo,
    faixa:  [0, c.inicial.valor / 100],
    valor:  c.inicial.valor / 100,
    narrativa: c.inicial.nota ?? '',
    tipo: 'ancora',
  }]

  let acumulado = c.inicial.valor
  for (const d of c.degraus) {
    const de = acumulado / 100
    acumulado += d.delta
    out.push({
      rotulo: d.rotulo,
      faixa:  [de, acumulado / 100],
      valor:  d.delta / 100,
      narrativa: d.narrativa,
      tipo: d.residual ? 'residual' : 'degrau',
    })
  }

  out.push({
    rotulo: c.final.rotulo,
    faixa:  [0, c.final.valor / 100],
    valor:  c.final.valor / 100,
    narrativa: c.final.nota ?? '',
    tipo: 'ancora',
  })

  return out
}

export default function GraficoCascata({ cascata }: { cascata: Cascata }) {
  const dados = pontos(cascata)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart layout="vertical" data={dados} margin={chartMargins.horizontal}>
        {ChartGrid({ eixo: 'vertical' })}
        {/* ⚠️ Domínio EXPLÍCITO e SIMÉTRICO. Explícito porque o default do Recharts para
            eixo numérico é `[0, 'auto']`: ele ancoraria em zero e as barras negativas —
            a âncora de competência e metade dos degraus — sumiriam. Simétrico porque a
            linha do zero fica no centro do gráfico, com melhora à direita e piora à
            esquerda. */}
        {ChartXAxisBRL({ domain: dominioSimetrico(dados) })}
        {ChartZeroLineX()}
        {ChartYAxisCategoria('rotulo', { width: larguraEixoY(dados.map(d => d.rotulo)) })}
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          content={(p) => {
            const item = p.payload?.[0]?.payload as Ponto | undefined
            return (
              <CustomTooltip
                {...p}
                labelFormatter={() => item?.rotulo ?? ''}
                // A narrativa é o que este card tem de mais útil: ela diz POR QUE o
                // degrau existe, e é gerada por regra no módulo puro.
                formatter={() => [
                  `${fmtBRL2(item?.valor ?? 0)}${item?.narrativa ? ` · ${item.narrativa}` : ''}`,
                  item?.tipo === 'ancora' ? 'Resultado' : 'Variação',
                ]}
              />
            )
          }}
        />
        {/* Sem arredondamento (decisão do Yan na conferência): numa cascata a barra é um
            SEGMENTO entre dois pontos do eixo, e a ponta redonda sugere um fim de valor
            que não existe — o degrau seguinte começa exatamente onde este termina. */}
        <Bar
          dataKey="faixa"
          radius={0}
          maxBarSize={barSizes.horizontal}
          isAnimationActive={false}
        >
          {dados.map((d, i) => <Cell key={i} fill={corDe(d)} />)}
          <LabelList
            dataKey="valor"
            position="right"
            formatter={(v: unknown) => (v == null ? '' : fmtMi(Number(v)))}
            style={{ fontSize: 11, fill: 'var(--chart-axis-tick)', fontVariantNumeric: 'tabular-nums' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
