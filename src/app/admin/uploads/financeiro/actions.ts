'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import type { LancamentoFinanceiroRaw } from '@/lib/carga/parse-lancamentos-financeiro'
import type { VendasPagamentoRaw } from '@/lib/carga/parse-vendas-pagamento'
import type { ContaPagarReceberRaw } from '@/lib/carga/parse-contas-pagar-receber'

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
    const { count, error } = await supabase
      .schema('raw')
      .from('vendas_pagamento')
      .select('*', { count: 'exact', head: true })
    if (error) return { error: error.message }

    const { data: latest } = await supabase
      .schema('raw')
      .from('vendas_pagamento')
      .select('carregado_em')
      .order('carregado_em', { ascending: false })
      .limit(1)
      .single()

    return {
      total: count ?? 0,
      ultima_atualizacao: (latest as { carregado_em: string } | null)?.carregado_em ?? null,
    }
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

    if (isFirst) {
      const { error } = await supabase.schema('raw').from('vendas_pagamento').delete().neq('id', 0)
      if (error) return { error: `Erro ao limpar tabela: ${error.message}` }
    }

    const rows = lote.map(r => ({ ...r, arquivo_origem: arquivoOrigem }))
    const { error } = await supabase.schema('raw').from('vendas_pagamento').insert(rows)
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
// CAP/CAR (raw.contas_pagar_receber)
// ---------------------------------------------------------------------------

export async function getContasPagarReceberStatusAction(): Promise<
  { total: number; ultima_atualizacao: string | null } | { error: string }
> {
  try {
    const supabase = getAdminClient()
    const { count, error } = await supabase
      .schema('raw')
      .from('contas_pagar_receber')
      .select('*', { count: 'exact', head: true })
    if (error) return { error: error.message }

    const { data: latest } = await supabase
      .schema('raw')
      .from('contas_pagar_receber')
      .select('carregado_em')
      .order('carregado_em', { ascending: false })
      .limit(1)
      .single()

    return {
      total: count ?? 0,
      ultima_atualizacao: (latest as { carregado_em: string } | null)?.carregado_em ?? null,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function inserirLoteContasPagarReceberAction(
  lote: ContaPagarReceberRaw[],
  isFirst: boolean,
  arquivoOrigem: string,
): Promise<{ inseridas: number } | { error: string }> {
  try {
    const supabase = getAdminClient()

    if (isFirst) {
      const { error } = await supabase.schema('raw').from('contas_pagar_receber').delete().neq('id', 0)
      if (error) return { error: `Erro ao limpar tabela: ${error.message}` }
    }

    const rows = lote.map(r => ({ ...r, arquivo_origem: arquivoOrigem }))
    const { error } = await supabase.schema('raw').from('contas_pagar_receber').insert(rows)
    if (error) return { error: `Erro ao inserir lote: ${error.message}` }

    return { inseridas: lote.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function finalizarContasPagarReceberAction(
  totalAntes: number,
  totalInseridas: number,
): Promise<{ sucesso: boolean; total_linhas: number; erros: string[] } | { error: string }> {
  // raw.contas_pagar_receber não tem transformação adicional por agora
  return { sucesso: true, total_linhas: totalInseridas, erros: [] }
}
