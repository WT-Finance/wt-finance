/**
 * Barrel dos primitivos de gráfico — WT Finance Design System (v4.8 / M4).
 *
 * Ponto de importação único para gráficos e drawers (M5/M6):
 *   import {
 *     ChartGrid, ChartZeroLine, ChartXAxisMes, ChartYAxisBRL,
 *     ChartLegend, CustomTooltip, chartColors, fluxoColors, barRadius, fillMonths,
 *   } from '@/components/charts'
 */

export { default as CustomTooltip } from './custom-tooltip'
export { default as ChartLegend } from './chart-legend'
export type { ChartLegendItem, ChartLegendMarker } from './chart-legend'

export {
  ChartGrid,
  ChartZeroLine,
  ChartReferenceLineY,
  ChartXAxisMes,
  ChartXAxisCategoria,
  ChartXAxisBRL,
  ChartYAxisBRL,
  ChartYAxisPct,
  ChartYAxisCategoria,
} from './chart-primitives'

export {
  chartColors,
  chartSeries,
  fluxoColors,
  chartMargins,
  tickFontSize,
  dashArrays,
  strokeWidths,
  barRadius,
  barSizes,
  FUTURE_OPACITY,
} from './chart-theme'

export { fillMonths, listMonths } from './fill-months'
