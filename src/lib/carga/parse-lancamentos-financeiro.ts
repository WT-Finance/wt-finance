'use client'

import { toNum, toIsoDate, toStr } from './coercao'
import { validarColunasObrigatorias, mensagemColunasFaltando, type RequisitoColuna } from './colunas-obrigatorias'

// Cliente-safe — sem imports de DB ou Node.js.
// Parseia "Lançamentos Financeiros" do ERP: estrutura tabular plana de 12 colunas.
// Cada linha é um lançamento; sem linhas de cabeçalho intercaladas.
// Valor preserva sinal: positivo = entrada, negativo = saída.

export interface LancamentoFinanceiroRaw {
  numero:              string | null
  venda_no:            number | null
  emissao:             string | null
  vencimento:          string | null
  liquidacao:          string | null
  pessoa:              string | null
  descricao:           string | null
  descricao_categoria: string | null
  valor:               number
  categoria:           string | null
  grupo_categoria:     string | null
  conta:               string | null
}

const COL_MAP: Record<string, keyof LancamentoFinanceiroRaw> = {
  'Grupo_de_Categoria':  'grupo_categoria',
  'Grupo de Categoria':  'grupo_categoria',
  'Categoria':           'categoria',
  'Numero':              'numero',
  'Número':              'numero',
  'Venda_Numero':        'venda_no',
  'Venda Nº':            'venda_no',
  'Emissao':             'emissao',
  'Emissão':             'emissao',
  'Vencimento':          'vencimento',
  'Liquidacao':          'liquidacao',
  'Liquidação':          'liquidacao',
  'Pessoa':              'pessoa',
  'Descricao':           'descricao',
  'Descrição':           'descricao',
  'Descricao_Categoria': 'descricao_categoria',
  'Descrição Categoria': 'descricao_categoria',
  'Valor':               'valor',
  'Conta':               'conta',
}

const COLUNAS_OBRIGATORIAS: (keyof LancamentoFinanceiroRaw)[] = ['vencimento', 'valor']
// Requisitos p/ o helper — aceitos DERIVADOS do COL_MAP (todas as variantes de header
// que mapeiam ao campo); equivale exatamente a headers.some(h => COL_MAP[h] === campo).
// Espelha a obrigatoriedade atual, não a muda. (v4.29.0)
const REQUISITOS: RequisitoColuna[] = COLUNAS_OBRIGATORIAS.map(campo => {
  const aceitos = Object.keys(COL_MAP).filter(k => COL_MAP[k] === campo)
  return { label: aceitos[0] ?? campo, aceitos }
})
/** Colunas obrigatórias (rótulos amigáveis) — exibidas no card da UI. */
export const LANCAMENTOS_FINANCEIRO_COLUNAS = REQUISITOS.map(r => r.label)

export async function parseLancamentosFinanceiroFile(
  file: File,
): Promise<LancamentoFinanceiroRaw[] | { error: string }> {
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
    const faltando = validarColunasObrigatorias(headers, REQUISITOS)
    if (faltando.length > 0) return { error: mensagemColunasFaltando(faltando) }

    const result: LancamentoFinanceiroRaw[] = []

    for (const row of rows) {
      const valor = toNum(
        headers.reduce<unknown>((acc, h) => COL_MAP[h] === 'valor' ? row[h] : acc, null)
      )
      if (valor === null) continue

      const item: LancamentoFinanceiroRaw = {
        numero:              null,
        venda_no:            null,
        emissao:             null,
        vencimento:          null,
        liquidacao:          null,
        pessoa:              null,
        descricao:           null,
        descricao_categoria: null,
        valor,
        categoria:           null,
        grupo_categoria:     null,
        conta:               null,
      }

      for (const h of headers) {
        const campo = COL_MAP[h]
        if (!campo || campo === 'valor') continue
        const v = row[h]
        switch (campo) {
          case 'emissao':
          case 'vencimento':
          case 'liquidacao':  item[campo] = toIsoDate(v); break
          case 'venda_no':    item.venda_no = toNum(v) !== null ? Math.round(toNum(v)!) : null; break
          case 'numero':      item.numero = toStr(v); break
          default: (item as unknown as Record<string, string | null>)[campo as string] = toStr(v)
        }
      }

      result.push(item)
    }

    if (result.length === 0)
      return { error: 'Nenhuma linha válida encontrada (verifique se o arquivo tem coluna Valor preenchida)' }

    return result
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao processar arquivo' }
  }
}
