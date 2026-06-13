import type { ReactNode } from 'react'

interface CardProps {
  title?:     string
  subtitle?:  string
  children:   ReactNode
  className?: string
  featured?:  boolean
  size?:      'default' | 'sm'
}

export function Card({ title, subtitle, children, className, featured, size = 'default' }: CardProps) {
  const padding  = size === 'sm' ? 'px-3 py-3.5' : 'px-5 py-4'
  const radius   = size === 'sm' ? 'rounded-lg'  : 'rounded-xl'
  const border   = featured
    ? 'border-2 border-[var(--brand)]'
    : 'shadow-sm'

  return (
    <div
      className={[
        'bg-white',
        radius,
        border,
        padding,
        className ?? '',
      ].join(' ')}
    >
      {(title || subtitle) && (
        <div className="mb-4">
          {title    && <h2 className="text-base font-semibold text-[var(--text-primary)] leading-snug">{title}</h2>}
          {subtitle && <p  className="text-[13px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}
