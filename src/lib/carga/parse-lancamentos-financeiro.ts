'use client'

// Cliente-safe — sem imports de DB ou Node.js.
// Parseia "Lançamentos por categoria" do ERP financeiro.
// Filtra apenas linhas de detalhe (Número numérico), ignorando cabeçalhos Grupo/Categoria.
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
  'Número':                 'numero',
  'Numero':                 'numero',
  'Lançamento Nº':          'numero',
  'Venda Nº':               'venda_no',
  'Venda.N.':               'venda_no',
  'Emissão':                'emissao',
  'Emissao':                'emissao',
  'Vencimento':             'vencimento',
  'Liquidação':             'liquidacao',
  'Liquidacao':             'liquidacao',
  'Pessoa':                 'pessoa',
  'Descrição':              'descricao',
  'Descricao':              'descricao',
  'Descrição Categoria':    'descricao_categoria',
  'DescriçãoCategoria':     'descricao_categoria',
  'DescricaoCategoria':     'descricao_categoria',
  'Valor':                  'valor',
  'Categoria':              'categoria',
  'Grupo de Categoria':     'grupo_categoria',
  'GrupoCategoria':         'grupo_categoria',
  'Grupo Categoria':        'grupo_categoria',
  'Conta':                  'conta',
}

const COLUNAS_OBRIGATORIAS = ['Valor', 'Vencimento']

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

function isDetalhe(numero: unknown): boolean {
  // Linhas de detalhe têm Número numérico; cabeçalhos Grupo/Categoria são texto
  if (numero === null || numero === undefined || numero === '') return false
  const n = String(numero).trim()
  return /^\d+$/.test(n)
}

export async function parseLancamentosFinanceiroFile(
  file: File,
): Promise<LancamentoFinanceiroRaw[] | { error: string }> {
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

    for (const col of COLUNAS_OBRIGATORIAS) {
      const found = headers.some(h =>
        COL_MAP[h] !== undefined &&
        (COL_MAP[h] === (col === 'Vencimento' ? 'vencimento' : 'valor'))
      )
      if (!found) {
        return { error: `Coluna obrigatória ausente: "${col}". Colunas encontradas: ${headers.join(', ')}` }
      }
    }

    const result: LancamentoFinanceiroRaw[] = []

    for (const row of rows) {
      // Detecta coluna Número pelo mapeamento
      const numKey = headers.find(h => COL_MAP[h] === 'numero')
      const numVal = numKey ? row[numKey] : null

      // Ignora linhas que não são detalhe (cabeçalhos Grupo/Categoria)
      if (!isDetalhe(numVal)) continue

      const valor = toNum(
        headers.reduce<unknown>((acc, h) => COL_MAP[h] === 'valor' ? row[h] : acc, null)
      )
      if (valor === null) continue

      const item: LancamentoFinanceiroRaw = {
        numero:              toStr(numVal),
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
        if (!campo || campo === 'numero' || campo === 'valor') continue
        const v = row[h]
        switch (campo) {
          case 'emissao':
          case 'vencimento':
          case 'liquidacao':        item[campo] = toIsoDate(v); break
          case 'venda_no':          item.venda_no = toNum(v) !== null ? Math.round(toNum(v)!) : null; break
          default: (item as unknown as Record<string, string | null>)[campo as string] = toStr(v)
        }
      }

      result.push(item)
    }

    if (result.length === 0)
      return { error: 'Nenhuma linha de detalhe encontrada (verifique se o arquivo tem coluna Número numérico)' }

    return result
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao processar arquivo' }
  }
}
