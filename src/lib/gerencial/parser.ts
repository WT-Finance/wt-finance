// Parser da planilha Gerencial.
// IMPORTANTE: este módulo SÓ pode ser importado pela API Route
// (src/app/api/gerencial/import/route.ts, runtime nodejs). NÃO importar de
// Client Components nem de Server Actions — @e965/xlsx falha no SSR/RSC do
// Next.js 16 (PEND-001, v4.6). O import estático abaixo é seguro porque a API
// Route roda em Node runtime isolado do React Server Components (ADR-0091).
import * as XLSX from '@e965/xlsx'
import type { LancamentoPlanilha } from './import-types'
import { toNum } from '@/lib/carga/coercao'

export type ParseResult =
  | { success: true;  lancamentos: LancamentoPlanilha[]; warnings: string[] }
  | { success: false; error: string }

// Conversão de valor monetário CONVERGIU ao toNum canônico (@/lib/carga/coercao) na
// v4.27/M2 — o parseValorMonetario local foi REMOVIDO (era um 2º parser de dinheiro).
// O toNum desambigua BR/US e, desde a v4.27, trata negativo entre parênteses
// ("(1.000)"→-1000), cobrindo tudo o que o parser local fazia — provado em
// coercao.test.ts contra o oráculo congelado parseValorMonetarioLegado. (ADR-0130)

// Normaliza o tipo do lançamento de forma tolerante a caixa/acentos/variações.
// Aceita: 'A pagar', 'A Pagar', 'a pagar', 'Pagar', 'Saída', 'Despesa' → 'A pagar'
//         'A receber', 'A Receber', 'Receber', 'Entrada', 'Receita'   → 'A receber'
export function parseTipo(raw: unknown): 'A pagar' | 'A receber' | null {
  if (raw == null) return null
  const s = String(raw).trim().toLowerCase()
  if (!s) return null
  if (/recebe|receita|entrada|crédito|credito|receb/.test(s)) return 'A receber'
  if (/pagar|despesa|saída|saida|débito|debito|pagam/.test(s)) return 'A pagar'
  return null
}

// Converte ISO (UTC-safe) a partir de componentes de calendário.
function montarISO(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  if (ano < 1900 || ano > 2200) return null
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// Parser robusto de vencimento. Aceita:
//   - Date object (usa componentes UTC — Vercel roda em UTC, Brasil é UTC-3)
//   - número serial do Excel (defensivo, caso cellDates não converta)
//   - ISO 'YYYY-MM-DD' (+ hora opcional)
//   - BR 'DD/MM/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY' (+ ano 2 dígitos)
//   - US 'MM/DD/YYYY' (desambiguado quando 1º campo > 12)
// Default BR (DD/MM) quando ambíguo — empresa brasileira.
export function parseVencimento(raw: unknown): string | null {
  if (raw == null) return null

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null
    return montarISO(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate())
  }

  if (typeof raw === 'number') {
    if (!isFinite(raw) || raw <= 0) return null
    // Serial do Excel: dias desde 1899-12-30 (epoch 1900 com bug do ano bissexto)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000)
    if (isNaN(d.getTime())) return null
    return montarISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  }

  const s = String(raw).trim()
  if (!s) return null

  // ISO: YYYY-MM-DD (com hora opcional)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return montarISO(+m[1], +m[2], +m[3])

  // YYYY/MM/DD
  m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})/)
  if (m) return montarISO(+m[1], +m[2], +m[3])

  // DD/MM/YYYY | DD-MM-YYYY | DD.MM.YYYY (+ ano 2 dígitos)
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (m) {
    const a = +m[1], b = +m[2]   // a = 1º campo, b = 2º campo
    let ano = +m[3]
    if (ano < 100) ano += 2000
    let dia: number, mes: number
    if (a > 12 && b <= 12)      { dia = a; mes = b }   // claramente DD/MM
    else if (b > 12 && a <= 12) { dia = b; mes = a }   // claramente MM/DD (US)
    else                        { dia = a; mes = b }   // ambíguo → BR (DD/MM)
    return montarISO(ano, mes, dia)
  }

  return null
}

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
  // Leitura PRINCIPAL com raw:false → reformata células para a string de exibição.
  // É de propósito: o toNum espera strings tipo "R$ 8.840,00"; tipo,
  // pessoa, descrição e conta também vêm como string aqui.
  const rows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw:    false,
    dateNF: 'yyyy-mm-dd',
    defval: null,
  })

  // Leitura PARALELA com raw:true → preserva o tipo NATIVO de cada célula. Com
  // cellDates:true no XLSX.read, células de data chegam como Date (sem ambiguidade
  // de locale). Usada APENAS para a coluna Vencimento, casada por índice de linha
  // (ambas as leituras usam o mesmo sheet + defval:null → emitem as MESMAS linhas
  // na MESMA ordem). Corrige a inversão dia/mês: o raw:false reformatava datas para
  // o padrão americano mm-dd-yy da planilha, e o fallback de string assumia DD/MM no
  // caso ambíguo (≤12/≤12), invertendo junho 1–12. (v4.9 M4)
  const rowsRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw:    true,
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

  // mostra valor cru + tipo do dado, para diagnóstico de formatos inesperados
  const diag = (v: unknown) => `"${String(v)}" (${v instanceof Date ? 'Date' : typeof v})`

  rows.forEach((row, idx) => {
    const linha     = idx + 2
    const pessoa    = String(row[colPessoa!] ?? '').trim()
    const tipoRaw   = row[colTipo!]
    const valorRaw  = row[colValor!]
    // Vencimento vem da leitura raw:true (Date nativo, sem ambiguidade de locale),
    // casado por índice. Fallback para a versão string (raw:false) caso a célula
    // não tenha valor nativo de data (ex.: data digitada como texto puro) — nesse
    // caso parseVencimento usa a heurística de string (default BR).
    const vencRawNativo = rowsRaw[idx]?.[colVenc!]
    const vencRaw   = vencRawNativo ?? row[colVenc!]
    const descricao = colDesc  && row[colDesc]  != null ? String(row[colDesc]).trim()  || null : null
    const conta     = colConta && row[colConta] != null ? String(row[colConta]).trim() || null : null

    // Campos obrigatórios presentes?
    if (tipoRaw == null || !pessoa || valorRaw == null || vencRaw == null) {
      warnings.push(`Linha ${linha} ignorada (campos obrigatórios faltando)`)
      return
    }

    const tipo = parseTipo(tipoRaw)
    if (!tipo) {
      warnings.push(`Linha ${linha}: tipo inválido ${diag(tipoRaw)}, ignorada`)
      return
    }

    const valor = toNum(valorRaw)
    if (valor == null || valor < 0) {
      warnings.push(`Linha ${linha}: valor inválido ${diag(valorRaw)}, ignorada`)
      return
    }

    const vencimento = parseVencimento(vencRaw)
    if (!vencimento) {
      warnings.push(`Linha ${linha}: vencimento inválido ${diag(vencRaw)}, ignorada`)
      return
    }

    lancamentos.push({
      tipo,
      pessoa,
      valor_final:    Math.round(valor * 100) / 100,
      descricao,
      conta_previsao: conta,
      vencimento,
    })
  })

  return { success: true, lancamentos, warnings }
}
