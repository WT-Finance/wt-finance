import type { ReactNode } from 'react'

interface Props {
  titulo: string
  subtitulo?: string
  children: ReactNode
}

export default function TopSection({ titulo, subtitulo, children }: Props) {
  return (
    <details open className="group mb-8">
      <summary
        className="relative flex items-center gap-3 px-6 py-4.5 mb-6 cursor-pointer list-none select-none transition-all hover:brightness-95"
        style={{ background: 'var(--brand-soft)' }}
      >
        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full" style={{ background: 'var(--brand)' }} />
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
        {subtitulo && (
          <span
            className="text-sm font-normal normal-case tracking-normal"
            style={{ color: 'var(--text-muted)' }}
          >
            {subtitulo}
          </span>
        )}
      </summary>
      {children}
    </details>
  )
}
