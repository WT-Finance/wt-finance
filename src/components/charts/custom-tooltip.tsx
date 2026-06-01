'use client'

import type { ReactNode } from 'react'
import type { TooltipPayload } from 'recharts/types/state/tooltipSlice'

interface Props {
  active?: boolean
  payload?: TooltipPayload
  label?: string | number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  labelFormatter?: (label: any, payload?: any) => ReactNode
  formatter?: (value: number, name: string) => [string, string]
  /**
   * Quando true, mostra uma bolinha com a cor da série antes do nome
   * (cor lida do payload do Recharts). Default false (compat. com uso atual).
   */
  showColorDot?: boolean
}

export default function CustomTooltip({ active, payload, label, labelFormatter, formatter, showColorDot }: Props) {
  if (!active || !payload?.length) return null

  const displayLabel: ReactNode = labelFormatter ? labelFormatter(label ?? '') : String(label ?? '')

  return (
    <div style={{
      background: 'var(--surface)',
      border: '0.5px solid var(--border)',
      borderRadius: 8,
      padding: '12px 16px',
      boxShadow: '0 4px 12px rgba(45,42,38,0.08)',
      minWidth: 140,
    }}>
      {displayLabel && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
          {displayLabel}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {payload.map((entry, i) => {
          const entryName  = String(entry.name  ?? '')
          const entryValue = Number(entry.value  ?? 0)
          const entryColor = (entry as { color?: string }).color
          const [formattedValue, formattedName] = formatter
            ? formatter(entryValue, entryName)
            : [String(entryValue), entryName]
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                {showColorDot && entryColor && (
                  <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                    background: entryColor, flexShrink: 0,
                  }} />
                )}
                {formattedName}
              </span>
              <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{formattedValue}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
