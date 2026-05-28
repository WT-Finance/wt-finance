/**
 * parse-excel.ts
 *
 * Lê um arquivo .xlsx e retorna as linhas no formato esperado por inserir_lote_raw().
 * Usa SheetJS com cellDates:true para converter serial de data do Excel em Date JS.
 */

import * as XLSX from '@e965/xlsx'
import * as path from 'path'

export interface LinhaRaw {
  arquivo_origem: string
  linha_origem: number
  venda_numero: string | null
  data_venda: string | null          // ISO 'YYYY-MM-DD'
  vendedor: string | null
  pagante: string | null
  setor_macro: string | null
  setor: string | null
  setor_micro: string | null
  produto: string | null
  valor_total: string | null         // string para o SQL fazer o cast
  receitas: string | null
  contrato: string | null            // 'true' | 'false'
  taxa_servico: string | null
  semana: string | null
  mes: string | null
  data_inicio_evento: string | null  // ADR-0027: data canônica do casamento (ISO)
  fornecedor: string | null          // ADR-0029: hotel onde o casamento ocorre
  situacao: string | null            // ADR-0034: 'Aberta' | 'Fechada' | null
}

// Mapeamento entre os cabeçalhos do Excel e os campos internos
// Ajuste aqui se o Excel vier com nomes ligeiramente diferentes
const COL_MAP: Record<string, keyof LinhaRaw> = {
  'Venda Nº':        'venda_numero',
  'Data Venda':      'data_venda',
  'Vendedor':        'vendedor',
  'Pagante':         'pagante',
  'Setor Macro':     'setor_macro',
  'Setor':           'setor',
  'Setor Micro':     'setor_micro',
  'Produto':         'produto',
  'Valor Total':     'valor_total',
  'Receitas':        'receitas',
  'Contrato':        'contrato',
  'Taxa de Serviço': 'taxa_servico',
  'Semana':          'semana',
  'Mês':             'mes',
  'Data de Início':  'data_inicio_evento',
  'Fornecedor':      'fornecedor',
  'Situação':        'situacao',
}

function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null

  if (value instanceof Date) {
    // SheetJS retornou um Date JS
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  if (typeof value === 'number') {
    // Serial numérico do Excel: converte via SheetJS
    const date = XLSX.SSF.parse_date_code(value)
    const m = String(date.m).padStart(2, '0')
    const d = String(date.d).padStart(2, '0')
    return `${date.y}-${m}-${d}`
  }

  if (typeof value === 'string') {
    const s = value.trim()
    if (s === '') return null
    // Aceita DD/MM/YYYY ou YYYY-MM-DD
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [day, month, year] = s.split('/')
      return `${year}-${month}-${day}`
    }
    return s
  }

  return null
}

function toBoolean(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return String(value)
  const s = String(value).toLowerCase().trim()
  if (s === 'sim' || s === 'true' || s === '1' || s === 's') return 'true'
  if (s === 'não' || s === 'nao' || s === 'false' || s === '0' || s === 'n') return 'false'
  return null
}

function toNumericStr(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (isNaN(n)) return null
  return n.toFixed(2)
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

export function parseExcel(filePath: string): LinhaRaw[] {
  const nomeArquivo = path.basename(filePath)
  const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error(`Arquivo ${nomeArquivo} não tem abas`)

  const sheet = workbook.Sheets[sheetName]
  // header: 1 → array de arrays; row 0 = cabeçalhos
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

  if (rows.length < 2) {
    console.warn(`  [aviso] ${nomeArquivo}: planilha vazia ou só cabeçalho`)
    return []
  }

  const headers = (rows[0] as unknown[]).map(h => (h === null ? '' : String(h).trim()))

  const result: LinhaRaw[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]

    // Pula linhas completamente vazias
    if (row.every(c => c === null || c === '')) continue

    const raw: Partial<LinhaRaw> = {
      arquivo_origem: nomeArquivo,
      linha_origem: i + 1, // +1 porque linha 1 = cabeçalho
    }

    for (let j = 0; j < headers.length; j++) {
      const colName = headers[j]
      const campo = COL_MAP[colName]
      if (!campo) continue

      const value = row[j]

      switch (campo) {
        case 'data_venda':
        case 'data_inicio_evento':
          raw[campo] = toIsoDate(value)
          break
        case 'contrato':
        case 'taxa_servico':
          raw[campo] = toBoolean(value)
          break
        case 'valor_total':
        case 'receitas':
          raw[campo] = toNumericStr(value)
          break
        case 'semana':
          raw.semana = value !== null && value !== '' ? String(Math.round(Number(value))) : null
          break
        case 'situacao': {
          const s = toStr(value)
          if (s === null) { raw.situacao = null; break }
          const norm = s.trim()
          raw.situacao = norm === 'Aberta' || norm === 'Fechada' ? norm : null
          break
        }
        default:
          ;(raw as Record<string, string | null>)[campo] = toStr(value)
      }
    }

    result.push(raw as LinhaRaw)
  }

  return result
}
