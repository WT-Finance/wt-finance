'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/executiva',   label: 'Executiva'   },
  { href: '/performance', label: 'Performance' },
  { href: '/metas',       label: 'Metas'       },
]

export default function LayoutHeader() {
  const pathname = usePathname()

  return (
    <header className="bg-white border-b border-zinc-200">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="flex items-center gap-8 h-14">
          <span className="text-base font-semibold text-zinc-900 tracking-tight shrink-0">
            WT Finance
          </span>
          <nav className="flex items-end h-full gap-1">
            {TABS.map(tab => {
              const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={[
                    'px-3 pb-0 pt-1 h-full flex items-center text-sm font-medium border-b-2 transition-colors',
                    active
                      ? 'border-zinc-900 text-zinc-900'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300',
                  ].join(' ')}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
    </header>
  )
}
