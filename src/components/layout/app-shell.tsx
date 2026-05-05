'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import Sidebar from './sidebar'
import MobileHeader from './mobile-header'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen,    setMobileOpen]    = useState(false)
  const [sidebarOpen,   setSidebarOpen]   = useState(true)

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">
      {/* Desktop sidebar — animação de largura */}
      <div
        className={[
          'hidden lg:flex shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out',
          sidebarOpen ? 'w-64' : 'w-0',
        ].join(' ')}
      >
        <Sidebar
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          onCollapse={() => setSidebarOpen(false)}
        />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        {/* Botão reabrir sidebar (desktop, só quando fechada) */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="hidden lg:flex absolute left-0 top-4 z-10 items-center justify-center w-6 h-8 rounded-r-md bg-white border border-l-0 border-zinc-200 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm"
            aria-label="Abrir sidebar"
          >
            <ChevronRight size={14} />
          </button>
        )}

        <MobileHeader onOpen={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
