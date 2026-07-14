'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import Sidebar, { type UsuarioSidebar } from './sidebar'
import MobileHeader from './mobile-header'

interface AppShellProps {
  usuario:  UsuarioSidebar
  children: React.ReactNode
}

// Rota do Modo TV (v5.1.0): a pele /metas/tv ocupa a tela inteira, SEM sidebar/header.
// Como o AppShell é montado no layout raiz (não há route group para o chrome), o jeito
// mínimo e não-invasivo de "não ter AppShell" nessa rota é este curto-circuito por
// pathname — sem tocar o proxy/auth nem a Sidebar. (ADR-0148.)
const ROTA_SEM_CHROME = '/metas/tv'

export default function AppShell({ usuario, children }: AppShellProps) {
  const pathname = usePathname()
  const [mobileOpen,    setMobileOpen]    = useState(false)
  const [sidebarOpen,   setSidebarOpen]   = useState(true)

  if (pathname === ROTA_SEM_CHROME) return <>{children}</>

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
          usuario={usuario}
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
        {/* Respiro das páginas — FONTE ÚNICA aqui (v4.16.1 vertical; v5.1.1 horizontal):
            o ritmo topo/base (py-8) E o respiro conteúdo↔sidebar (px-8) vivem no <main>.
            Páginas NÃO definem py NEM px/max-w/mx-auto no container raiz — usam a LARGURA
            TOTAL do <main> já com o respiro do px-8. Ajustar o gap lateral = mudar só aqui.
            scrollbar-gutter:stable (v4.23.2): reserva a goteira da barra de rolagem SEMPRE,
            para a largura do conteúdo NÃO mudar quando a barra some/aparece
            ao recolher/expandir uma seção (TopSection) ou trocar de página. */}
        <main className="flex-1 overflow-auto px-8 py-8 [scrollbar-gutter:stable]">
          {children}
        </main>
      </div>
    </div>
  )
}
