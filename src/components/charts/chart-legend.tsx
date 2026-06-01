'use client'

/**
 * Legenda padronizada de gráficos — WT Finance Design System (v4.8 / M4).
 *
 * Substitui as legendas HTML manuais (FluxoLegend / AcumuladoLegend / LegendItem)
 * espalhadas pelos gráficos. Renderize FORA do ResponsiveContainer, abaixo do
 * gráfico (a `<Legend>` nativa do Recharts deve ficar oculta: `content={() => null}`).
 *
 * Marcadores:
 *   - 'rect'  bolinha quadrada arredondada (barras).
 *   - 'line'  segmento (linha de série). `dashed: true` → tracejado (projeção/ref).
 *   - 'dot'   bolinha redonda (ponto destacado, ex.: resultado negativo).
 *
 * Convenção: opacidade < 1 sinaliza "previsto/projetado"; `dashed` sinaliza
 * "referência (ano anterior) ou projeção (futuro)".
 */

export type ChartLegendMarker = 'rect' | 'line' | 'dot'

export interface ChartLegendItem {
  label:    string
  /** Cor do marcador (token CSS `var(--*)` ou string). */
  color:    string
  type?:    ChartLegendMarker
  /** Opacidade do marcador (0–1). < 1 = previsto/projetado. */
  opacity?: number
  /** Marcador tracejado (só para type='line'): referência/projeção. */
  dashed?:  boolean
}

interface Props {
  items: ChartLegendItem[]
  /** Alinhamento horizontal dos itens. Default 'center'. */
  align?: 'start' | 'center' | 'end'
  className?: string
}

export default function ChartLegend({ items, align = 'center', className }: Props) {
  const justify =
    align === 'start' ? 'justify-start' :
    align === 'end'   ? 'justify-end'   : 'justify-center'

  return (
    <div className={['flex flex-wrap gap-x-4 gap-y-1 mt-2', justify, className ?? ''].join(' ')}>
      {items.map((it, i) => (
        <span
          key={`${it.label}-${i}`}
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]"
        >
          <LegendMarker {...it} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

function LegendMarker({ type = 'rect', color, opacity = 1, dashed }: ChartLegendItem) {
  if (type === 'line') {
    return (
      <svg width="20" height="10" className="inline-block shrink-0" aria-hidden>
        <line
          x1="0" y1="5" x2="20" y2="5"
          stroke={color}
          strokeWidth={2}
          strokeOpacity={opacity}
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
    )
  }
  if (type === 'dot') {
    return (
      <svg width="10" height="10" className="inline-block shrink-0" aria-hidden>
        <circle cx="5" cy="5" r="4" fill={color} fillOpacity={opacity} />
      </svg>
    )
  }
  // rect
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm shrink-0"
      style={{ background: color, opacity }}
      aria-hidden
    />
  )
}
