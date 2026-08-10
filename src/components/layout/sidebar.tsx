'use client'

import { useState, useRef, useEffect, useCallback, use, Suspense, type PointerEvent as ReactPointerEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, TrendingUp, Target, Upload, X, ChevronLeft, Building, Plane, Sparkles, Briefcase, Wallet, BarChart3, Table2, Calculator, Receipt, Library, Users, IdCard, Boxes, Palette, Inbox, LogOut, LineChart, ClipboardList, TriangleAlert, FileSpreadsheet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Area } from '@/lib/auth/areas'
import VersionHistory from '@/components/layout/version-history'
import Badge from '@/components/ui/badge'
import NavGroup, { type NavSubItem } from '@/components/layout/nav-group'
import { thumbGeom, scrollAoArrastar, THUMB_FOLGA } from '@/lib/ui/scrollbar-math'

/** Dados do usuário logado, repassados pelo AppShell para identidade + filtro de navegação. */
export interface UsuarioSidebar {
  nome: string | null
  email: string | null
  role: string | null
  permissoes: string[]
  /** Nº de solicitações abertas atribuídas a mim/minha role (badge). v4.16.0.
   *  v4.39.0 (M3): PROMISE (não número) — resolvida fora do caminho bloqueante do layout e
   *  consumida via Suspense + `use` no badge. `.catch(()=>null)` no layout → falha inofensiva. */
  pendenciasPromise?: Promise<number | null>
}

// Badge de pendências (v4.39.0/M3): consome a promise com `use` dentro de um Suspense (fallback
// nulo = sem badge enquanto carrega). Módulo-nível (nunca componente no render). Sem promise ou
// valor ≤ 0 → não renderiza nada. Falha já vira null no layout (.catch) → o `use` nunca lança.
function BadgePendencias({ promise }: { promise?: Promise<number | null> }) {
  if (!promise) return null
  return (
    <Suspense fallback={null}>
      <ContagemPendencias promise={promise} />
    </Suspense>
  )
}
function ContagemPendencias({ promise }: { promise: Promise<number | null> }) {
  const n = use(promise)
  if (!n || n <= 0) return null
  return <Badge variant="count" className="ml-auto">{n}</Badge>
}

interface NavItem {
  href: string
  label: string
  Icon: LucideIcon
  /** Área que libera o item; null = grupo (visível se algum subitem for permitido). */
  area: Area | null
  /** Sempre visível para qualquer autenticado (não gated por área). v4.16.0. */
  sempre?: boolean
  /** Visível se o usuário tiver QUALQUER uma destas áreas (OR). v4.20.0. */
  areasAny?: Area[]
  /** Rota atrás do gate "em construção" (preview) → ícone triangular de alerta à direita. v5.1.9. */
  emConstrucao?: boolean
}

const PERFORMANCE_SUBS: NavSubItem[] = [
  { href: '/performance',             label: 'Geral',       icon: Building,  area: 'performance', emConstrucao: true },
  { href: '/performance/trips',       label: 'Trips',       icon: Plane,     area: 'performance/trips'       },
  { href: '/performance/weddings',    label: 'Weddings',    icon: Sparkles,  area: 'performance/weddings'    },
  { href: '/performance/corporativo', label: 'Corporativo', icon: Briefcase, area: 'performance/corporativo' },
]

const FINANCEIRO_SUBS: NavSubItem[] = [
  { href: '/financeiro/acervo',                label: 'Acervo de Documentos', icon: Library, area: 'financeiro/acervo', areasAny: ['financeiro/acervo', 'financeiro/acervo/gestao'] },
  { href: '/financeiro/dre',                   label: 'Demonstrativo de Resultado', icon: FileSpreadsheet, area: 'financeiro/dre' },
  { href: '/financeiro/fluxo-caixa',           label: 'Fluxo de Caixa',       icon: BarChart3,  area: 'financeiro/fluxo-caixa' },
  { href: '/financeiro/fluxo-caixa/gerencial', label: 'Gerencial',            icon: Table2,     area: 'financeiro/gerencial'   },
  { href: '/financeiro/calculadora-rateio',    label: 'Calculadora de Rateio', icon: Calculator, area: 'financeiro/gerencial'  },
  { href: '/financeiro/faturamento-corp',      label: 'Faturamento Corporativo', icon: Receipt,  area: 'financeiro/faturamento-corp' },
]

