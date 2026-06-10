'use client'

// Caminho de ingestão pela UI (/admin/uploads): lê o File no BROWSER e delega a
// transformação ao parser ÚNICO (vendas-parser.ts), compartilhado com a via servidor
// (carga/vendas.ts). Cliente-safe — sem imports de DB/Node.js. Retorna
// VendaProdutoRaw[] para envio via Server Actions em lotes.
//
// Re-exporta tipo e helpers do núcleo para não quebrar importadores existentes.

import { parseVendasRows, type VendaProdutoRaw } from './vendas-parser'

export type { VendaProdutoRaw } from './vendas-parser'
export { normalizeHeader, toIsoDate } from './vendas-parser'

export async function parseVendasProdutoFile(
  file: File,
): Promise<VendaProdutoRaw[] | { error: string }> {
  try {
    const XLSX = await import('@e965/xlsx')
    const ext = file.name.split('.').pop()?.toLowerCase()

    let workbook: ReturnType<typeof XLSX.read>
    if (ext === 'csv') {
      const text = await file.text()
      workbook = XLSX.read(text, { type: 'string', cellDates: true, raw: false })
    } else {
      const buffer = await file.arrayBuffer()
      workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false })
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })
    if (aoa.length < 2) return { error: 'Arquivo vazio ou sem dados' }

    const { linhas } = parseVendasRows(aoa, file.name)
    if (linhas.length === 0) return { error: 'Nenhuma linha válida encontrada' }
    return linhas
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao processar arquivo' }
  }
}
