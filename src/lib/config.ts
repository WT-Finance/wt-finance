import type { SupabaseClient } from '@supabase/supabase-js'

/** Margem mínima para classificação "ok" (verde). */
export const MARGEM_OK = 14

/** Margem mínima para classificação "atenção" (âmbar). Abaixo disso → vermelho. */
export const MARGEM_ALERTA = 12

export interface Benchmarks {
  margemAlvo:    number
  margemAtencao: number
  margemCritica: number
}

/**
 * Lê benchmarks de margem da tabela app.config via RPC.
 * Cai nos valores estáticos se a tabela estiver vazia ou a RPC falhar.
 */
export async function getBenchmarks(db: SupabaseClient): Promise<Benchmarks> {
  const { data } = await db.rpc('get_dashboard_config')
  const cfg = data as Record<string, number> | null
  return {
    margemAlvo:    cfg?.margem_alvo_pct    ?? MARGEM_OK,
    margemAtencao: cfg?.margem_atencao_pct ?? MARGEM_ALERTA,
    margemCritica: cfg?.margem_critica_pct ?? 10,
  }
}

/**
 * Classe Tailwind para coloração condicional de um valor de margem.
 * Reutilizado em KpiCard, MixSetorTable e MixProdutoTable.
 */
export function margemColor(
  v: number | null,
  alvo    = MARGEM_OK,
  atencao = MARGEM_ALERTA,
): string {
  if (v == null)    return 'text-text-subtle'
  if (v >= alvo)   return 'text-success'
  if (v >= atencao) return 'text-warning'
  return 'text-danger'
}

// ── Cores de domínio para gráficos (consolidadas em v4.8 / M4) ────────────────
// Antes duplicadas hardcoded em ~4 gráficos. Apontam para tokens CSS.

/** Cor identitária por setor macro. Chaves batem com `setor_macro`/display. */
export const SETOR_COLORS: Record<string, string> = {
  Lazer:       'var(--setor-lazer)',
  Weddings:    'var(--setor-weddings)',
  Corporativo: 'var(--setor-corporativo)',
}

/** Ordem fixa de exibição dos subsetores Weddings (composição, stacks, legendas). */
export const SUBSETOR_ORDER: readonly string[] = [
  'COMERCIAL',
  'PLANEJAMENTO',
  'PRODUÇÃO',
  'CONVIDADOS - Hospedagens',
  'CONVIDADOS - Extras',
]

/** Cor por subsetor (token CSS). Chaves batem com `subsetor`/`subsetor_detalhado`. */
export const SUBSETOR_COLORS: Record<string, string> = {
  COMERCIAL:                  'var(--subsetor-comercial)',
  PLANEJAMENTO:               'var(--subsetor-planejamento)',
  'PRODUÇÃO':                 'var(--subsetor-producao)',
  'CONVIDADOS - Hospedagens': 'var(--subsetor-hospedagens)',
  'CONVIDADOS - Extras':      'var(--subsetor-extras)',
}

/** Rótulo amigável por subsetor (acentuação/capitalização corretas). */
export const SUBSETOR_LABELS: Record<string, string> = {
  COMERCIAL:                  'Comercial',
  PLANEJAMENTO:               'Planejamento',
  'PRODUÇÃO':                 'Produção',
  'CONVIDADOS - Hospedagens': 'Convidados – Hospedagens',
  'CONVIDADOS - Extras':      'Convidados – Extras',
}

/** Fallback de cor de subsetor desconhecido (dourado brand). */
export const SUBSETOR_COLOR_FALLBACK = 'var(--brand)'

/** Resolve a cor de um subsetor com fallback. */
export const subsetorColor = (subsetor: string): string =>
  SUBSETOR_COLORS[subsetor] ?? SUBSETOR_COLOR_FALLBACK
