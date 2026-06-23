'use client'

import type { ReactNode } from 'react'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'

// ── <Tabs> — navegação por abas do DS (v4.26 / Fase B) ────────────────────────
// Unifica o padrão "pill como tab" montado à mão (acessos-content, solicitacoes-
// content): tablist ARIA + pills, ativo = bege de plataforma (--action-soft, via
// PILL_PRIMARIA). Controlado (ativo/onChange); os painéis ficam por conta do
// chamador (use role="tabpanel" + aria-labelledby={`tab-${id}`} se quiser ARIA full).
// Cor neutra do Group (ADR-0103) — nunca var(--brand).

export interface TabItem {
  id:     string
  label:  ReactNode
  count?: ReactNode   // badge opcional ao lado do rótulo
}

interface TabsProps {
  items:      TabItem[]
  ativo:      string
  onChange:   (id: string) => void
  ariaLabel?: string
  className?: string
}

export default function Tabs({ items, ativo, onChange, ariaLabel, className = '' }: TabsProps) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={`flex flex-wrap gap-2 ${className}`}>
      {items.map(t => {
        const sel = t.id === ativo
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={sel}
            onClick={() => onChange(t.id)}
            className={`${PILL} whitespace-nowrap ${sel ? PILL_PRIMARIA : PILL_NEUTRO}`}
            style={sel ? PILL_PRIMARIA_STYLE : undefined}
          >
            {t.label}
            {t.count != null && t.count}
          </button>
        )
      })}
    </div>
  )
}
