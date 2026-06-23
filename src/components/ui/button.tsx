import type { ButtonHTMLAttributes, ReactNode } from 'react'

// ── <Button> — primitivo canônico de botão do Design System (v4.26 / Fase B) ──
// Centraliza os clusters reais de botão do app (auditoria v4.26), para telas novas
// não reinventarem o seu. As variantes reproduzem EXATAMENTE as classes que já
// existiam (byte-equivalente — migração é refator, não redesign). Composição por
// concatenação simples (sem clsx/tailwind-merge, que não existem no projeto):
// `<classe da variante> <className extra>`. Para um caso fora dos clusters, use
// `variant="livre"` e passe o className verbatim (o resultado é a classe idêntica).
//
// Cores SEMPRE via token (o lint wt/no-cor-hardcoded barra cru). Foco neutro de
// plataforma via .foco-neutro (anel institucional só em :focus-visible).

export type ButtonVariant =
  | 'solido'      // CTA sólido escuro de plataforma (--action-primary). Ex.: "Entrar".
  | 'contorno'    // secundário outline (Cancelar / Sair).
  | 'ghost'       // texto sem fundo (Ver mais / Redefinir).
  | 'icone'       // botão-ícone SEM borda (fechar drawer/modal, ações de linha).
  | 'icone-borda' // botão-ícone COM borda (ações de Usuários/Tipos).
  | 'livre'       // sem classe de variante — passthrough total via className.

export type ButtonTone = 'neutro' | 'perigo'
export type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  tone?:    ButtonTone   // aplica-se a 'icone'/'icone-borda' (neutro|perigo)
  size?:    ButtonSize   // aplica-se a 'solido'/'contorno' (md=py-2.5 | sm=py-2)
  children?: ReactNode
}

const DISABLED = 'disabled:opacity-50 disabled:cursor-not-allowed'

function classesVariante(variant: ButtonVariant, tone: ButtonTone, size: ButtonSize): string {
  switch (variant) {
    case 'solido':
      return [
        'foco-neutro inline-flex items-center justify-center rounded-lg text-sm font-semibold transition hover:opacity-90',
        'bg-action-primary text-action-primary-fg',
        size === 'sm' ? 'px-4 py-2' : 'px-4 py-2.5',
        DISABLED,
      ].join(' ')
    case 'contorno':
      return [
        'foco-neutro inline-flex items-center justify-center rounded-lg border border-zinc-300 text-sm text-zinc-700 transition-colors hover:bg-zinc-50',
        size === 'sm' ? 'px-4 py-1.5' : 'px-4 py-2',
        DISABLED,
      ].join(' ')
    case 'ghost':
      return `foco-neutro text-xs text-zinc-400 transition-colors hover:text-zinc-600 ${DISABLED}`
    case 'icone':
      return [
        'foco-neutro inline-flex items-center justify-center rounded p-1.5 transition-colors',
        tone === 'perigo'
          ? 'text-zinc-400 hover:bg-danger-bg hover:text-danger'
          : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700',
        DISABLED,
      ].join(' ')
    case 'icone-borda':
      return [
        'foco-neutro inline-flex items-center justify-center rounded-md border p-1.5 transition-colors',
        tone === 'perigo'
          ? 'border-danger text-danger hover:bg-danger-bg hover:border-danger'
          : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700',
        DISABLED,
      ].join(' ')
    case 'livre':
      return ''
  }
}

export default function Button({
  variant = 'solido',
  tone = 'neutro',
  size = 'md',
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const base = classesVariante(variant, tone, size)
  const cls = base ? (className ? `${base} ${className}` : base) : className
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  )
}
