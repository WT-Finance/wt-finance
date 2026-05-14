import * as XLSX from 'xlsx'
import { getAdminClient } from '@/lib/supabase/admin'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

export interface LancamentoRaw {
  lancamento_n:  number | null
  venda_n:       number | null
  pessoa:        string | null
  descricao:     string | null
  liquidacao_dt: string | null
  vencimento_dt: string | null
  valor:         number
  tipo:          'Entrada' | 'Saída'
  operacao:      string
  status:        string | null
  data_final:    string | null
  mes_ano:       string | null
}

export interface ResultadoCarga {
  sucesso:      boolean
  total_linhas: number
  erros:        string[]
  preview: {
    antes:  { total_lancamentos: number }
    depois: { total_lancamentos: number }
  }
}

const COLUNAS_OBRIGATORIAS = ['Operacao', 'Valor', 'Tipo']

function toDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(value).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/')
    return `${y}-${m}-${d}`
  }
  return null
}

function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(String(value).replace(',', '.'))
  return isNaN(n) ? null : n
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s || null
}

function parseCsvBuffer(buffer: Buffer): LancamentoRaw[] {
  // Decodifica como UTF-8 antes de passar ao SheetJS — sem isso, CSV UTF-8 é
  // interpretado como Latin-1, corrompendo acentos ("Saída" → "SaÃ­da")
  const workbook = XLSX.read(buffer.toString('utf-8'), { type: 'string', cellDates: true, raw: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

  if (rows.length === 0) return []

  const headers = Object.keys(rows[0]).map(k => k.trim())

  for (const col of COLUNAS_OBRIGATORIAS) {
    if (!headers.includes(col)) {
      throw new Error(`Coluna obrigatória ausente: "${col}". Colunas encontradas: ${headers.join(', ')}`)
    }
  }

  const resultado: LancamentoRaw[] = []
  const erros: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const linhaCsv = i + 2

    const operacao = toStr(row['Operacao'])
    if (!operacao) { erros.push(`Linha ${linhaCsv}: Operacao vazia, ignorada`); continue }

    const valorRaw = toNum(row['Valor'])
    if (valorRaw === null) { erros.push(`Linha ${linhaCsv}: Valor inválido "${row['Valor']}", ignorada`); continue }

    const tipoRaw = toStr(row['Tipo'])
    if (tipoRaw !== 'Entrada' && tipoRaw !== 'Saída') {
      erros.push(`Linha ${linhaCsv}: Tipo inválido "${tipoRaw}", ignorada`)
      continue
    }

    resultado.push({
      lancamento_n:  toNum(row['Lançamento.N.']),
      venda_n:       toNum(row['Venda.N.']),
      pessoa:        toStr(row['Pessoa']),
      descricao:     toStr(row['Descrição']),
      liquidacao_dt: toDate(row['Liquidação']),
      vencimento_dt: toDate(row['Vencimento']),
      valor:         Math.abs(valorRaw),
      tipo:          tipoRaw,
      operacao,
      status:        toStr(row['Status']) || null,
      data_final:    toDate(row['Data_Final']),
      mes_ano:       toStr(row['Mes_Ano']),
    })
  }

  if (erros.length > 0) {
    console.warn(`[lancamentos] ${erros.length} linhas com erros ignoradas`)
  }

  return resultado
}

export async function carregarLancamentos(
  buffer: Buffer,
  modo: 'preview' | 'executar'
): Promise<ResultadoCarga> {
  const supabase = getAdminClient()
  const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

  const { data: statusData } = await bound('get_upload_status')
  const status = statusData as { lancamentos: { total: number } } | null
  const totalAntes = status?.lancamentos?.total ?? 0

  let linhas: LancamentoRaw[]
  try {
    linhas = parseCsvBuffer(buffer)
  } catch (err) {
    return erroResult(totalAntes, err instanceof Error ? err.message : String(err))
  }

  if (linhas.length === 0) {
    return erroResult(totalAntes, 'Nenhuma linha válida encontrada no arquivo')
  }

  if (modo === 'preview') {
    return {
      sucesso: true,
      total_linhas: linhas.length,
      erros: [],
      preview: {
        antes:  { total_lancamentos: totalAntes },
        depois: { total_lancamentos: linhas.length },
      },
    }
  }

  const { error: truncErr } = await bound('truncar_lancamentos')
  if (truncErr) return erroResult(totalAntes, `Erro ao limpar tabela: ${truncErr.message}`)

  const BATCH = 1000
  let inseridas = 0

  for (let i = 0; i < linhas.length; i += BATCH) {
    const lote = linhas.slice(i, i + BATCH)
    const { error } = await bound('inserir_lote_lancamentos', { p_linhas: lote })
    if (error) return erroResult(inseridas, `Erro ao inserir batch ${Math.floor(i / BATCH) + 1}: ${error.message}`)
    inseridas += lote.length
  }

  const { error: dimErr } = await bound('regenerar_dim_operacao_weddings')
  if (dimErr) {
    console.error('[lancamentos] Erro ao regenerar dim_operacao_weddings:', dimErr.message)
  }

  return {
    sucesso: true,
    total_linhas: inseridas,
    erros: [],
    preview: {
      antes:  { total_lancamentos: totalAntes },
      depois: { total_lancamentos: inseridas },
    },
  }
}

function erroResult(totalAntes: number, msg: string): ResultadoCarga {
  return {
    sucesso: false,
    total_linhas: 0,
    erros: [msg],
    preview: { antes: { total_lancamentos: totalAntes }, depois: { total_lancamentos: 0 } },
  }
}
