'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, TrendingUp, Target, X } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/executiva',   label: 'Executiva',   Icon: LayoutDashboard },
  { href: '/performance', label: 'Performance', Icon: TrendingUp       },
  { href: '/metas',       label: 'Metas',       Icon: Target           },
]

interface SidebarContentProps {
  pathname: string
  onNav?: () => void
}

function SidebarContent({ pathname, onNav }: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}>
      {/* Header */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
        <p className="text-[18px] font-semibold text-zinc-900 leading-tight">WT Finance</p>
        <p className="text-[13px] text-zinc-400 mt-0.5">Welcome Group</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
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
  mobileOpen: boolean
  onMobileClose: () => void
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar — sempre visível em lg+ */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/50"
            onClick={onMobileClose}
          />
          {/* Drawer panel */}
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
