import type { CSSProperties } from 'react'

// v4.14.1 — botões-pill da página de Usuários e Acessos. Mesmo FORMATO das pills
// de período do Financeiro (rounded-full, borda fina, px-3 py-1, text-xs), com
// hierarquia por variante. Cor SEMPRE neutra do Group (ADR-0103 ext.): nunca
// var(--brand)/dourado. Foco neutralizado via .foco-neutro.

/** Base de toda pill de ação. Combine com uma das variantes abaixo. */
export const PILL =
  'foco-neutro inline-flex items-center justify-center gap-1.5 rounded-full border ' +
  'px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

/** Secundária / neutra — equivale à pill inativa. */
export const PILL_NEUTRO = 'border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'

/** Destrutiva — pill com tom de perigo (semântico, permitido fora da regra de marca). */
export const PILL_PERIGO = 'border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50'

/** Primária — pill no estilo "ativo" das pills de período (bege suave do tema group),
 *  via tokens neutros fixos. Use junto com PILL_PRIMARIA_STYLE. */
export const PILL_PRIMARIA = 'hover:brightness-95'
export const PILL_PRIMARIA_STYLE: CSSProperties = {
  background:  'var(--action-soft)',
  borderColor: 'var(--action-soft-border)',
  color:       'var(--action-soft-fg)',
}
