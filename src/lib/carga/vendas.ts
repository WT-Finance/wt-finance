import * as XLSX from '@e965/xlsx'
import { getAdminClient } from '@/lib/supabase/admin'
import { loadMetas } from '@/lib/carga/metas'
import { parseVendasRows, type VendaProdutoRaw } from '@/lib/carga/vendas-parser'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

// Caminho de ingestão pela API Route (upload-vendas): lê o Buffer no SERVIDOR e
// delega a transformação ao parser ÚNICO (vendas-parser.ts), o MESMO que a UI usa.
// Antes, este caminho tinha um parser próprio (casamento exato de cabeçalho, sem
// operacao_propria/passageiros/tipo_contrato) — uma carga por aqui regrediria a
// correção da v4.9.x. Agora a paridade de colunas é garantida pelo núcleo único.

function parseXlsxBuffer(buffer: Buffer, nomeArquivo: string): VendaProdutoRaw[] {
  const workbook = XLSX.read(buffer, { cellDates: true, raw: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

  if (aoa.length < 2) throw new Error('Planilha vazia ou apenas com cabeçalho')

  const { linhas } = parseVendasRows(aoa, nomeArquivo)
  return linhas
}

export interface ResultadoCargaVendas {
  sucesso:         boolean
  total_linhas:    number
  vendas_count:    number
  fato_item_count: number
  erros:           string[]
  preview: {
    antes:  { total_vendas: number }
    depois: { total_vendas: number }
  }
}

export async function carregarVendas(
  buffer: Buffer,
  nomeArquivo: string,
  modo: 'preview' | 'executar'
): Promise<ResultadoCargaVendas> {
  const supabase = getAdminClient()
  const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

  const { data: statusData } = await bound('get_upload_status')
  const totalAntes = (statusData as { vendas?: { total?: number } } | null)?.vendas?.total ?? 0

  let linhas: VendaProdutoRaw[]
  try {
    linhas = parseXlsxBuffer(buffer, nomeArquivo)
  } catch (err) {
    return erroResult(totalAntes, err instanceof Error ? err.message : String(err))
  }

  if (linhas.length === 0) {
    return erroResult(totalAntes, 'Nenhuma linha válida encontrada no arquivo')
  }

  if (modo === 'preview') {
    return {
      sucesso: true, total_linhas: linhas.length, vendas_count: 0, fato_item_count: 0, erros: [],
      preview: { antes: { total_vendas: totalAntes }, depois: { total_vendas: linhas.length } },
    }
  }

  // ── Ingestão ATÔMICA (v4.12/M1, ADR-0104): staging → validação → swap ──────────
  // A base de leitura só é tocada dentro de promover_carga_vendas (transação única).
  // Qualquer falha (validação ou transform) deixa a base ATUAL intacta.

  // 1. Carrega o raw novo na STAGING (não-destrutivo).
  const { error: limpErr } = await bound('limpar_staging_vendas')
  if (limpErr) return erroResult(totalAntes, `Erro ao preparar a carga: ${limpErr.message}`)

  const BATCH = 500
  let inseridas = 0
  for (let i = 0; i < linhas.length; i += BATCH) {
    const { error } = await bound('inserir_lote_staging', { p_linhas: linhas.slice(i, i + BATCH) })
    if (error) return erroResult(totalAntes, `Erro no batch ${Math.floor(i / BATCH) + 1}: ${error.message}`)
    inseridas += Math.min(BATCH, linhas.length - i)
  }

  // 2. Pré-validação ANTES de qualquer destruição (range de datas vs dim_data, contagem).
  const { data: valData, error: valErr } = await bound('validar_carga_staging')
  if (valErr) return erroResult(totalAntes, `Erro na validação da carga: ${valErr.message}`)
  const validacao = valData as { ok: boolean; erros?: string[] } | null
  if (!validacao?.ok) {
    return erroResult(totalAntes, (validacao?.erros ?? ['Validação da carga falhou.']).join(' '))
  }

  // 3. Metas (upsert idempotente — não destrói nada; fora da transação do swap).
  try {
    await loadMetas(false)
  } catch (err) {
    return erroResult(totalAntes, err instanceof Error ? err.message : String(err))
  }

  // 4. Swap ATÔMICO: truncate + copia staging→raw + transform + dims + refresh.
  //    Falha aqui → rollback no banco → a base NUNCA fica vazia.
  const { data: transformData, error: promoverErr } = await bound('promover_carga_vendas')
  if (promoverErr) return erroResult(totalAntes, `Erro ao promover a carga (base preservada): ${promoverErr.message}`)

  const resultado = transformData as { vendas_count: number; fato_venda_item_count: number } | null

  return {
    sucesso: true,
    total_linhas: inseridas,
    vendas_count: resultado?.vendas_count ?? 0,
    fato_item_count: resultado?.fato_venda_item_count ?? 0,
    erros: [],
    preview: {
      antes:  { total_vendas: totalAntes },
      depois: { total_vendas: resultado?.vendas_count ?? 0 },
    },
  }
}

function erroResult(totalAntes: number, msg: string): ResultadoCargaVendas {
  return {
    sucesso: false, total_linhas: 0, vendas_count: 0, fato_item_count: 0, erros: [msg],
    preview: { antes: { total_vendas: totalAntes }, depois: { total_vendas: 0 } },
  }
}
