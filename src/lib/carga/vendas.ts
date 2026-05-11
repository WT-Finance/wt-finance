import * as XLSX from 'xlsx'
import { getAdminClient } from '@/lib/supabase/admin'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

interface LinhaRaw {
  arquivo_origem: string
  linha_origem:   number
  venda_numero:   string | null
  data_venda:     string | null
  vendedor:       string | null
  pagante:        string | null
  setor_macro:    string | null
  setor:          string | null
  setor_micro:    string | null
  produto:        string | null
  valor_total:    string | null
  receitas:       string | null
  contrato:       string | null
  taxa_servico:   string | null
  semana:         string | null
  mes:            string | null
}

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
}

function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
  }
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return null
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split('/')
      return `${y}-${m}-${d}`
    }
    return s
  }
  return null
}

function toBoolean(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'boolean') return String(v)
  const s = String(v).toLowerCase().trim()
  if (s === 'sim' || s === 'true' || s === '1' || s === 's') return 'true'
  if (s === 'não' || s === 'nao' || s === 'false' || s === '0' || s === 'n') return 'false'
  return null
}

function toNumStr(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n.toFixed(2)
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s || null
}

function parseXlsxBuffer(buffer: Buffer, nomeArquivo: string): LinhaRaw[] {
  const workbook = XLSX.read(buffer, { cellDates: true, raw: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

  if (rows.length < 2) throw new Error('Planilha vazia ou apenas com cabeçalho')

  const headers = (rows[0] as unknown[]).map(h => (h === null ? '' : String(h).trim()))
  const result: LinhaRaw[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (row.every(c => c === null || c === '')) continue

    const raw: Partial<LinhaRaw> = { arquivo_origem: nomeArquivo, linha_origem: i + 1 }

    for (let j = 0; j < headers.length; j++) {
      const campo = COL_MAP[headers[j]]
      if (!campo) continue
      const v = row[j]
      switch (campo) {
        case 'data_venda':    raw.data_venda  = toIsoDate(v); break
        case 'contrato':      raw.contrato    = toBoolean(v); break
        case 'taxa_servico':  raw.taxa_servico= toBoolean(v); break
        case 'valor_total':   raw.valor_total = toNumStr(v);  break
        case 'receitas':      raw.receitas    = toNumStr(v);  break
        case 'semana':        raw.semana = v !== null && v !== '' ? String(Math.round(Number(v))) : null; break
        default: (raw as Record<string, string | null>)[campo] = toStr(v)
      }
    }
    result.push(raw as LinhaRaw)
  }
  return result
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

  const { count: countAntes } = await supabase
    .schema('analytics')
    .from('fato_venda')
    .select('*', { count: 'exact', head: true })

  const totalAntes = countAntes ?? 0

  let linhas: LinhaRaw[]
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

  const { error: truncErr } = await bound('truncate_dynamic_tables')
  if (truncErr) return erroResult(totalAntes, `Erro ao truncar tabelas: ${truncErr.message}`)

  const BATCH = 500
  let inseridas = 0
  for (let i = 0; i < linhas.length; i += BATCH) {
    const { error } = await bound('inserir_lote_raw', { p_linhas: linhas.slice(i, i + BATCH) })
    if (error) return erroResult(inseridas, `Erro no batch ${Math.floor(i / BATCH) + 1}: ${error.message}`)
    inseridas += Math.min(BATCH, linhas.length - i)
  }

  const { data: transformData, error: transformErr } = await bound('transform_raw_to_analytics')
  if (transformErr) return erroResult(inseridas, `Erro na transformação: ${transformErr.message}`)

  const resultado = transformData as { vendas_count: number; fato_venda_item_count: number } | null

  await bound('refresh_all_materialized_views')

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
