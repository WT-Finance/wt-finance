'use client'

// Calculadora de Rateio (v4.28.0) — leitura da fatura no BROWSER.
//
// Reusa o padrão de src/lib/carga/parse-vendas-produto.ts: @e965/xlsx via
// `await import` (cliente-safe), XLSX.read({ cellDates:true }) + sheet_to_json
// (array-of-arrays, header:1). A fatura é minúscula (~41 linhas) → SEM Web Worker.
// O arquivo NÃO sobe ao servidor: só os números distintos viajam (na server action).
//
// Detecção de coluna por NOME EXATO 'Venda Nº' e 'Valor' (a ordem/presença das
// OUTRAS colunas varia por usuário). Faltou uma → `faltando` preenchido (a UI
// mostra mensagem clara, não quebra). Coerção pelo módulo CANÔNICO (toNum):
// Venda Nº → inteiro → String (casa com venda_no text da base, sem zero à esq.);
// Valor → BRL com sinal (a fatura é negativa). Nada de reimplementar coerção.

import { toNum } from '@/lib/carga/coercao'
import type { LinhaFatura, ParseFaturaResult } from './tipos'

const COL_VENDA = 'Venda Nº'
const COL_VALOR = 'Valor'

export async function parseFaturaRateioFile(
  file: File,
): Promise<ParseFaturaResult | { error: string }> {
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
    if (aoa.length < 2) return { error: 'Arquivo vazio ou sem dados.' }

    const headers = (aoa[0] as unknown[]).map(h => String(h ?? '').trim())
    const idxVenda = headers.indexOf(COL_VENDA)
    const idxValor = headers.indexOf(COL_VALOR)

    const faltando: string[] = []
    if (idxVenda === -1) faltando.push(COL_VENDA)
    if (idxValor === -1) faltando.push(COL_VALOR)
    if (faltando.length > 0) return { linhas: [], faltando }

    const linhas: LinhaFatura[] = []
    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i] as unknown[]
      if (!row || row.every(c => c === null || c === '')) continue
      const nVenda = toNum(row[idxVenda])
      const venda_numero = nVenda === null ? null : String(Math.trunc(nVenda))
      const valor = toNum(row[idxValor])  // BRL com sinal (negativo = saída)
      linhas.push({ linha: i + 1, venda_numero, valor })
    }

    return { linhas, faltando: [] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao processar o arquivo.' }
  }
}
