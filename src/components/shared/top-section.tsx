import type { ReactNode } from 'react'

interface Props {
  titulo: string
  children: ReactNode
}

export default function TopSection({ titulo, children }: Props) {
  return (
    <details open className="group mb-8">
      <summary className="flex items-center gap-3 px-6 py-[18px] mb-6 cursor-pointer list-none select-none border-l-4 border-[--brand] bg-[--brand-soft] hover:brightness-95 transition-all">
        <svg
          className="w-5 h-5 shrink-0 transition-transform group-open:rotate-90"
          style={{ color: 'var(--brand-deep)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span
          className="uppercase tracking-[1.5px]"
          style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand-deep)' }}
        >
          {titulo}
        </span>
      </summary>
      {children}
    </details>
  )
}
