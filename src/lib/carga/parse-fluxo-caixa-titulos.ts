'use client'

// Cliente-safe — sem imports de DB ou Node.js.
// Parseia "CAP/CAR tratada" do ERP: Fluxo de Caixa Títulos.
// 15 colunas incluindo Tipo, Status, Data_Final, Mes_Ano, Conta (Previsão).

export interface FluxoCaixaTituloRaw {
  numero:         string | null
  emissao:        string | null  // ISO date
  pessoa:         string | null
  documento:      string | null
  observacoes:    string | null
  descricao:      string | null
  conta_previsao: string | null
  vencimento:     string | null  // ISO date
  liquidacao:     string | null  // ISO date, null para futuros
  valor:          number | null
  valor_final:    number
  tipo:           'Entrada' | 'Saída'
  status:         'Entrada' | 'Saída' | 'A Receber Futuro' | 'A Pagar Futuro'
  data_final:     string  // ISO date, NOT NULL
  mes_ano:        string  // 'YYYY-MM'
}

const TIPOS_VALIDOS = new Set<string>(['Entrada', 'Saída'])
const STATUS_VALIDOS = new Set<string>(['Entrada', 'Saída', 'A Receber Futuro', 'A Pagar Futuro'])

const COL_MAP: Record<string, keyof FluxoCaixaTituloRaw> = {
  'Numero':           'numero',
  'Número':           'numero',
  'Emissao':          'emissao',
  'Emissão':          'emissao',
  'Pessoa':           'pessoa',
  'Documento':        'documento',
  'Observacoes':      'observacoes',
  'Observações':      'observacoes',
  'Descricao':        'descricao',
  'Descrição':        'descricao',
  'Conta (Previsão)': 'conta_previsao',
  'Conta (Previsao)': 'conta_previsao',
  'Conta_Previsao':   'conta_previsao',
  'Vencimento':       'vencimento',
  'Liquidacao':       'liquidacao',
  'Liquidação':       'liquidacao',
  'Valor':            'valor',
  'Valor Final':      'valor_final',
  'Valor_Final':      'valor_final',
  'Tipo':             'tipo',
  'Status':           'status',
}

const COLUNAS_OBRIGATORIAS: (keyof FluxoCaixaTituloRaw)[] = ['tipo', 'status', 'valor_final']

function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    if (d === '00' || y < 1900) return null  // Excel serial 0 / data inválida
    return `${y}-${m}-${d}`
  }
  const s = String(value).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    if (s.endsWith('-00')) return null  // Excel serial 0 / dia inválido
    return s
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/')
    if (d === '00') return null
    return `${y}-${m}-${d}`
  }
  return null
}

function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return value
  let s = String(value).trim().replace(/[R$ ]/g, '').trim()
  // BR format "8.840,00" → decimal comma; US/ERP format "8,840.00" → decimal period
  if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  const n = Number(s)
  return isNaN(n) ? null : n
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s || null
}

export async function parseFluxoCaixaTitulosFile(
  file: File,
): Promise<FluxoCaixaTituloRaw[] | { error: string }> {
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
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: false,
    })

    if (rows.length === 0) return { error: 'Arquivo vazio ou sem dados' }

    const headers = Object.keys(rows[0]).map(k => k.trim())

    for (const campo of COLUNAS_OBRIGATORIAS) {
      const found = headers.some(h => COL_MAP[h] === campo)
      if (!found) {
        return { error: `Coluna obrigatória ausente: "${campo}". Colunas encontradas: ${headers.join(', ')}` }
      }
    }

    const result: FluxoCaixaTituloRaw[] = []

    for (const row of rows) {
      // Extrair tipo e status primeiro para validação — skip silencioso se inválidos
      const tipoRaw = toStr(
        headers.reduce<unknown>((acc, h) => COL_MAP[h] === 'tipo' ? row[h] : acc, null)
      )
      const statusRaw = toStr(
        headers.reduce<unknown>((acc, h) => COL_MAP[h] === 'status' ? row[h] : acc, null)
      )

      if (!tipoRaw || !TIPOS_VALIDOS.has(tipoRaw)) continue
      if (!statusRaw || !STATUS_VALIDOS.has(statusRaw)) continue

      const tipo   = tipoRaw   as FluxoCaixaTituloRaw['tipo']
      const status = statusRaw as FluxoCaixaTituloRaw['status']

      const valorFinalRaw = toNum(
        headers.reduce<unknown>((acc, h) => COL_MAP[h] === 'valor_final' ? row[h] : acc, null)
      )
      if (valorFinalRaw === null) continue

      const item: FluxoCaixaTituloRaw = {
        numero:         null,
        emissao:        null,
        pessoa:         null,
        documento:      null,
        observacoes:    null,
        descricao:      null,
        conta_previsao: null,
        vencimento:     null,
        liquidacao:     null,
        valor:          null,
        valor_final:    valorFinalRaw,
        tipo,
        status,
        data_final:     '',
        mes_ano:        '',
      }

      for (const h of headers) {
        const campo = COL_MAP[h]
        if (!campo) continue
        // already handled
        if (campo === 'tipo' || campo === 'status' || campo === 'valor_final') continue
        const v = row[h]
        switch (campo) {
          case 'emissao':
          case 'vencimento':
          case 'liquidacao':  item[campo] = toIsoDate(v); break
          case 'valor':       item.valor = toNum(v); break
          default: (item as unknown as Record<string, string | null>)[campo as string] = toStr(v)
        }
      }

      const dataFinal = item.liquidacao ?? item.vencimento
      if (!dataFinal) continue
      item.data_final = dataFinal
      item.mes_ano    = dataFinal.slice(0, 7)

      result.push(item)
    }

    if (result.length === 0)
      return { error: 'Nenhuma linha válida encontrada (verifique se o arquivo tem colunas Tipo, Status, Data Final e Valor Final preenchidas)' }

    return result
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao processar arquivo' }
  }
}
