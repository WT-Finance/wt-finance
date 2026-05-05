'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

const TABS = [
  { href: '/performance',             label: 'Todos'       },
  { href: '/performance/trips',       label: 'Trips'       },
  { href: '/performance/weddings',    label: 'Weddings'    },
  { href: '/performance/corporativo', label: 'Corporativo' },
]

export default function PerformanceSubTabs() {
  const pathname    = usePathname()
  const searchParams = useSearchParams()

  function buildHref(base: string) {
    const params = new URLSearchParams()
    const preset = searchParams.get('preset')
    const from   = searchParams.get('from')
    const to     = searchParams.get('to')
    if (preset) params.set('preset', preset)
    if (from)   params.set('from', from)
    if (to)     params.set('to', to)
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }

  return (
    <div className="max-w-7xl mx-auto px-6 pt-4">
      <div className="flex items-end gap-0 border-b border-zinc-200">
        {TABS.map(tab => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={buildHref(tab.href)}
              className={[
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-[color:var(--primary)] text-[color:var(--primary)] font-semibold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300',
              ].join(' ')}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
