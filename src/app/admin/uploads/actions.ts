'use server'

import { carregarVendas } from '@/lib/carga/vendas'
import { getAdminClient } from '@/lib/supabase/admin'
import type { LancamentoRaw, ResultadoCarga } from '@/lib/carga/lancamentos'

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

export async function uploadVendasAction(formData: FormData) {
  try {
    const file = formData.get('file')
    const modo = (formData.get('modo') as string) ?? 'preview'

    if (!(file instanceof Blob))
      return { error: 'Campo "file" ausente ou inválido' }
    if (modo !== 'preview' && modo !== 'executar')
      return { error: 'Campo "modo" deve ser "preview" ou "executar"' }

    const fileName = file instanceof File ? file.name : 'vendas.xlsx'
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    if (ext && ext !== 'xlsx' && ext !== 'csv')
      return { error: `Formato não suportado: .${ext}. Envie .xlsx ou .csv` }

    const buffer = Buffer.from(await file.arrayBuffer())
    return await carregarVendas(buffer, fileName, modo as 'preview' | 'executar')
  } catch (err) {
    console.error('[upload-vendas]', err)
    return { error: `Erro interno: ${err instanceof Error ? err.message : String(err)}` }
  }
}
