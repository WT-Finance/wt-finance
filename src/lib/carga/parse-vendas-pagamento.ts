'use client'

// Cliente-safe — sem imports de DB ou Node.js.
// Parseia "Vendas por forma de pagamento".
// Colunas obrigatórias: Venda Nº, Data Venda, Valor, Forma de Pagamento, Conta.

export interface VendasPagamentoRaw {
  venda_no:         number | null
  data_venda:       string | null
  vendedor:         string | null
  pagante:          string | null
  produto:          string | null
  setor:            string | null
  setor_macro:      string | null
  operacao_propria: string | null
  valor_bruto:      number | null
  desconto:         number | null
  valor:            number | null
  forma_pagamento:  string | null
  conta:            string | null
  data_baixa:       string | null
  parcela:          string | null
  situacao:         string | null
  observacao:       string | null
}

const COL_MAP: Record<string, keyof VendasPagamentoRaw> = {
  'Venda Nº':             'venda_no',
  'Venda N':              'venda_no',
  'Data Venda':           'data_venda',
  'Vendedor':             'vendedor',
  'Pagante':              'pagante',
  'Cliente':              'pagante',
  'Produto':              'produto',
  'Setor':                'setor',
  'Setor Macro':          'setor_macro',
  'Operação Própria':     'operacao_propria',
  'Operacao Propria':     'operacao_propria',
  'Valor Bruto':          'valor_bruto',
  'Desconto':             'desconto',
  'Valor':                'valor',
  'Valor Recebido':       'valor',
  'Forma de Pagamento':   'forma_pagamento',
  'FormaPagamento':       'forma_pagamento',
  'Conta':                'conta',
  'Data Baixa':           'data_baixa',
  'Data de Baixa':        'data_baixa',
  'Parcela':              'parcela',
  'Situação':             'situacao',
  'Situacao':             'situacao',
  'Observação':           'observacao',
  'Observacao':           'observacao',
}

const COLUNAS_OBRIGATORIAS_MAPA: Record<string, keyof VendasPagamentoRaw> = {
  'Venda Nº':           'venda_no',
  'Data Venda':         'data_venda',
  'Valor':              'valor',
  'Forma de Pagamento': 'forma_pagamento',
  'Conta':              'conta',
}

function toIsoDate(value: unknown): string | null {
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
  const n = Number(String(value).replace(',', '.').trim())
  return isNaN(n) ? null : n
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s || null
}

export async function parseVendasPagamentoFile(
  file: File,
): Promise<VendasPagamentoRaw[] | { error: string }> {
  try {
    const XLSX = await import('xlsx')
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

    // Valida colunas obrigatórias (aceita aliases via COL_MAP)
    for (const [label, campo] of Object.entries(COLUNAS_OBRIGATORIAS_MAPA)) {
      const found = headers.some(h => COL_MAP[h] === campo)
      if (!found) return { error: `Coluna obrigatória ausente: "${label}". Colunas: ${headers.join(', ')}` }
    }

    const result: VendasPagamentoRaw[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (Object.values(row).every(v => v === null || v === '')) continue

      const item: VendasPagamentoRaw = {
        venda_no: null, data_venda: null, vendedor: null, pagante: null,
        produto: null, setor: null, setor_macro: null, operacao_propria: null,
        valor_bruto: null, desconto: null, valor: null, forma_pagamento: null,
        conta: null, data_baixa: null, parcela: null, situacao: null, observacao: null,
      }

      for (const h of headers) {
        const campo = COL_MAP[h]
        if (!campo) continue
        const v = row[h]
        switch (campo) {
          case 'data_venda':
          case 'data_baixa':  item[campo] = toIsoDate(v); break
          case 'venda_no':    item.venda_no    = toNum(v) !== null ? Math.round(toNum(v)!) : null; break
          case 'valor_bruto': item.valor_bruto = toNum(v); break
          case 'desconto':    item.desconto    = toNum(v); break
          case 'valor':       item.valor       = toNum(v); break
          default: (item as unknown as Record<string, string | null>)[campo as string] = toStr(v)
        }
      }

      result.push(item)
    }

    if (result.length === 0) return { error: 'Nenhuma linha válida encontrada' }
    return result
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao processar arquivo' }
  }
}
