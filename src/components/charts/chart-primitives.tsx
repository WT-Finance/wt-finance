'use client'

/**
 * Primitivos de gráfico — WT Finance Design System (v4.8 / M4).
 *
 * Encapsulam o "tom discreto" da plataforma (grade tracejada sutil, linha do
 * zero forte, eixos sem axisLine, ticks abreviados). Consumidos pelos gráficos
 * e pelos drawers de M5/M6.
 *
 * IMPORTANTE — Recharts inspeciona a IDENTIDADE dos filhos diretos de um chart
 * (XAxis, YAxis, CartesianGrid, ReferenceLine). Por isso estes helpers são
 * FACTORIES (funções que retornam o elemento Recharts), e NÃO componentes
 * wrapper. Chame-os como função dentro do chart:
 *
 *   <ComposedChart ...>
 *     {ChartGrid()}
 *     {ChartXAxisMes('mes')}
 *     {ChartYAxisBRL()}
 *     {ChartZeroLine()}
 *     ...séries...
 *   </ComposedChart>
 *
 * A LEGENDA (ChartLegend) é um componente React normal, renderizado FORA do
 * ResponsiveContainer (abaixo do gráfico), como já era a prática na plataforma.
 */

import type { ReactElement } from 'react'
import { CartesianGrid, XAxis, YAxis, ReferenceLine } from 'recharts'
import type { AxisDomain } from 'recharts/types/util/types'
import { fmtAxisBRL, fmtAxisPct, fmtAxisMes } from '@/lib/fmt'
import {
  chartColors, dashArrays, strokeWidths, tickFontSize,
} from './chart-theme'

// ── Grade + linha do zero ─────────────────────────────────────────────────────

/**
 * Grade horizontal tracejada sutil ('3 4'), SEM linhas verticais.
 * Factory — chame `{ChartGrid()}` dentro do chart.
 */
export function ChartGrid(opts?: { eixo?: 'horizontal' | 'vertical' }): ReactElement {
  // 'horizontal' (default) = linhas horizontais, para coluna/linha com valor no Y.
  // 'vertical' = linhas verticais nos ticks do X, para barra HORIZONTAL (valor no X) —
  // ali as linhas horizontais só separariam categorias, sem função de leitura (v5.6.1).
  //
  // ⚠️ Na CASCATA (v5.8.1) a escolha se inverteu, e por um motivo de leitura: ali cada
  // categoria é um DEGRAU e as barras não começam todas no mesmo ponto, então a linha
  // horizontal atravessando cada barra é o que liga o rótulo à barra dele ao longo de
  // uma faixa larga. A régua de valor quem dá é a linha do zero (`ChartZeroLineX`).
  const vertical = opts?.eixo === 'vertical'
  return (
    <CartesianGrid
      strokeDasharray={dashArrays.grid}
      stroke={chartColors.grid}
      vertical={vertical}
      horizontal={!vertical}
    />
  )
}

/**
 * Linha do zero — sólida e mais forte que a grade.
 * Factory — chame `{ChartZeroLine()}` dentro do chart (após a grade).
 */
export function ChartZeroLine(): ReactElement {
  return (
    <ReferenceLine
      y={0}
      stroke={chartColors.zeroLine}
      strokeWidth={strokeWidths.zeroLine}
    />
  )
}

/**
 * Linha do zero para gráficos de barra HORIZONTAL (`layout="vertical"`), onde o eixo de
 * valor é o X — a irmã de `ChartZeroLine`, que ancora no Y.
 *
 * Existe porque `ChartZeroLine()` num layout vertical desenha a linha no eixo errado, em
 * silêncio: o Recharts aceita o `y={0}` (ali o Y é o eixo de CATEGORIAS), e o resultado é
 * uma régua atravessando a primeira categoria em vez do zero. Num gráfico cujas barras
 * cruzam o zero, essa linha é o que dá a referência de sinal.
 */
export function ChartZeroLineX(): ReactElement {
  return (
    <ReferenceLine
      x={0}
      stroke={chartColors.zeroLine}
      strokeWidth={strokeWidths.zeroLine}
    />
  )
}

/**
 * Linha de referência horizontal tracejada ('5 4') — ex.: meta de margem,
 * total previsto. SÓLIDO = real; TRACEJADO = referência (esta).
 */
export function ChartReferenceLineY(
  y: number,
  opts?: { color?: string; label?: string },
): ReactElement {
  const color = opts?.color ?? chartColors.axisTick
  return (
    <ReferenceLine
      y={y}
      stroke={color}
      strokeDasharray={dashArrays.reference}
      strokeWidth={strokeWidths.lineDashed}
      label={opts?.label
        ? { value: opts.label, position: 'insideTopRight', fontSize: 10, fill: color }
        : undefined}
    />
  )
}

// ── Eixos X ────────────────────────────────────────────────────────────────────

/**
 * Eixo X temporal (mês minúsculo 'jan/26'), tick discreto, sem tickLine.
 * @param dataKey chave do mês ('yyyy-MM') nos dados.
 * @param opts.interval intervalo de ticks (default 2 — mostra 1 a cada 3 meses).
 */
export function ChartXAxisMes(
  dataKey: string,
  opts?: { interval?: number | 'preserveStartEnd' },
): ReactElement {
  return (
    <XAxis
      dataKey={dataKey}
      tickFormatter={fmtAxisMes}
      tick={{ fontSize: tickFontSize.x, fill: chartColors.axisTick }}
      tickLine={false}
      axisLine={false}
      interval={opts?.interval ?? 2}
    />
  )
}

