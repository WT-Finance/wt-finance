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

/** Cor identitária por setor macro (palette de gráficos cross-setor). Chaves batem com `setor_macro`/display. */
export const SETOR_COLORS: Record<string, string> = {
  Lazer:       'var(--setor-lazer)',
  Weddings:    'var(--setor-weddings)',
  Corporativo: 'var(--setor-corporativo)',
}

/** Cor de MARCA por setor (o --brand de cada aba, cross-contexto). Usada nos cards de
 *  Metas (tema group) para dar a cada setor a sua cor de marca. Distinta de SETOR_COLORS
 *  (identidade de gráficos). Chaves batem com `setor_macro`/nome interno. */
export const SETOR_MARCA_COLORS: Record<string, string> = {
  Lazer:       'var(--marca-lazer)',
  Weddings:    'var(--marca-weddings)',
  Corporativo: 'var(--marca-corporativo)',
}

/** Ordem fixa de exibição dos subsetores Weddings (composição, stacks, legendas). */
export const SUBSETOR_ORDER: readonly string[] = [
  'COMERCIAL',
  'PLANEJAMENTO',
  'PRODUÇÃO',
  'CONVIDADOS - Hospedagens',
  'CONVIDADOS - Extras',
]

/**
 * Balde dos produtos de Weddings que estão FORA do mapa `analytics.dim_produto_subsetor`
 * — a RPC o devolve como 6º item de `subsetores`, com este rótulo literal, e ele NÃO
 * pertence a `SUBSETOR_ORDER` (não se cadastra meta para "não classificado").
 *
 * O mapa é uma lista curada de 21 produtos e o namespace de produto do Monde é ABERTO
 * (há produtos batizados por grupo, tipo "G - WelConnect - Colômbia AGO2026"), então o
 * balde é estrutural: não-nulo em 26 dos últimos 48 meses. Quem soma os 5 subsetores e
 * compara com o total do setor precisa contar com ele.
 *
 * O literal ainda aparece cru em call-sites anteriores à v5.4.4 (sumario-subsetor,
 * margem-drawer, kpi-principal-drawer, route de operações) — migração incremental,
 * quando cada tela for tocada por outro motivo.
 */
export const SUBSETOR_NAO_CLASSIFICADO = 'NÃO_CLASSIFICADO'

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