// Metas em DOIS níveis (v5.0.0), mesmo padrão de solicitacoes/acervo: 'metas' (edição,
// libera as duas subabas) e 'metas/acompanhamento' (só leitura, libera só a 1ª).
const METAS_SUBS: NavSubItem[] = [
  { href: '/metas',          label: 'Acompanhamento', icon: LineChart,     area: 'metas/acompanhamento', areasAny: ['metas/acompanhamento', 'metas'] },
  { href: '/metas/cadastro', label: 'Cadastro',       icon: ClipboardList, area: 'metas' },
]

// Gestão de Pessoas (v5.6.0) — seção NOVA da sidebar; o Inventário de Ativos é seu 1º módulo.
// Área própria desde a migration 0247 (na M0 ficou sob 'admin/design-system', porque declarar
// a área nova sem a migration quebraria o teste de paridade banco↔app).
// `emConstrucao` (triângulo de alerta) fica enquanto a tela roda sobre fixture — sai na M3,
// quando ela passa a ler as RPCs `patrimonio_*`.
const GESTAO_PESSOAS_SUBS: NavSubItem[] = [
  { href: '/gestao-pessoas/inventario', label: 'Inventário de Ativos', icon: Boxes, area: 'gestao-pessoas/inventario', emConstrucao: true },
]

/** Grupos com subabas — chave = href do item-pai em NAV_ITEMS. Único ponto que precisa
 *  saber "isto é um grupo" (o resto do render/filtro é genérico via NavGroup). */
const NAV_GROUPS: Record<string, NavSubItem[]> = {
  '/performance':    PERFORMANCE_SUBS,
  '/financeiro':     FINANCEIRO_SUBS,
  '/metas':          METAS_SUBS,
  '/gestao-pessoas': GESTAO_PESSOAS_SUBS,
}

// Ordem da sidebar (v5.6.0): Executiva › Performance › Metas › Financeiro › Solicitações
// › Gestão de Pessoas › Upload de Arquivos › Usuários e Acessos › Design System.
// (v5.1.9: Metas subiu p/ cima de Financeiro; Solicitações subiu p/ cima de Upload de
// Arquivos. v5.6.0: Gestão de Pessoas entrou entre Solicitações e o bloco administrativo.)
const NAV_ITEMS: NavItem[] = [
  { href: '/executiva',      label: 'Executiva',          Icon: LayoutDashboard, area: 'executiva', emConstrucao: true },
  { href: '/performance',    label: 'Performance',        Icon: TrendingUp,      area: null            },
  { href: '/metas',          label: 'Metas',              Icon: Target,          area: null            },
  { href: '/financeiro',     label: 'Financeiro',         Icon: Wallet,          area: null            },
  { href: '/solicitacoes',   label: 'Solicitações',       Icon: Inbox,           area: null, areasAny: ['solicitacoes/basico', 'solicitacoes'] },
  // Seção nova (v5.6.0), entre os módulos de operação e o bloco administrativo.
  // Ícone `IdCard` (crachá), NÃO `Users`/`UsersRound`: o `Users` já é "Usuários e Acessos" e as
  // variantes redondas são quase indistinguíveis dele no tamanho 16px da sidebar (ajuste pedido
  // pelo Yan na aprovação da M0). O crachá também separa os conceitos: pessoa da empresa aqui,
  // conta da plataforma lá.
  { href: '/gestao-pessoas', label: 'Gestão de Pessoas',  Icon: IdCard,          area: null            },
  { href: '/admin/uploads',        label: 'Upload de Arquivos', Icon: Upload,  area: 'admin/uploads'        },
  { href: '/admin/acessos',        label: 'Usuários e Acessos', Icon: Users,         area: 'admin/acessos'        },
  // 'Tipos de solicitação' saiu da sidebar (v4.18/M5): acessível pelo botão âmbar
  // "Gerenciar solicitações" dentro de Solicitações (só admin). Rota /admin/solicitacoes intacta.
  { href: '/admin/design-system',  label: 'Design System',      Icon: Palette,       area: 'admin/design-system'  },
]

