'use server'

import { loadMetas } from '@/lib/carga/metas'
import { getAdminClient } from '@/lib/supabase/admin'
import type { LancamentoRaw, ResultadoCarga } from '@/lib/carga/lancamentos'
import type { VendaProdutoRaw } from '@/lib/carga/parse-vendas-produto'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

export async function getLancamentosStatusAction(): Promise<{ total: number } | { error: string }> {
  try {
    const supabase = getAdminClient()
    const { data, error } = await (supabase.rpc as unknown as BoundRpc).bind(supabase)('get_upload_status')
    if (error) return { error: error.message }
    const status = data as { lancamentos: { total: number } } | null
    return { total: status?.lancamentos?.total ?? 0 }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function inserirLoteLancamentosAction(
  lote: LancamentoRaw[],
  isFirst: boolean,
): Promise<{ inseridas: number } | { error: string }> {
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    if (isFirst) {
      const { error } = await bound('truncar_lancamentos')
      if (error) return { error: `Erro ao limpar tabela: ${error.message}` }
    }

    const { error } = await bound('inserir_lote_lancamentos', { p_linhas: lote })
    if (error) return { error: `Erro ao inserir lote: ${error.message}` }

    return { inseridas: lote.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function finalizarLancamentosAction(
  totalAntes: number,
  totalInseridas: number,
): Promise<ResultadoCarga | { error: string }> {
  try {
    const supabase = getAdminClient()
    const { error } = await (supabase.rpc as unknown as BoundRpc).bind(supabase)('regenerar_dim_operacao_weddings')
    if (error) return { error: `Erro ao regenerar operações: ${error.message}` }

    return {
      sucesso: true,
      total_linhas: totalInseridas,
      erros: [],
      preview: {
        antes:  { total_lancamentos: totalAntes },
        depois: { total_lancamentos: totalInseridas },
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Vendas (M3.1) — padrão lotes, parse client-side
// ---------------------------------------------------------------------------

export async function getVendasStatusAction(): Promise<
  { total: number; ultima_atualizacao: string | null } | { error: string }
> {
  try {
    const supabase = getAdminClient()
    const { data, error } = await (supabase.rpc as unknown as BoundRpc).bind(supabase)('get_upload_status')
    if (error) return { error: error.message }
    const status = data as { vendas: { total: number; ultima_atualizacao: string | null } } | null
    return {
      total: status?.vendas?.total ?? 0,
      ultima_atualizacao: status?.vendas?.ultima_atualizacao ?? null,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function inserirLoteVendasAction(
  lote: VendaProdutoRaw[],
  isFirst: boolean,
): Promise<{ inseridas: number } | { error: string }> {
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    if (isFirst) {
      const { error: truncErr } = await bound('truncate_dynamic_tables')
      if (truncErr) return { error: `Erro ao truncar tabelas: ${truncErr.message}` }

      try { await loadMetas(false) } catch (e) {
        return { error: `Erro ao carregar metas: ${e instanceof Error ? e.message : String(e)}` }
      }
    }

    const { error } = await bound('inserir_lote_raw', { p_linhas: lote })
    if (error) return { error: `Erro ao inserir lote: ${error.message}` }

    return { inseridas: lote.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function finalizarVendasAction(
  totalAntes: number,
  totalInseridas: number,
): Promise<{
  sucesso: boolean
  total_linhas: number
  vendas_count: number
  fato_item_count: number
  erros: string[]
  preview: { antes: { total_vendas: number }; depois: { total_vendas: number } }
} | { error: string }> {
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    const { data: transformData, error: transformErr } = await bound('transform_raw_to_analytics')
    if (transformErr) return { error: `Erro na transformação: ${transformErr.message}` }

    const resultado = transformData as { vendas_count: number; fato_venda_item_count: number } | null

    const { error: dimErr } = await bound('regenerar_dim_operacao_weddings')
    if (dimErr) return { error: `Erro ao regenerar operações Weddings: ${dimErr.message}` }

    const { error: refreshErr } = await bound('refresh_all_materialized_views')
    if (refreshErr) return { error: `Erro ao atualizar views: ${refreshErr.message}` }

    return {
      sucesso: true,
      total_linhas: totalInseridas,
      vendas_count: resultado?.vendas_count ?? 0,
      fato_item_count: resultado?.fato_venda_item_count ?? 0,
      erros: [],
      preview: {
        antes:  { total_vendas: totalAntes },
        depois: { total_vendas: resultado?.vendas_count ?? 0 },
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
