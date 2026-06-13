'use client'

import { toNum, toIsoDate, toStr } from './coercao'

// Cliente-safe — sem imports de DB ou Node.js.
// Parseia CAP/CAR (Contas a Pagar e Receber).
// Yan pré-trata a planilha antes do upload adicionando coluna tipo_movimento (A_RECEBER/A_PAGAR).

export interface ContaPagarReceberRaw {
  tipo_movimento:  'A_RECEBER' | 'A_PAGAR'
  numero:          string | null
  venda_no:        number | null
  emissao:         string | null
  vencimento:      string | null
  liquidacao:      string | null
  valor:           number | null
  valor_final:     number | null
  descricao:       string | null
  categoria:       string | null
  grupo_categoria: string | null
  conta:           string | null
  pessoa:          string | null
  fatura_cliente_no: string | null
  observacoes:     string | null
  conferido:       boolean | null
  operacao_propria: string | null
}

const COL_MAP: Record<string, keyof ContaPagarReceberRaw> = {
  'Tipo Movimento':       'tipo_movimento',
  'TipoMovimento':        'tipo_movimento',
  'tipo_movimento':       'tipo_movimento',
  'Número':               'numero',
  'Numero':               'numero',
  'Venda Nº':             'venda_no',
  'Venda.N.':             'venda_no',
  'Emissão':              'emissao',
  'Emissao':              'emissao',
  'Vencimento':           'vencimento',
  'Liquidação':           'liquidacao',
  'Liquidacao':           'liquidacao',
  'Valor':                'valor',
  'Valor Final':          'valor_final',
  'Descrição':            'descricao',
  'Descricao':            'descricao',
  'Categoria':            'categoria',
  'Grupo de Categoria':   'grupo_categoria',
  'GrupoCategoria':       'grupo_categoria',
  'Grupo Categoria':      'grupo_categoria',
  'Conta':                'conta',
  'Pessoa':               'pessoa',
  'Fatura Cliente Nº':    'fatura_cliente_no',
  'FaturaClienteNo':      'fatura_cliente_no',
  'Observações':          'observacoes',
  'Observacoes':          'observacoes',
  'Conferido':            'conferido',
  'Operação Própria':     'operacao_propria',
  'Operacao Propria':     'operacao_propria',
}

function toBool(value: unknown): boolean | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value
  const s = String(value).toLowerCase().trim()
  if (s === 'sim' || s === 'true' || s === '1' || s === 's') return true
  if (s === 'não' || s === 'nao' || s === 'false' || s === '0' || s === 'n') return false
  return null
}

function toTipoMovimento(value: unknown): 'A_RECEBER' | 'A_PAGAR' | null {
  const s = toStr(value)?.toUpperCase()
  if (s === 'A_RECEBER' || s === 'A RECEBER' || s === 'RECEBER') return 'A_RECEBER'
  if (s === 'A_PAGAR' || s === 'A PAGAR' || s === 'PAGAR') return 'A_PAGAR'
  return null
}

export async function parseContasPagarReceberFile(
  file: File,
): Promise<ContaPagarReceberRaw[] | { error: string }> {
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
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
    if (rows.length === 0) return { error: 'Arquivo vazio ou sem dados' }

    const headers = Object.keys(rows[0]).map(k => k.trim())

    const hasTipoMovimento = headers.some(h => COL_MAP[h] === 'tipo_movimento')
    if (!hasTipoMovimento) {
      return { error: 'Coluna "Tipo Movimento" ausente. Adicione a coluna antes do upload (A_RECEBER ou A_PAGAR por linha).' }
    }

    const result: ContaPagarReceberRaw[] = []
    const invalidas: number[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (Object.values(row).every(v => v === null || v === '')) continue

      const tipoKey = headers.find(h => COL_MAP[h] === 'tipo_movimento')!
      const tipo = toTipoMovimento(row[tipoKey])
      if (!tipo) { invalidas.push(i + 2); continue }

      const item: ContaPagarReceberRaw = {
        tipo_movimento: tipo,
        numero: null, venda_no: null, emissao: null, vencimento: null, liquidacao: null,
        valor: null, valor_final: null, descricao: null, categoria: null,
        grupo_categoria: null, conta: null, pessoa: null, fatura_cliente_no: null,
        observacoes: null, conferido: null, operacao_propria: null,
      }

      for (const h of headers) {
        const campo = COL_MAP[h]
        if (!campo || campo === 'tipo_movimento') continue
        const v = row[h]
        switch (campo) {
          case 'emissao':
          case 'vencimento':
          case 'liquidacao':       item[campo] = toIsoDate(v); break
          case 'venda_no':         item.venda_no = toNum(v) !== null ? Math.round(toNum(v)!) : null; break
          case 'valor':            item.valor      = toNum(v); break
          case 'valor_final':      item.valor_final = toNum(v); break
          case 'conferido':        item.conferido  = toBool(v); break
          default: (item as unknown as Record<string, string | null>)[campo as string] = toStr(v)
        }
      }

      result.push(item)
    }

    if (invalidas.length > 0)
      console.warn(`[cpr] ${invalidas.length} linhas com tipo_movimento inválido ignoradas (linhas ${invalidas.slice(0, 5).join(', ')}...)`)

    if (result.length === 0) return { error: 'Nenhuma linha válida encontrada' }
    return result
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao processar arquivo' }
  }
}