interface SidebarContentProps {
  pathname:    string
  usuario:     UsuarioSidebar
  onNav?:      () => void
  onCollapse?: () => void
}

const JANUS_LOGO_SRC = '/logos/logo-janus.svg'

// ── Logo Janus do header (v4.40.0, ADR-0145 — absorve o teste test/rebrand-janus-sidebar) ──
// Caixa fixa 168×48 centralizada (respiro ~12px/lado até o chevron; ritmo do header antigo),
// arte via MÁSCARA CSS (SVG monocromático como mask-image + backgroundColor) — o asset nunca é
// editado; a cor vive aqui. REGRA ÚNICA de cor: `var(--brand)` — no repouso é o neutro do Grupo
// (#75777B, novo default) e nas abas setoriais herda o override via [data-theme] (Weddings
// dourado, Trips turquesa, Corp verde) — tokens, não os hex baked do teste (decisão do Yan).
// Sob o logo, o "version X.X.X" centralizado (gap mt-2 ≈19px ópticos — o lettering da arte
// termina a ~81% da altura); o byline "by WELCOME" do teste saiu no checkpoint (a marca Welcome
// permanece no selo do rodapé). O ramo legado do WelcomeGroupLogo (Image h-10 à esquerda,
// scale-[0.9]) foi removido; os SVGs antigos permanecem em public/logos (histórico).
function JanusLogo() {
  // A máscara CSS não expõe onError — uma SONDA (Image() em efeito, mesma URL → mesmo cache)
  // detecta falha de carga e ativa o fallback textual "Janus" (setState em callback async, ok).
  const [erro, setErro] = useState(false)
  useEffect(() => {
    const probe = new window.Image()
    probe.onerror = () => setErro(true)
    probe.src = JANUS_LOGO_SRC
  }, [])

  // Sob o logo: SÓ o "version X.X.X", alinhado à DIREITA da caixa do logo (168px — a arte
  // preenche a largura toda, então a borda direita da caixa ≈ o "S" do wordmark; ajuste do
  // checkpoint). O byline "by WELCOME" saiu (a marca Welcome permanece no selo do rodapé).
  const byline = (
    <div className="w-[168px] max-w-full mx-auto flex justify-end mt-2">
      <VersionHistory />
    </div>
  )

  if (erro) {
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center">
        <p className="text-[15px] font-[800] leading-tight uppercase tracking-[1px]" style={{ color: 'var(--brand)' }}>
          Janus
        </p>
        {byline}
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col items-center">
      <div className="relative h-12 w-[168px] max-w-full">
        <div
          role="img"
          aria-label="Janus"
          className="absolute inset-0"
          style={{
            backgroundColor: 'var(--brand)',
            WebkitMaskImage: `url(${JANUS_LOGO_SRC})`,
            maskImage: `url(${JANUS_LOGO_SRC})`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
          }}
        />
      </div>
      {byline}
    </div>
  )
}

