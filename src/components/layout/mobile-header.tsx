'use client'

import { Menu } from 'lucide-react'

interface Props {
  onOpen: () => void
}

export default function MobileHeader({ onOpen }: Props) {
  return (
    <header
      className="lg:hidden flex items-center gap-3 px-4 h-12 border-b shrink-0"
      style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}
    >
      <button
        onClick={onOpen}
        className="p-1.5 rounded text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors"
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>
      <span className="text-sm font-semibold text-zinc-900">WT Finance</span>
    </header>
  )
}
