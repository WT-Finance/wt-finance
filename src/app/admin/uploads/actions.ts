'use server'

import { loadMetas } from '@/lib/carga/metas'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAreaAction } from '@/lib/auth/sessao'
import { parseRpc, cargaValidacaoSchema, cargaPromocaoSchema } from '@/lib/schemas-rpc'
import type { LancamentoRaw, ResultadoCarga } from '@/lib/carga/lancamentos'
import type { VendaProdutoRaw } from '@/lib/carga/parse-vendas-produto'
import type { LancamentoFinanceiroRaw } from '@/lib/carga/parse-lancamentos-financeiro'
import type { FluxoCaixaTituloRaw } from '@/lib/carga/parse-fluxo-caixa-titulos'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

export async function getLancamentosStatusAction(): Promise<{ total: number } | { error: string }> {
  // Guard ANTES do try: negação de permissão deve lançar, não virar erro amigável.
  await requireAreaAction('admin/uploads')
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
  await requireAreaAction('admin/uploads')
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
  await requireAreaAction('admin/uploads')
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
  await requireAreaAction('admin/uploads')
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
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    // v4.15.0 (F2-real, ADR-0104): caminho real migrado ao pipeline ATÔMICO (0116/0118).
    // NÃO trunca a base aqui (era `truncate_dynamic_tables` ANTES do transform → base
    // ficava vazia se o transform falhasse). Em vez disso: limpa a STAGING (não-destrutivo)
    // no 1º lote e carrega nela. O swap destrutivo só ocorre em finalizar → promover_carga_vendas,
    // numa transação única. As metas saem daqui e vão para finalizar (após a validação passar).
    if (isFirst) {
      const { error: limpErr } = await bound('limpar_staging_vendas')
      if (limpErr) return { error: `Erro ao preparar a carga: ${limpErr.message}` }
    }

    const { error } = await bound('inserir_lote_staging', { p_linhas: lote })
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
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    // v4.15.0 (F2-real, ADR-0104): validação NÃO-destrutiva → metas → swap ATÔMICO.
    // 1. Pré-validação ANTES de qualquer destruição (range de datas vs dim_data, contagem).
    //    Erro de RPC ou validação reprovada → mensagem explícita; a base atual fica intacta.
    const valRes = await bound('validar_carga_staging')
    if (valRes.error) return { error: `Erro na validação da carga: ${valRes.error.message}. A base atual foi preservada.` }
    const validacao = parseRpc(cargaValidacaoSchema, valRes, 'validar_carga_staging')
    if (!validacao) return { error: 'A validação retornou em formato inesperado. A base atual foi preservada.' }
    if (!validacao.ok) {
      const msgs = validacao.erros.length ? validacao.erros : ['Validação da carga falhou.']
      return { error: `${msgs.join(' ')} A base atual foi preservada.` }
    }

    // 2. Metas (upsert idempotente — fora da transação do swap; só após validar).
    try { await loadMetas(false) } catch (e) {
      return { error: `Erro ao carregar metas: ${e instanceof Error ? e.message : String(e)}` }
    }

    // 3. Swap ATÔMICO: truncate + copia staging→raw + transform + dims + refresh, tudo numa
    //    transação. Falha aqui → ROLLBACK no banco → a base de leitura NUNCA fica vazia.
    const promRes = await bound('promover_carga_vendas')
    if (promRes.error) return { error: `Erro ao promover a carga (base preservada): ${promRes.error.message}` }
    const promocao = parseRpc(cargaPromocaoSchema, promRes, 'promover_carga_vendas')
    if (!promocao) return { error: 'A promoção retornou em formato inesperado.' }

    return {
      sucesso: true,
      total_linhas: totalInseridas,
      vendas_count: promocao.vendas_count,
      fato_item_count: promocao.fato_venda_item_count,
      erros: [],
      preview: {
        antes:  { total_vendas: totalAntes },
        depois: { total_vendas: promocao.vendas_count },
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Lançamentos por Categoria (raw.lancamentos financeiro → financeiro.fato_lancamentos)
// Migrado de uploads/financeiro na unificação v4.8 (batch 500; finaliza com
// regenerar_financeiro_lancamentos).
// ---------------------------------------------------------------------------

export async function getLancamentosFinanceiroStatusAction(): Promise<
  { total: number; ultima_atualizacao: string | null } | { error: string }
> {
  await requireAreaAction('admin/uploads')
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
  await requireAreaAction('admin/uploads')
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
  await requireAreaAction('admin/uploads')
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
// Fluxo de Caixa CAP/CAR tratada (raw.fluxo_caixa_titulos)
// Migrado de uploads/financeiro na unificação v4.8 (batch 500; sem transformação
// pós-insert).
// ---------------------------------------------------------------------------

export async function getFluxoCaixaTitulosStatusAction(): Promise<
  { total: number; ultima_atualizacao: string | null } | { error: string }
> {
  await requireAreaAction('admin/uploads')
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
  await requireAreaAction('admin/uploads')
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
  await requireAreaAction('admin/uploads')
  // raw.fluxo_caixa_titulos não tem transformação adicional por agora
  return { sucesso: true, total_linhas: totalInseridas, erros: [] }
}
