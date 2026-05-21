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
}

export default function CustomTooltip({ active, payload, label, labelFormatter, formatter }: Props) {
  if (!active || !payload?.length) return null

  const displayLabel: ReactNode = labelFormatter ? labelFormatter(label ?? '') : String(label ?? '')

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
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
          const [formattedValue, formattedName] = formatter
            ? formatter(entryValue, entryName)
            : [String(entryValue), entryName]
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{formattedName}</span>
              <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{formattedValue}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
