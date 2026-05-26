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
      className="text-sm text-zinc-400 underline hover:text-zinc-600"
    >
      Ver preview →
    </a>
  )
}
