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
import { fmtAxisBRL, fmtAxisPct, fmtAxisMes } from '@/lib/fmt'
import {
  chartColors, dashArrays, strokeWidths, tickFontSize,
} from './chart-theme'

// ── Grade + linha do zero ─────────────────────────────────────────────────────

/**
 * Grade horizontal tracejada sutil ('3 4'), SEM linhas verticais.
 * Factory — chame `{ChartGrid()}` dentro do chart.
 */
export function ChartGrid(): ReactElement {
  return (
    <CartesianGrid
      strokeDasharray={dashArrays.grid}
      stroke={chartColors.grid}
      vertical={false}
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
 */
export function ChartXAxisCategoria(
  dataKey: string,
  opts?: { interval?: number | 'preserveStartEnd' },
): ReactElement {
  return (
    <XAxis
      dataKey={dataKey}
      tick={{ fontSize: tickFontSize.x, fill: chartColors.axisTick }}
      tickLine={false}
      axisLine={false}
      interval={opts?.interval ?? 'preserveStartEnd'}
    />
  )
}

// ── Eixos Y ────────────────────────────────────────────────────────────────────

/**
 * Eixo Y monetário abreviado ('R$ 1,8 Mi'), sem axisLine/tickLine.
 * `abs` (default true) mostra o módulo — útil quando saídas vão para baixo.
 */
export function ChartYAxisBRL(
  opts?: { width?: number; abs?: boolean },
): ReactElement {
  const abs = opts?.abs ?? true
  return (
    <YAxis
      tickFormatter={(v) => fmtAxisBRL(abs ? Math.abs(Number(v)) : Number(v))}
      tick={{ fontSize: tickFontSize.y, fill: chartColors.axisTick }}
      tickLine={false}
      axisLine={false}
      width={opts?.width ?? 72}
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
  opts?: { width?: number },
): ReactElement {
  return (
    <YAxis
      type="category"
      dataKey={dataKey}
      tick={{ fontSize: 12, fill: chartColors.axisTick }}
      tickLine={false}
      axisLine={false}
      width={opts?.width ?? 80}
    />
  )
}

/** Eixo X numérico para barra HORIZONTAL (valor no X), monetário abreviado. */
export function ChartXAxisBRL(): ReactElement {
  return (
    <XAxis
      type="number"
      tickFormatter={(v) => fmtAxisBRL(Number(v))}
      tick={{ fontSize: tickFontSize.x, fill: chartColors.axisTick }}
      tickLine={false}
      axisLine={false}
    />
  )
}
