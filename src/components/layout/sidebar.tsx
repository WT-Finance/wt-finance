'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, TrendingUp, Target, Upload, X, ChevronLeft, ChevronRight } from 'lucide-react'

const PERFORMANCE_SUBS = [
  { href: '/performance',             label: 'Geral'       },
  { href: '/performance/trips',       label: 'Trips'       },
  { href: '/performance/weddings',    label: 'Weddings'    },
  { href: '/performance/corporativo', label: 'Corporativo' },
]

const NAV_ITEMS = [
  { href: '/executiva',      label: 'Executiva',   Icon: LayoutDashboard },
  { href: '/performance',    label: 'Performance', Icon: TrendingUp       },
  { href: '/metas',          label: 'Metas',       Icon: Target           },
  { href: '/admin/uploads',  label: 'Upload de Arquivos', Icon: Upload },
]

interface SidebarContentProps {
  pathname:    string
  onNav?:      () => void
  onCollapse?: () => void
}

function SidebarContent({ pathname, onNav, onCollapse }: SidebarContentProps) {
  const isPerformanceActive = pathname.startsWith('/performance')
  const [perfOpen, setPerfOpen] = useState(isPerformanceActive)
  const showPerfSubs = isPerformanceActive || perfOpen

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}>
      {/* Header */}
      <div className="px-5 py-5 border-b relative" style={{ borderColor: 'var(--sidebar-border)' }}>
        <p className="text-[18px] font-semibold text-zinc-900 leading-tight">WT Finance</p>
        <p className="text-[13px] text-zinc-400 mt-0.5">Welcome Group</p>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            aria-label="Recolher sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          const isPerformance = href === '/performance'

          if (isPerformance) {
            return (
              <div key={href}>
                <button
                  onClick={() => setPerfOpen(o => !o)}
                  className={[
                    'w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors relative',
                    isPerformanceActive
                      ? 'text-blue-600 font-semibold'
                      : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100',
                  ].join(' ')}
                  style={isPerformanceActive ? { background: 'var(--primary-bg)' } : undefined}
                >
                  {isPerformanceActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                      style={{ background: 'var(--primary)' }}
                    />
                  )}
                  <Icon size={16} className={isPerformanceActive ? 'text-blue-600' : 'text-zinc-400'} />
                  <span className="flex-1 text-left">{label}</span>
                  <ChevronRight
                    size={14}
                    className={[
                      'transition-transform shrink-0',
                      isPerformanceActive ? 'text-blue-400' : 'text-zinc-300',
                      showPerfSubs ? 'rotate-90' : '',
                    ].join(' ')}
                  />
                </button>

                {showPerfSubs && (
                  <div className="mt-0.5 ml-4 pl-3 border-l border-zinc-200 space-y-0.5">
                    {PERFORMANCE_SUBS.map(sub => {
                      const subActive = pathname === sub.href
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={onNav}
                          className={[
                            'block px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                            subActive
                              ? 'text-blue-600 font-semibold'
                              : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100',
                          ].join(' ')}
                          style={subActive ? { background: 'var(--primary-bg)' } : undefined}
                        >
                          {sub.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={href}
              href={href}
              onClick={onNav}
              className={[
                'flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors relative',
                active
                  ? 'text-blue-600 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100',
              ].join(' ')}
              style={active ? { background: 'var(--primary-bg)' } : undefined}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                  style={{ background: 'var(--primary)' }}
                />
              )}
              <Icon size={16} className={active ? 'text-blue-600' : 'text-zinc-400'} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer — reservado para v4 (avatar, logout) */}
      <div className="h-14 px-3 border-t" style={{ borderColor: 'var(--sidebar-border)' }} />
    </div>
  )
}

interface SidebarProps {
  mobileOpen:    boolean
  onMobileClose: () => void
  onCollapse?:   () => void
}

export default function Sidebar({ mobileOpen, onMobileClose, onCollapse }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar — sempre visível em lg+ */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0">
        <SidebarContent pathname={pathname} onCollapse={onCollapse} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={onMobileClose} />
          <aside className="relative flex flex-col w-64 h-full">
            <button
              onClick={onMobileClose}
              className="absolute top-4 right-4 z-10 p-1 rounded text-zinc-400 hover:text-zinc-700"
              aria-label="Fechar menu"
            >
              <X size={18} />
            </button>
            <SidebarContent pathname={pathname} onNav={onMobileClose} />
          </aside>
        </div>
      )}
    </>
  )
}
