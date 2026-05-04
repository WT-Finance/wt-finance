'use client'

import { useState } from 'react'
import Sidebar from './sidebar'
import MobileHeader from './mobile-header'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <MobileHeader onOpen={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
