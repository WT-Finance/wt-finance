// Parser da planilha Gerencial.
// IMPORTANTE: este módulo SÓ pode ser importado pela API Route
// (src/app/api/gerencial/import/route.ts, runtime nodejs). NÃO importar de
// Client Components nem de Server Actions — @e965/xlsx falha no SSR/RSC do
// Next.js 16 (PEND-001, v4.6). O import estático abaixo é seguro porque a API
// Route roda em Node runtime isolado do React Server Components (ADR-0091).
import * as XLSX from '@e965/xlsx'
import type { LancamentoPlanilha } from './import-types'

export type ParseResult =
  | { success: true;  lancamentos: LancamentoPlanilha[]; warnings: string[] }
  | { success: false; error: string }

export function parseGerencialExcel(buffer: ArrayBuffer): ParseResult {
  let workbook: ReturnType<typeof XLSX.read>
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  } catch {
    return { success: false, error: 'Arquivo Excel inválido ou corrompido' }
  }

  // Usa a primeira aba disponível — não exige nome específico
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { success: false, error: 'Arquivo Excel vazio (sem abas)' }
  }

  const sheet = workbook.Sheets[sheetName]
  const rows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw:    false,
    dateNF: 'yyyy-mm-dd',
    defval: null,
  })

  if (rows.length === 0)
    return { success: false, error: 'Planilha está vazia' }

  // Normaliza cabeçalhos: case-insensitive + trim
  const sample    = rows[0]
  const headers   = Object.keys(sample)
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const findCol   = (target: string) =>
    headers.find(h => normalize(h) === normalize(target)) ?? null

  const colTipo  = findCol('Tipo')
  const colPessoa = findCol('Pessoa')
  const colValor = findCol('Valor Final')
  const colVenc  = findCol('Vencimento')
  const colDesc  = findCol('Descrição') ?? findCol('Descricao')
  const colConta = findCol('Conta (Previsão)') ?? findCol('Conta (Previsao)') ?? findCol('Conta')

  const missing: string[] = []
  if (!colTipo)   missing.push('Tipo')
  if (!colPessoa) missing.push('Pessoa')
  if (!colValor)  missing.push('Valor Final')
  if (!colVenc)   missing.push('Vencimento')
  if (missing.length > 0)
    return { success: false, error: `Colunas obrigatórias faltando: ${missing.join(', ')}. Colunas encontradas: ${headers.join(', ')}` }

  const lancamentos: LancamentoPlanilha[] = []
  const warnings: string[] = []

  rows.forEach((row, idx) => {
    const tipo      = String(row[colTipo!]   ?? '').trim()
    const pessoa    = String(row[colPessoa!] ?? '').trim()
    const valorRaw  = row[colValor!]
    const descricao = colDesc  && row[colDesc]  != null ? String(row[colDesc]).trim()  || null : null
    const conta     = colConta && row[colConta] != null ? String(row[colConta]).trim() || null : null
    const vencRaw   = row[colVenc!]

    if (!tipo || !pessoa || valorRaw == null || !vencRaw) {
      warnings.push(`Linha ${idx + 2} ignorada (campos obrigatórios faltando)`)
      return
    }
    if (tipo !== 'A pagar' && tipo !== 'A receber') {
      warnings.push(`Linha ${idx + 2}: tipo inválido "${tipo}", ignorada`)
      return
    }

    const valor = Number(valorRaw)
    if (isNaN(valor) || valor < 0) {
      warnings.push(`Linha ${idx + 2}: valor inválido "${valorRaw}", ignorada`)
      return
    }

    let vencimento: string
    if (typeof vencRaw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(vencRaw)) {
      vencimento = vencRaw.slice(0, 10)
    } else if (vencRaw instanceof Date) {
      vencimento = vencRaw.toISOString().slice(0, 10)
    } else {
      warnings.push(`Linha ${idx + 2}: vencimento inválido, ignorada`)
      return
    }

    lancamentos.push({
      tipo:           tipo as 'A pagar' | 'A receber',
      pessoa,
      valor_final:    Math.round(valor * 100) / 100,
      descricao,
      conta_previsao: conta,
      vencimento,
    })
  })

  return { success: true, lancamentos, warnings }
}
