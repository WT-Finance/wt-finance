'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, TrendingUp, Target, Upload, X, ChevronLeft, ChevronRight, Building, Plane, Sparkles, Briefcase, Wallet, BarChart3, Table2, Users, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Area } from '@/lib/auth/areas'
import VersionHistory from '@/components/layout/version-history'

/** Dados do usuário logado, repassados pelo AppShell para identidade + filtro de navegação. */
export interface UsuarioSidebar {
  nome: string | null
  email: string | null
  role: string | null
  permissoes: string[]
}

interface NavSubItem {
  href: string
  label: string
  icon: LucideIcon
  /** Área de permissão que libera o subitem. */
  area: Area
}

interface NavItem {
  href: string
  label: string
  Icon: LucideIcon
  /** Área que libera o item; null = grupo (visível se algum subitem for permitido). */
  area: Area | null
}

const PERFORMANCE_SUBS: NavSubItem[] = [
  { href: '/performance',             label: 'Geral',       icon: Building,  area: 'performance'             },
  { href: '/performance/trips',       label: 'Trips',       icon: Plane,     area: 'performance/trips'       },
  { href: '/performance/weddings',    label: 'Weddings',    icon: Sparkles,  area: 'performance/weddings'    },
  { href: '/performance/corporativo', label: 'Corporativo', icon: Briefcase, area: 'performance/corporativo' },
]

const FINANCEIRO_SUBS: NavSubItem[] = [
  { href: '/financeiro/fluxo-caixa',           label: 'Fluxo de Caixa', icon: BarChart3, area: 'financeiro/fluxo-caixa' },
  { href: '/financeiro/fluxo-caixa/gerencial', label: 'Gerencial',      icon: Table2,    area: 'financeiro/gerencial'   },
]

const NAV_ITEMS: NavItem[] = [
  { href: '/executiva',      label: 'Executiva',          Icon: LayoutDashboard, area: 'executiva'     },
  { href: '/performance',    label: 'Performance',        Icon: TrendingUp,      area: null            },
  { href: '/financeiro',     label: 'Financeiro',         Icon: Wallet,          area: null            },
  { href: '/metas',          label: 'Metas',              Icon: Target,          area: 'metas'         },
  { href: '/admin/uploads',  label: 'Upload de Arquivos', Icon: Upload,          area: 'admin/uploads' },
  { href: '/admin/acessos',  label: 'Usuários & Acessos', Icon: Users,           area: 'admin/acessos' },
]

interface SidebarContentProps {
  pathname:    string
  usuario:     UsuarioSidebar
  onNav?:      () => void
  onCollapse?: () => void
}

interface WelcomeGroupLogoProps {
  src: string
  alt: string
  /** Recolore o logo para a cor da aba (var(--brand)) via máscara CSS. */
  recolor?: boolean
}

function WelcomeGroupLogo({ src, alt, recolor }: WelcomeGroupLogoProps) {
  // Guarda o `src` que falhou ao carregar, em vez de um booleano. `imgError` é
  // DERIVADO (o src com erro é o atual?) — assim a troca de `src` "limpa" o erro
  // sem precisar de setState síncrono num effect de reset. Mesmo comportamento:
  // um novo logo ganha nova chance de carregar.
  const [erroredSrc, setErroredSrc] = useState<string | null>(null)
  const imgError = erroredSrc === src

  if (imgError) {
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center">
        <p className="text-[15px] font-[800] leading-tight uppercase tracking-[1px]" style={{ color: 'var(--brand)' }}>
          Welcome Group
        </p>
        <p className="text-[11px] font-medium tracking-[0.5px]" style={{ color: 'var(--text-muted)' }}>
          Finance Dashboard
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col items-center">
      <div className="relative h-10 w-full">
        {recolor ? (
          // Logo recolorido para a cor da aba: SVG como máscara + backgroundColor
          // var(--brand) (resolve via [data-theme] no <html>). Mesma técnica do
          // "powered by Claude" no modal de versões.
          <div
            role="img"
            aria-label={alt}
            className="absolute inset-0 scale-[0.9] origin-left"
            style={{
              backgroundColor: 'var(--brand)',
              WebkitMaskImage: `url(${src})`,
              maskImage: `url(${src})`,
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskPosition: 'left center',
              maskPosition: 'left center',
            }}
          />
        ) : (
          <Image
            src={src}
            alt={alt}
            fill
            priority
            className="object-contain object-left scale-[0.9] origin-left"
            onError={() => setErroredSrc(src)}
          />
        )}
      </div>
      <div className="flex items-baseline gap-1 mt-4">
        <span className="text-[14px] font-[800] uppercase tracking-[1px]" style={{ color: 'var(--brand)' }}>WT Finance</span>
        <VersionHistory />
      </div>
    </div>
  )
}

