import type { LancamentoRaw } from './lancamentos'
import { toNum, toIsoDate as toDate, toStr } from './coercao'

const COLUNAS_OBRIGATORIAS = ['Operacao', 'Valor', 'Tipo']

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
