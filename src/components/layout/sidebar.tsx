'use client'

import { useState, useEffect } from 'react'
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

function WelcomeGroupLogo() {
  // SVG oficial a ser inserido quando disponível
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[15px] font-[800] leading-tight uppercase tracking-[1px]" style={{ color: 'var(--brand)' }}>
        Welcome Group
      </p>
      <p className="text-[11px] font-medium tracking-[0.5px]" style={{ color: 'var(--text-muted)' }}>
        Finance Dashboard
      </p>
    </div>
  )
}

function SidebarContent({ pathname, onNav, onCollapse }: SidebarContentProps) {
  const isPerformanceActive = pathname.startsWith('/performance')
  const [perfOpen, setPerfOpen] = useState(true)

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-perf-open')
    if (stored !== null) setPerfOpen(stored === 'true')
  }, [])

  const handlePerfToggle = () => {
    setPerfOpen(prev => {
      const next = !prev
      localStorage.setItem('sidebar-perf-open', String(next))
      return next
    })
  }

  const visibleSubs = perfOpen
    ? PERFORMANCE_SUBS
    : isPerformanceActive
    ? PERFORMANCE_SUBS.filter(s => pathname === s.href)
    : []

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}>
      {/* Header */}
      <div className="px-5 py-4 border-b relative flex items-center" style={{ borderColor: 'var(--sidebar-border)' }}>
        <WelcomeGroupLogo />
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
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
                  onClick={handlePerfToggle}
                  className={[
                    'w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors relative',
                    isPerformanceActive ? 'font-semibold' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100',
                  ].join(' ')}
                  style={isPerformanceActive
                    ? { background: 'var(--brand-soft)', color: 'var(--brand)' }
                    : undefined}
                >
                  {isPerformanceActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                      style={{ background: 'var(--brand)' }}
                    />
                  )}
                  <Icon
                    size={16}
                    style={isPerformanceActive ? { color: 'var(--brand)' } : undefined}
                    className={isPerformanceActive ? '' : 'text-zinc-400'}
                  />
                  <span className="flex-1 text-left">{label}</span>
                  <ChevronRight
                    size={14}
                    className={['transition-transform shrink-0', perfOpen ? 'rotate-90' : ''].join(' ')}
                    style={{ color: isPerformanceActive ? 'var(--brand)' : undefined }}
                  />
                </button>

                {visibleSubs.length > 0 && (
                  <div className="mt-0.5 ml-4 pl-3 border-l border-zinc-200 space-y-0.5">
                    {visibleSubs.map(sub => {
                      const subActive = pathname === sub.href || pathname.startsWith(`${sub.href}/`)
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={onNav}
                          className={[
                            'block px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                            subActive ? 'font-semibold' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100',
                          ].join(' ')}
                          style={subActive
                            ? { background: 'var(--brand-soft)', color: 'var(--brand)' }
                            : undefined}
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
                active ? 'font-semibold' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100',
              ].join(' ')}
              style={active ? { background: 'var(--brand-soft)', color: 'var(--brand)' } : undefined}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                  style={{ background: 'var(--brand)' }}
                />
              )}
              <Icon
                size={16}
                style={active ? { color: 'var(--brand)' } : undefined}
                className={active ? '' : 'text-zinc-400'}
              />
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
