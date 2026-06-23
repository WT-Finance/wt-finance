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
export const PILL_PERIGO = 'border-danger text-danger hover:border-danger hover:bg-danger-bg'

/** Primária — pill no estilo "ativo" das pills de período (bege suave do tema group),
 *  via tokens neutros fixos. Use junto com PILL_PRIMARIA_STYLE. */
export const PILL_PRIMARIA = 'hover:brightness-95'
export const PILL_PRIMARIA_STYLE: CSSProperties = {
  background:  'var(--action-soft)',
  borderColor: 'var(--action-soft-border)',
  color:       'var(--action-soft-fg)',
}

/** Gestão / ação administrativa — âmbar de supervisão (Ver todas / Gerenciar solicitações),
 *  só para admin. Token --gestao (DISTINTO do --warning/status e do dourado Weddings).
 *  Use junto com PILL_GESTAO_STYLE. (ADR-0103 ext., v4.18.0) */
export const PILL_GESTAO = 'hover:brightness-95'
export const PILL_GESTAO_STYLE: CSSProperties = {
  background:  'var(--gestao-soft)',
  borderColor: 'var(--gestao)',
  color:       'var(--gestao-fg)',
}

// ── Pill de FILTRO / período ──────────────────────────────────────────────────
// Família DISTINTA da PILL de ação acima (esta é a "pill de período/filtro", com
// ativo dourado-da-aba via var(--brand-soft)). Antes duplicada como `PILL_BASE`
// local em 5 arquivos (v4.26 — dedup). Duas dimensões: padrão e compacta (sm).
export const PILL_FILTRO =
  'rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap'
export const PILL_FILTRO_SM =
  'rounded-full border px-2.5 py-0.5 text-2xs font-medium transition-colors whitespace-nowrap'
/** Estado inativo (consistente entre os usos). */
export const PILL_FILTRO_INATIVO =
  'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'
/** Estado ativo — dourado-da-aba (herda [data-theme] via var(--brand*)). */
export const PILL_FILTRO_ATIVO_STYLE: CSSProperties = {
  background:  'var(--brand-soft)',
  borderColor: 'var(--brand)',
  color:       'var(--brand-deep)',
}
