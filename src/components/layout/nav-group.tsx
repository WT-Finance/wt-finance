'use client'

import Link from 'next/link'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Area } from '@/lib/auth/areas'

export interface NavSubItem {
  href: string
  label: string
  icon: LucideIcon
  /** Área de permissão que libera o subitem. */
  area: Area
  /** Visível se o usuário tiver QUALQUER uma destas áreas (OR). v4.34.0. */
  areasAny?: Area[]
  /** Rota atrás do gate "em construção" (preview) → ícone triangular de alerta à direita. v5.1.9. */
  emConstrucao?: boolean
}

interface NavGroupProps {
  label: string
  Icon: LucideIcon
  /** Href do item-pai — usado para marcar o grupo ativo e como chave de estado. */
  href: string
  subs: NavSubItem[]
  pathname: string
  pode: (area: Area) => boolean
  /** Estado aberto/fechado, controlado pelo pai (SidebarContent) — independente por grupo. */
  open: boolean
  onToggle: () => void
  onNav?: () => void
}

/**
 * Seção da sidebar com subabas (Performance, Financeiro, Metas — v5.0.0). Extraído
 * do copy-paste original entre Performance e Financeiro; comportamento PRESERVADO:
 * - Grupo nasce RECOLHIDO (o `open` vem de fora, sem persistência — volta a recolher
 *   num carregamento/refresh novo; sobrevive à navegação client-side dentro da sessão).
 * - Filtra subitens por permissão: `pode(sub.area)` OU `sub.areasAny?.some(pode)`.
 * - FECHADO, mostra só a subaba ATIVA; ABERTO, mostra todas as visíveis.
 * - O ativo é o de prefixo MAIS ESPECÍFICO (`pathname === href || pathname.startsWith(href+'/')`,
 *   maior `href` primeiro) — cobre o caso de uma sub-rota ser prefixo de outra
 *   (financeiro/fluxo-caixa[/gerencial], metas[/cadastro]) sem acender as duas juntas.
 * - Sem subitens visíveis após o filtro → não renderiza nada.
 */
export default function NavGroup({ label, Icon, href, subs, pathname, pode, open, onToggle, onNav }: NavGroupProps) {
  const isActive = pathname.startsWith(href)

  const visible = subs.filter(s => (s.areasAny ? s.areasAny.some(pode) : pode(s.area)))
  if (visible.length === 0) return null

  const activeHref = visible
    .filter(s => pathname === s.href || pathname.startsWith(s.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null

  const visibleSubs = open
    ? visible
    : isActive
    ? visible.filter(s => s.href === activeHref)
    : []

  return (
    <div>
      <button
        onClick={onToggle}
        className={[
          'w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors relative',
          isActive ? 'font-semibold' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100',
        ].join(' ')}
        style={isActive
          ? { background: 'var(--brand-soft)', color: 'var(--brand)' }
          : undefined}
      >
        {isActive && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
            style={{ background: 'var(--brand)' }}
          />
        )}
        <Icon
          size={16}
          style={isActive ? { color: 'var(--brand)' } : undefined}
          className={isActive ? '' : 'text-zinc-400'}
        />
        <span className="flex-1 text-left">{label}</span>
        <ChevronRight
          size={14}
          className={['transition-transform shrink-0', open ? 'rotate-90' : ''].join(' ')}
          style={{ color: isActive ? 'var(--brand)' : undefined }}
        />
      </button>

      {visibleSubs.length > 0 && (
        <div className="mt-0.5 ml-4 pl-3 border-l border-zinc-200 space-y-0.5">
          {visibleSubs.map(sub => {
            const subActive = sub.href === activeHref
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
                  className={subActive ? 'shrink-0' : 'shrink-0 text-zinc-400'}
                />
                {/* `truncate` + `min-w-0`: o rótulo fica em UMA linha, encurtando com
                    reticências em vez de quebrar. Sem isso, o item ATIVO quebrava e o
                    inativo não — o estado ativo troca o peso para `font-semibold`, que
                    alarga o texto o bastante para estourar a largura da sidebar. Bug de
                    quem só olha o estado inativo. (Mesmo tratamento do item de 1º nível.) */}
                <span className="min-w-0 truncate" title={sub.label}>{sub.label}</span>
                {sub.emConstrucao && <TriangleAlert size={13} className="ml-auto shrink-0 text-warning" aria-label="Em construção" />}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
