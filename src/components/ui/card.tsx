import type { ReactNode } from 'react'

interface CardProps {
  title?:     string
  subtitle?:  string
  children:   ReactNode
  className?: string
}

export function Card({ title, subtitle, children, className }: CardProps) {
  return (
    <div
      className={[
        'bg-white rounded-[10px] border border-[--border] px-6 py-5',
        'shadow-[0_1px_3px_rgba(45,42,38,0.04)]',
        className ?? '',
      ].join(' ')}
    >
      {(title || subtitle) && (
        <div className="mb-4">
          {title    && <h2 className="text-base font-semibold text-[--text-primary] leading-snug">{title}</h2>}
          {subtitle && <p  className="text-[13px] text-[--text-muted] mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}
