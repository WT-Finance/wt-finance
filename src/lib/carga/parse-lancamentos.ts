import type { LancamentoRaw } from './lancamentos'

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

export async function parseLancamentosFile(
  file: File
): Promise<LancamentoRaw[] | { error: string }> {
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

    if (rows.length === 0) return { error: 'Arquivo vazio ou sem linhas válidas' }

    const headers = Object.keys(rows[0]).map(k => k.trim())
    for (const col of COLUNAS_OBRIGATORIAS) {
      if (!headers.includes(col))
        return { error: `Coluna obrigatória ausente: "${col}". Colunas encontradas: ${headers.join(', ')}` }
    }

    const resultado: LancamentoRaw[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const operacao = toStr(row['Operacao'])
      if (!operacao) continue

      const valorRaw = toNum(row['Valor'])
      if (valorRaw === null) continue

      const tipoRaw = toStr(row['Tipo'])
      if (tipoRaw !== 'Entrada' && tipoRaw !== 'Saída') continue

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

    if (resultado.length === 0)
      return { error: 'Nenhuma linha válida encontrada no arquivo' }

    return resultado
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