function SidebarContent({ pathname, usuario, onNav, onCollapse }: SidebarContentProps) {
  const isPerformanceActive = pathname.startsWith('/performance')
  const isFinanceiroActive  = pathname.startsWith('/financeiro')
  // Logo por aba: cada área de Performance tem a sua identidade; fora delas, o Welcome Group.
  const { logoSrc, logoAlt } =
    pathname.startsWith('/performance/weddings')    ? { logoSrc: '/logos/welcome-weddings.svg', logoAlt: 'Welcome Weddings' }    :
    pathname.startsWith('/performance/trips')       ? { logoSrc: '/logos/welcome-trips.svg',    logoAlt: 'Welcome Trips' }       :
    pathname.startsWith('/performance/corporativo') ? { logoSrc: '/logos/welcome-corp.svg',     logoAlt: 'Welcome Corporativo' } :
                                                      { logoSrc: '/logos/welcome-group.svg',    logoAlt: 'Welcome Group' }
  // Corp: logo recolorido para a cor principal da aba (#0D5257).
  const logoRecolor = pathname.startsWith('/performance/corporativo')
  // Inicialização preguiçosa a partir do localStorage (com guarda de window para
  // SSR — no server a função roda e cai no default `true`). Evita o setState
  // síncrono num useEffect de hidratação; mesmo default e mesma chave de antes.
  const [perfOpen, setPerfOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('sidebar-perf-open')
    return stored !== null ? stored === 'true' : true
  })
  const [financeiroOpen, setFinanceiroOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('sidebar-financeiro-open')
    return stored !== null ? stored === 'true' : true
  })

  const handlePerfToggle = () => {
    setPerfOpen(prev => {
      const next = !prev
      localStorage.setItem('sidebar-perf-open', String(next))
      return next
    })
  }

  const handleFinanceiroToggle = () => {
    setFinanceiroOpen(prev => {
      const next = !prev
      localStorage.setItem('sidebar-financeiro-open', String(next))
      return next
    })
  }

  // ── RBAC: navegação filtrada pelas permissões do usuário ──
  const pode = (area: Area) => usuario.permissoes.includes(area)

  const performanceSubs = PERFORMANCE_SUBS.filter(s => pode(s.area))
  const financeiroSubs  = FINANCEIRO_SUBS.filter(s => pode(s.area))

  const navItems = NAV_ITEMS.filter(item => {
    if (item.href === '/performance') return performanceSubs.length > 0
    if (item.href === '/financeiro')  return financeiroSubs.length > 0
    return item.area !== null && pode(item.area)
  })

  // Subitem ativo do Financeiro = o de prefixo MAIS específico (evita 'Fluxo de
  // Caixa' e 'Gerencial' acesos ao mesmo tempo, já que um é sub-rota do outro).
  const activeFinanceiroHref = financeiroSubs
    .filter(s => pathname === s.href || pathname.startsWith(s.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null

  const visibleSubs = perfOpen
    ? performanceSubs
    : isPerformanceActive
    ? performanceSubs.filter(s => pathname === s.href)
    : []

  const visibleFinanceiroSubs = financeiroOpen
    ? financeiroSubs
    : isFinanceiroActive
    ? financeiroSubs.filter(s => s.href === activeFinanceiroHref)
    : []

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}>
      {/* Header */}
      <div className="px-5 py-3 border-b relative flex items-center" style={{ borderColor: 'var(--sidebar-border)' }}>
        <WelcomeGroupLogo src={logoSrc} alt={logoAlt} recolor={logoRecolor} />
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
        {navItems.map(({ href, label, Icon }) => {
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
                      const subActive = pathname === sub.href
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={onNav}
                          className={[
                            'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                            subActive ? 'font-semibold' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100',
                          ].join(' ')}
                          style={subActive
                            ? { background: 'var(--brand-soft)', color: 'var(--brand)' }
                            : undefined}
                        >
                          <sub.icon
                            size={14}
                            strokeWidth={1.8}
                            style={subActive ? { color: 'var(--brand)' } : undefined}
                            className={subActive ? '' : 'text-zinc-400'}
                          />
                          {sub.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          const isFinanceiro = href === '/financeiro'
          if (isFinanceiro) {
            return (
              <div key={href}>
                <button
                  onClick={handleFinanceiroToggle}
                  className={[
                    'w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors relative',
                    isFinanceiroActive ? 'font-semibold' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100',
                  ].join(' ')}
                  style={isFinanceiroActive
                    ? { background: 'var(--brand-soft)', color: 'var(--brand)' }
                    : undefined}
                >
                  {isFinanceiroActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                      style={{ background: 'var(--brand)' }}
                    />
                  )}
                  <Icon
                    size={16}
                    style={isFinanceiroActive ? { color: 'var(--brand)' } : undefined}
                    className={isFinanceiroActive ? '' : 'text-zinc-400'}
                  />
                  <span className="flex-1 text-left">{label}</span>
                  <ChevronRight
                    size={14}
                    className={['transition-transform shrink-0', financeiroOpen ? 'rotate-90' : ''].join(' ')}
                    style={{ color: isFinanceiroActive ? 'var(--brand)' : undefined }}
                  />
                </button>

                {visibleFinanceiroSubs.length > 0 && (
                  <div className="mt-0.5 ml-4 pl-3 border-l border-zinc-200 space-y-0.5">
                    {visibleFinanceiroSubs.map(sub => {
                      const subActive = sub.href === activeFinanceiroHref
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={onNav}
                          className={[
                            'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                            subActive ? 'font-semibold' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100',
                          ].join(' ')}
                          style={subActive
                            ? { background: 'var(--brand-soft)', color: 'var(--brand)' }
                            : undefined}
                        >
                          <sub.icon
                            size={14}
                            strokeWidth={1.8}
                            style={subActive ? { color: 'var(--brand)' } : undefined}
                            className={subActive ? '' : 'text-zinc-400'}
                          />
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

      {/* Footer — identidade do usuário logado + sair */}
      <div className="h-14 px-4 border-t flex items-center gap-2" style={{ borderColor: 'var(--sidebar-border)' }}>
        <div className="flex-1 min-w-0" title={usuario.email ?? undefined}>
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {usuario.nome ?? usuario.email}
          </p>
          {usuario.role && (
            <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
              {usuario.role}
            </p>
          )}
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            aria-label="Sair"
            className="p-1.5 rounded text-zinc-400 hover:text-red-600 transition-colors"
          >
            <LogOut size={15} />
          </button>
        </form>
      </div>
    </div>
  )
}

interface SidebarProps {
  mobileOpen:    boolean
  onMobileClose: () => void
  usuario:       UsuarioSidebar
  onCollapse?:   () => void
}

export default function Sidebar({ mobileOpen, onMobileClose, usuario, onCollapse }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar — sempre visível em lg+ */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0">
        <SidebarContent pathname={pathname} usuario={usuario} onCollapse={onCollapse} />
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
            <SidebarContent pathname={pathname} usuario={usuario} onNav={onMobileClose} />
          </aside>
        </div>
      )}
    </>
  )
}
