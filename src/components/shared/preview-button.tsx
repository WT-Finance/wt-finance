'use client'

import { usePathname, useSearchParams } from 'next/navigation'

export default function PreviewButton() {
  const pathname    = usePathname()
  const searchParams = useSearchParams()
  const params      = new URLSearchParams(searchParams.toString())
  params.set('preview', '1')
  return (
    <a
      href={`${pathname}?${params.toString()}`}
      className="px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap"
      style={{
        background:  'var(--brand-soft)',
        borderColor: 'var(--brand)',
        color:       'var(--brand-deep)',
      }}
    >
      Ver preview
    </a>
  )
}
