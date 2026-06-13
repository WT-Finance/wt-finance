'use client'

import { toNum, toIsoDate, toStr } from './coercao'

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

export async function parseFluxoCaixaTitulosFile(
  file: File,
): Promise<FluxoCaixaTituloRaw[] | { error: string }> {
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