/**
 * Eixo X categórico genérico (labels já prontos nos dados), tick discreto.
 * `angle`/`height` (opcionais) inclinam o rótulo na diagonal (`textAnchor="end"`)
 * — útil quando há muitas categorias e o rótulo não cabe horizontal; `fontSize`
 * sobrepõe o tamanho padrão do tick (`tickFontSize.x`).
 */
export function ChartXAxisCategoria(
  dataKey: string,
  opts?: { interval?: number | 'preserveStartEnd'; angle?: number; fontSize?: number; height?: number },
): ReactElement {
  return (
    <XAxis
      dataKey={dataKey}
      tick={{ fontSize: opts?.fontSize ?? tickFontSize.x, fill: chartColors.axisTick }}
      tickLine={false}
      axisLine={false}
      interval={opts?.interval ?? 'preserveStartEnd'}
      angle={opts?.angle}
      textAnchor={opts?.angle !== undefined ? 'end' : undefined}
      height={opts?.height}
    />
  )
}

// ── Eixos Y ────────────────────────────────────────────────────────────────────

/**
 * Eixo Y monetário abreviado ('R$ 1,8 Mi'), sem axisLine/tickLine.
 * `abs` (default true) mostra o módulo — útil quando saídas vão para baixo.
 */
export function ChartYAxisBRL(
  opts?: { width?: number; abs?: boolean; domain?: [number, number]; ticks?: number[] },
): ReactElement {
  const abs = opts?.abs ?? true
  return (
    <YAxis
      tickFormatter={(v) => fmtAxisBRL(abs ? Math.abs(Number(v)) : Number(v))}
      tick={{ fontSize: tickFontSize.y, fill: chartColors.axisTick }}
      tickLine={false}
      axisLine={false}
      width={opts?.width ?? 72}
      // Aditivos (v5.2.0): domínio/ticks explícitos — p/ escala SIMÉTRICA com o zero
      // centralizado (ex.: Horizonte Previsto). undefined → default do recharts.
      domain={opts?.domain}
      ticks={opts?.ticks}
    />
  )
}

/** Eixo Y percentual ('14%'), sem axisLine/tickLine. */
export function ChartYAxisPct(
  opts?: { width?: number; casas?: number },
): ReactElement {
  return (
    <YAxis
      tickFormatter={(v) => fmtAxisPct(Number(v), opts?.casas ?? 0)}
      tick={{ fontSize: tickFontSize.y, fill: chartColors.axisTick }}
      tickLine={false}
      axisLine={false}
      width={opts?.width ?? 44}
      domain={['auto', 'auto']}
    />
  )
}

/**
 * Eixo Y categórico para barra HORIZONTAL (categoria no Y).
 * @param dataKey chave da categoria nos dados.
 */
export function ChartYAxisCategoria(
  dataKey: string,
  /** `negrito` dá peso ao nome da categoria — usado quando o rótulo é a âncora de
   *  leitura da linha inteira, e não uma legenda de apoio (caso da cascata: cada
   *  categoria é um degrau, e é pelo nome que se acha a barra dele). */
  opts?: { width?: number; negrito?: boolean },
): ReactElement {
  return (
    <YAxis
      type="category"
      dataKey={dataKey}
      tick={{
        fontSize: 12,
        fill: opts?.negrito ? 'var(--text-primary)' : chartColors.axisTick,
        fontWeight: opts?.negrito ? 600 : undefined,
      }}
      tickLine={false}
      axisLine={false}
      width={opts?.width ?? 80}
    />
  )
}

/**
 * Eixo X numérico para barra HORIZONTAL (valor no X), monetário abreviado.
 *
 * ⚠️ `domain` é OPCIONAL e existe por um motivo concreto: o domínio default de um eixo
 * numérico no Recharts é `[0, 'auto']` (`axisSelectors.js`), ou seja, ele **ancora em
 * zero e corta valores negativos**. Para as barras que só crescem para a direita (o
 * caso de todos os call-sites até a v5.8.1) isso é o comportamento desejado. Para uma
 * CASCATA, cujas âncoras cruzam o zero na vida real, é um gráfico silenciosamente
 * errado — barras negativas invisíveis, e nenhum gate vê. Quem precisa dos dois lados
 * passa `['dataMin', 'dataMax']` (ou um par de números).
 *
 * ⚠️ `ticks` anda junto com `domain` mais vezes do que parece: com domínio EXPLÍCITO o
 * Recharts deixa de aplicar o algoritmo de ticks "bonitos" e divide o intervalo cru,
 * produzindo marcas como `-471 k · 79 k · 629 k` — e, num gráfico simétrico, **sem o zero
 * entre elas**, que era o ponto de ser simétrico. Passar `ticks` explícitos é o que
 * devolve a régua legível.
 *
 * O default fica intocado de propósito: mudar o domínio de todos os gráficos existentes
 * para resolver o caso de um seria trocar um defeito por outro.
 */
export function ChartXAxisBRL(opts?: { domain?: AxisDomain; ticks?: number[] }): ReactElement {
  return (
    <XAxis
      type="number"
      domain={opts?.domain}
      ticks={opts?.ticks}
      tickFormatter={(v) => fmtAxisBRL(Number(v))}
      tick={{ fontSize: tickFontSize.x, fill: chartColors.axisTick }}
      tickLine={false}
      axisLine={false}
    />
  )
}
