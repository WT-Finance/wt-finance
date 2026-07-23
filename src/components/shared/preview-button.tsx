'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { PREVIEW_TOKEN } from './preview-session-guard'

export default function PreviewButton() {
  const pathname    = usePathname()
  const searchParams = useSearchParams()
  const params      = new URLSearchParams(searchParams.toString())
  params.set('preview', '1')
  return (
    <a
      href={`${pathname}?${params.toString()}`}
      // Marca que o preview foi acionado NESTA sessão — sem isso, o guard derruba o
      // `?preview=1` (URL restaurada/bookmark de outra sessão) e o aviso volta.
      onClick={() => { try { sessionStorage.setItem(PREVIEW_TOKEN, '1') } catch { /* modo privado/SSR */ } }}
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
