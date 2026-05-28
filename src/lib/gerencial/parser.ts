// Usa importação dinâmica — mesmo padrão dos parsers de lib/carga/*.ts
// Não use `import * as XLSX from '@e965/xlsx'` estático aqui: este arquivo é
// consumido por Server Actions e o xlsx estático falha no ambiente serverless
// do Vercel. A importação dinâmica resolve o módulo apenas quando chamado
// (no browser ou no servidor, conforme o contexto de quem chama).

export interface LancamentoPlanilha {
  tipo:           'A pagar' | 'A receber'
  pessoa:         string
  valor_final:    number
  descricao:      string | null
  conta_previsao: string | null
  vencimento:     string  // YYYY-MM-DD
}

export type ParseResult =
  | { success: true;  lancamentos: LancamentoPlanilha[]; warnings: string[] }
  | { success: false; error: string }

export async function parseGerencialExcel(buffer: ArrayBuffer): Promise<ParseResult> {
  const XLSX = await import('@e965/xlsx')

  let workbook: ReturnType<typeof XLSX.read>
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  } catch {
    return { success: false, error: 'Arquivo Excel inválido ou corrompido' }
  }

  const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'monde')
  if (!sheetName) {
    return {
      success: false,
      error: `Aba "Monde" não encontrada. Abas disponíveis: ${workbook.SheetNames.join(', ')}`,
    }
  }

  const sheet = workbook.Sheets[sheetName]
  const rows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw:    false,
    dateNF: 'yyyy-mm-dd',
    defval: null,
  })

  if (rows.length === 0)
    return { success: false, error: 'Aba Monde está vazia' }

  const sample   = rows[0]
  const required = ['Tipo', 'Pessoa', 'Valor Final', 'Vencimento']
  const missing  = required.filter(c => !(c in sample))
  if (missing.length > 0)
    return { success: false, error: `Colunas obrigatórias faltando: ${missing.join(', ')}` }

  const lancamentos: LancamentoPlanilha[] = []
  const warnings: string[] = []

  rows.forEach((row, idx) => {
    const tipo     = String(row['Tipo']           ?? '').trim()
    const pessoa   = String(row['Pessoa']          ?? '').trim()
    const valorRaw = row['Valor Final']
    const descricao = row['Descrição'] != null ? String(row['Descrição']).trim() || null : null
    const conta     = row['Conta (Previsão)'] != null ? String(row['Conta (Previsão)']).trim() || null : null
    const vencRaw  = row['Vencimento']

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

export function chaveDuplicata(l: {
  tipo: string; pessoa: string; valor_final: number; vencimento: string
}): string {
  return `${l.tipo}|${l.pessoa.toLowerCase().trim()}|${Number(l.valor_final).toFixed(2)}|${l.vencimento}`
}
