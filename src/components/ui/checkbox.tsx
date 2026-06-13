'use client'

import { Check } from 'lucide-react'

// v4.14.1 — Checkbox do design system, sem dependência nova (não há Radix no
// projeto). Input nativo visualmente substituído por um <span>; o foco neutro
// (anel institucional cinza) acompanha o input via peer-focus-visible.

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
  disabled?: boolean
  'aria-label'?: string
}

export default function Checkbox({ checked, onChange, id, disabled, 'aria-label': ariaLabel }: Props) {
  return (
    <label className={`relative inline-flex items-center justify-center ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        aria-label={ariaLabel}
      />
      <span
        className="grid h-4 w-4 place-items-center rounded-[4px] border border-zinc-300 bg-white transition
          peer-checked:[background:var(--action-primary)] peer-checked:border-[color:var(--action-primary)]
          peer-disabled:opacity-50
          peer-focus-visible:outline-none peer-focus-visible:border-[color:var(--text-secondary)]
          peer-focus-visible:shadow-[0_0_0_3px_var(--focus-ring)]"
        aria-hidden="true"
      >
        <Check size={12} className={`text-white transition ${checked ? 'opacity-100' : 'opacity-0'}`} />
      </span>
    </label>
  )
}
