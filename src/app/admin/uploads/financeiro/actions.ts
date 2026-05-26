'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import type { LancamentoFinanceiroRaw } from '@/lib/carga/parse-lancamentos-financeiro'
import type { VendasPagamentoRaw } from '@/lib/carga/parse-vendas-pagamento'
import type { FluxoCaixaTituloRaw } from '@/lib/carga/parse-fluxo-caixa-titulos'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

// ---------------------------------------------------------------------------
// Lançamentos financeiros (raw.lancamentos)
// ---------------------------------------------------------------------------

export async function getLancamentosFinanceiroStatusAction(): Promise<
  { total: number; ultima_atualizacao: string | null } | { error: string }
> {
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)
    const { data, error } = await bound('contar_lancamentos_financeiro')
    if (error) return { error: error.message }
    return { total: (data as number) ?? 0, ultima_atualizacao: null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function inserirLoteLancamentosFinanceiroAction(
  lote: LancamentoFinanceiroRaw[],
  isFirst: boolean,
  arquivoOrigem: string,
): Promise<{ inseridas: number } | { error: string }> {
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    if (isFirst) {
      const { error } = await bound('truncar_lancamentos_financeiro')
      if (error) return { error: `Erro ao limpar tabela: ${error.message}` }
    }

    const rows = lote.map(r => ({ ...r, arquivo_origem: arquivoOrigem }))
    const { error } = await bound('inserir_lote_lancamentos_financeiro', { p_linhas: rows })
    if (error) return { error: `Erro ao inserir lote: ${error.message}` }

    return { inseridas: lote.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function finalizarLancamentosFinanceiroAction(
  totalAntes: number,
  totalInseridas: number,
): Promise<{ sucesso: boolean; total_linhas: number; erros: string[] } | { error: string }> {
  try {
    const supabase = getAdminClient()
    const { error } = await (supabase.rpc as unknown as BoundRpc).bind(supabase)('regenerar_financeiro_lancamentos')
    if (error) return { error: `Erro ao regenerar fato: ${error.message}` }

    return { sucesso: true, total_linhas: totalInseridas, erros: [] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Vendas por forma de pagamento (raw.vendas_pagamento)
// ---------------------------------------------------------------------------

export async function getVendasPagamentoStatusAction(): Promise<
  { total: number; ultima_atualizacao: string | null } | { error: string }
> {
  try {
    const supabase = getAdminClient()
    const { data, error } = await (supabase.rpc as unknown as BoundRpc).bind(supabase)('contar_vendas_pagamento')
    if (error) return { error: error.message }
    return { total: (data as number) ?? 0, ultima_atualizacao: null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function inserirLoteVendasPagamentoAction(
  lote: VendasPagamentoRaw[],
  isFirst: boolean,
  arquivoOrigem: string,
): Promise<{ inseridas: number } | { error: string }> {
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    if (isFirst) {
      const { error } = await bound('truncar_vendas_pagamento')
      if (error) return { error: `Erro ao limpar tabela: ${error.message}` }
    }

    const rows = lote.map(r => ({ ...r, arquivo_origem: arquivoOrigem }))
    const { error } = await bound('inserir_lote_vendas_pagamento', { p_linhas: rows })
    if (error) return { error: `Erro ao inserir lote: ${error.message}` }

    return { inseridas: lote.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function finalizarVendasPagamentoAction(
  totalAntes: number,
  totalInseridas: number,
): Promise<{ sucesso: boolean; total_linhas: number; erros: string[] } | { error: string }> {
  // raw.vendas_pagamento não tem transformação adicional por agora
  return { sucesso: true, total_linhas: totalInseridas, erros: [] }
}

// ---------------------------------------------------------------------------
// CAP/CAR tratada (raw.fluxo_caixa_titulos)
// ---------------------------------------------------------------------------

export async function getFluxoCaixaTitulosStatusAction(): Promise<
  { total: number; ultima_atualizacao: string | null } | { error: string }
> {
  try {
    const supabase = getAdminClient()
    const { data, error } = await (supabase.rpc as unknown as BoundRpc).bind(supabase)('contar_fluxo_caixa_titulos')
    if (error) return { error: error.message }
    return { total: (data as number) ?? 0, ultima_atualizacao: null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function inserirLoteFluxoCaixaTitulosAction(
  lote: FluxoCaixaTituloRaw[],
  isFirst: boolean,
  arquivoOrigem: string,
): Promise<{ inseridas: number } | { error: string }> {
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    if (isFirst) {
      const { error } = await bound('truncar_fluxo_caixa_titulos')
      if (error) return { error: `Erro ao limpar tabela: ${error.message}` }
    }

    const rows = lote.map(r => ({ ...r, arquivo_origem: arquivoOrigem }))
    const { error } = await bound('inserir_lote_fluxo_caixa_titulos', { p_lote: rows })
    if (error) return { error: `Erro ao inserir lote: ${error.message}` }

    return { inseridas: lote.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function finalizarFluxoCaixaTitulosAction(
  totalAntes: number,
  totalInseridas: number,
): Promise<{ sucesso: boolean; total_linhas: number; erros: string[] } | { error: string }> {
  // raw.fluxo_caixa_titulos não tem transformação adicional por agora
  return { sucesso: true, total_linhas: totalInseridas, erros: [] }
}