function SidebarContent({ pathname, usuario, onNav, onCollapse }: SidebarContentProps) {
  // Logo: Janus em TODAS as variantes, cor única `var(--brand)` (o [data-theme] resolve o
  // override setorial por aba; fora de Performance, o neutro do Grupo) — ver JanusLogo acima.
  // Grupos com subabas (Performance, Financeiro, Metas) nascem RECOLHIDOS a cada abertura
  // do site (v4.16.2) — sem persistência: o estado é só em memória, então sobrevive
  // à navegação client-side mas volta a recolher num carregamento/refresh novo. (A
  // subaba ATIVA ainda aparece quando recolhido — lógica dentro do NavGroup, v5.0.0.)
  // Um único mapa href→aberto (em vez de um useState por grupo) generaliza sem crescer
  // a cada seção nova.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const toggleGroup = (href: string) => setOpenGroups(prev => ({ ...prev, [href]: !prev[href] }))

  // ── RBAC: navegação filtrada pelas permissões do usuário ──
  const pode = (area: Area) => usuario.permissoes.includes(area)
  const subVisivel = (s: NavSubItem) => (s.areasAny ? s.areasAny.some(pode) : pode(s.area))

  const navItems = NAV_ITEMS.filter(item => {
    if (item.sempre) return true
    if (item.areasAny) return item.areasAny.some(pode)
    const grupo = NAV_GROUPS[item.href]
    if (grupo) return grupo.some(subVisivel)
    return item.area !== null && pode(item.area)
  })

  // ── Barra de rolagem FLUTUANTE em overlay (v4.16.2) ──
  // A nativa é escondida (`.scrollbar-none` → largura 0 → NÃO desloca o conteúdo);
  // um thumb absoluto flutua sobre o conteúdo. Tudo IMPERATIVO (mutação de style via
  // ref em effects/handlers, ZERO state) — evita re-render por scroll e os rules do
  // React Compiler (sem setState em effect, sem ler ref no render).
  const navViewRef    = useRef<HTMLElement | null>(null)
  const navContentRef = useRef<HTMLDivElement | null>(null)
  const thumbRef      = useRef<HTMLDivElement | null>(null)
  const hideRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggingRef   = useRef(false)

  const measureThumb = useCallback(() => {
    const el = navViewRef.current, th = thumbRef.current
    if (!el || !th) return
    // Geometria compartilhada de @/lib/ui/scrollbar-math (fim da cópia local da conta) —
    // com o respiro padrão nas pontas do trilho (THUMB_FOLGA, DS §Barras de rolagem).
    const g = thumbGeom(el.scrollHeight, el.clientHeight, el.scrollTop, THUMB_FOLGA)
    if (!g.visivel) { th.style.display = 'none'; return }
    th.style.display = 'block'
    th.style.height = `${g.tamanho}px`
    th.style.transform = `translateY(${g.pos}px)`
  }, [])

  // Aparece e some sozinho; não some no meio de um arraste (draggingRef).
  const revealThumb = useCallback(() => {
    const th = thumbRef.current
    if (th) th.style.opacity = '1'
    if (hideRef.current) clearTimeout(hideRef.current)
    hideRef.current = setTimeout(() => {
      if (draggingRef.current) return
      const t = thumbRef.current
      if (t) t.style.opacity = '0'
    }, 1200)
  }, [])

  // Arraste do thumb → scrollTop (pointer capture); mesma proporção do measureThumb.
  const iniciarArraste = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const el = navViewRef.current, th = thumbRef.current
    if (!el || !th) return
    e.preventDefault()
    e.stopPropagation()
    th.setPointerCapture(e.pointerId)
    draggingRef.current = true
    th.style.cursor = 'grabbing'
    revealThumb()
    const inicio = e.clientY
    const base = el.scrollTop
    const scrollSize = el.scrollHeight
    const clientSize = el.clientHeight
    const mover = (ev: PointerEvent) => {
      el.scrollTop = scrollAoArrastar(ev.clientY - inicio, base, scrollSize, clientSize, THUMB_FOLGA)
    }
    const soltar = () => {
      draggingRef.current = false
      th.style.cursor = 'grab'
      th.releasePointerCapture(e.pointerId)
      th.removeEventListener('pointermove', mover)
      th.removeEventListener('pointerup', soltar)
      th.removeEventListener('pointercancel', soltar)
      revealThumb()
    }
    th.addEventListener('pointermove', mover)
    th.addEventListener('pointerup', soltar)
    th.addEventListener('pointercancel', soltar)
  }, [revealThumb])

  // ResizeObserver: viewport (janela) E conteúdo (itens/subabas mudando de altura).
  useEffect(() => {
    const el = navViewRef.current
    if (!el) return
    measureThumb()
    const ro = new ResizeObserver(() => measureThumb())
    ro.observe(el)
    if (navContentRef.current) ro.observe(navContentRef.current)
    return () => { ro.disconnect(); if (hideRef.current) clearTimeout(hideRef.current) }
  }, [measureThumb])

  // Re-mede quando expandir/recolher um grupo (ou navegar) muda a altura do conteúdo.
  useEffect(() => { measureThumb() }, [measureThumb, pathname, openGroups, navItems.length])

  const onNavScroll = useCallback(() => { measureThumb(); revealThumb() }, [measureThumb, revealThumb])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}>
      {/* Header */}
      <div className="px-5 py-3 border-b relative flex items-center" style={{ borderColor: 'var(--sidebar-border)' }}>
        <JanusLogo />
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

      {/* Nav — rolável quando há muitas abas; barra de rolagem FLUTUANTE em overlay
          (nativa escondida → não desloca o conteúdo; thumb some sozinho sem interação). */}
      <div
        className="flex-1 min-h-0 relative"
        onMouseEnter={() => revealThumb()}
        onMouseMove={() => revealThumb()}
      >
        <nav
          ref={navViewRef}
          onScroll={onNavScroll}
          className="h-full overflow-y-auto scrollbar-none px-3 py-3"
        >
          <div ref={navContentRef} className="space-y-0.5">
        {navItems.map(({ href, label, Icon, emConstrucao }) => {
          const grupo = NAV_GROUPS[href]

          if (grupo) {
            return (
              <NavGroup
                key={href}
                label={label}
                Icon={Icon}
                href={href}
                subs={grupo}
                pathname={pathname}
                pode={pode}
                open={!!openGroups[href]}
                onToggle={() => toggleGroup(href)}
                onNav={onNav}
              />
            )
          }

          const active = pathname === href || pathname.startsWith(`${href}/`)
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
              {/* `truncate` + `min-w-0`: o rótulo mais longo da sidebar ("Demonstrativo de
                  Resultado", v5.3.0) fica em UMA linha — encurta com reticências em vez de
                  quebrar e desalinhar a altura fixa (h-10) do item. */}
              <span className="min-w-0 truncate" title={label}>{label}</span>
              {emConstrucao && <TriangleAlert size={14} className="ml-auto shrink-0 text-warning" aria-label="Em construção" />}
              {href === '/solicitacoes' && <BadgePendencias promise={usuario.pendenciasPromise} />}
            </Link>
          )
        })}
          </div>
        </nav>

        {/* Thumb flutuante ARRASTÁVEL (v5.0.0): mesma aparência de antes; agora aceita
            arraste (pointer capture) além do mouse-scroll. Ocupa só a faixa da barra (6px
            na direita) → não intercepta clique de aba. Posição/altura/opacidade via ref
            imperativo; começa escondido (display:none, opacity:0) → sem flash no SSR.
            motion-reduce desliga o fade para quem prefere menos movimento. */}
        <div
          ref={thumbRef}
          onPointerDown={iniciarArraste}
          className="absolute right-1 top-0 w-1.5 cursor-grab touch-none rounded-full transition-opacity duration-300 motion-reduce:transition-none"
          style={{
            display: 'none',
            height: 0,
            opacity: 0,
            background: 'color-mix(in srgb, var(--text-muted) 55%, transparent)',
            willChange: 'transform',
          }}
        />
      </div>

      {/* Footer — identidade do usuário logado + sair. min-h + py acomodam o selo (receita do
          mockup aprovado). Narrativa: o Janus assume o header; a marca Welcome permanece aqui. */}
      <div className="min-h-14 px-4 py-2 border-t flex items-center gap-2.5" style={{ borderColor: 'var(--sidebar-border)' }}>
        {/* Selo Welcome Group vertical em box — receita: 46px · respiro 4px · canto 12px ·
            fundo branco · com borda. (Image fill ignora o padding do pai → wrapper relative.) */}
        <div
          className="h-[46px] w-[46px] shrink-0 p-1 rounded-xl bg-white border"
          style={{ borderColor: 'var(--sidebar-border)' }}
        >
          <div className="relative h-full w-full">
            <Image
              src="/logos/welcome-group-vert.svg"
              alt="Welcome Group"
              fill
              className="object-contain"
            />
          </div>
        </div>
        <div className="flex-1 min-w-0" title={usuario.email ?? undefined}>
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {usuario.nome ?? usuario.email}
          </p>
          {usuario.role && (
            <p className="text-2xs truncate" style={{ color: 'var(--text-muted)' }}>
              {usuario.role}
            </p>
          )}
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            aria-label="Sair"
            className="p-1.5 rounded text-zinc-400 hover:text-danger transition-colors"
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
