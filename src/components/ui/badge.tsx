import type { ReactNode } from 'react'

// ── <Badge> — etiqueta semântica do DS (v4.26 / Fase B) ───────────────────────
// Forma canônica das badges de status do app: rounded-full + borda + px/py +
// micro-texto (text-2xs) + cor por TOKEN semântico. Unifica os spans inline
// espalhados (status de usuário, tipo, etc.). A variante 'count' é o círculo sólido
// de notificação (sidebar / Solicitações). Cor sempre via token (o lint barra cru).
//
// NOTA: `statusBadge()`/`acaoBadge()` em src/lib/solicitacoes/format.ts continuam
// como provedores de CLASSE para os layouts que aplicam a classe diretamente; este
// <Badge> é o primitivo go-forward e para os spans inline que casam exatamente.

export type BadgeVariant = 'success' | 'danger' | 'warning' | 'brand' | 'gestao' | 'neutro' | 'count'

const CORES: Record<Exclude<BadgeVariant, 'count'>, string> = {
  success: 'border-success bg-success-bg text-success',
  danger:  'border-danger bg-danger-bg text-danger',
  warning: 'border-warning bg-warning-bg text-warning',
  brand:   'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-deep)]',
  gestao:  'border-[var(--gestao)] bg-[var(--gestao-soft)] text-[var(--gestao-fg)]',
  neutro:  'border-zinc-200 bg-zinc-100 text-zinc-500',
}

interface BadgeProps {
  variant?:   BadgeVariant
  className?: string
  children:   ReactNode
}

export default function Badge({ variant = 'neutro', className = '', children }: BadgeProps) {
  if (variant === 'count') {
    return (
      <span className={`inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1.5 text-3xs font-semibold text-white ${className}`}>
        {children}
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap ${CORES[variant]} ${className}`}>
      {children}
    </span>
  )
}
