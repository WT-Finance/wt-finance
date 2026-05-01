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
  if (v == null)    return 'text-zinc-400'
  if (v >= alvo)   return 'text-emerald-600'
  if (v >= atencao) return 'text-amber-500'
  return 'text-red-500'
}
