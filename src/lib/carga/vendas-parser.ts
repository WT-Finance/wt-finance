// Parser ÚNICO de Vendas por Produto — núcleo ISOMÓRFICO (sem 'use client', sem
// imports de DB/Node). Os dois caminhos de ingestão consomem ESTE módulo:
//   • UI (/admin/uploads)       → parse-vendas-produto.ts (lê o File no cliente)
//   • API Route (upload-vendas) → carga/vendas.ts        (lê o Buffer no servidor)
// Cada caminho só difere em COMO obtém a matriz de células (aoa); a transformação
// cabeçalho→campo, as conversões e a PARIDADE de colunas (incl. operacao_propria,
// passageiros, tipo_contrato) vivem aqui, uma vez só.
//
// Por que unificar: dois parsers divergentes já custou caro. A via servidor não
// populava operacao_propria — uma carga por ela faria a regeneração da dim achar o
// vínculo NULL e regredir SILENCIOSAMENTE a correção da v4.9.x (convidados zeram,
// datas de evento somem, faturamento das operações volta a errar). Um único parser
// tolerante (casamento de cabeçalho insensível a acento/caixa/espaço) fecha a porta.

export interface VendaProdutoRaw {
  arquivo_origem:     string
  linha_origem:       number
  venda_numero:       string | null
  data_venda:         string | null
  vendedor:           string | null
  pagante:            string | null
  setor_macro:        string | null
  setor:              string | null
  setor_micro:        string | null
  produto:            string | null
  valor_total:        string | null
  receitas:           string | null
  contrato:           string | null
  taxa_servico:       string | null
  semana:             string | null
  mes:                string | null
  data_inicio_evento: string | null
  fornecedor:         string | null
  passageiros?:       string | null
  tipo_contrato?:     string | null
  operacao_propria?:  string | null
}

const COL_MAP: Record<string, keyof VendaProdutoRaw> = {
  'Venda Nº':         'venda_numero',
  'Data Venda':       'data_venda',
  'Vendedor':         'vendedor',
  'Pagante':          'pagante',
  'Setor Macro':      'setor_macro',
  'Setor':            'setor',
  'Setor Micro':      'setor_micro',
  'Produto':          'produto',
  'Valor Total':      'valor_total',
  'Receitas':         'receitas',
  'Contrato':         'contrato',
  'Taxa de Serviço':  'taxa_servico',
  'Semana':           'semana',
  'Mês':              'mes',
  'Data Início':      'data_inicio_evento',
  'Data de Início':   'data_inicio_evento',
  'Fornecedor':       'fornecedor',
  'Passageiros':      'passageiros',
  'Contr./ Voucher':  'tipo_contrato',
  'Operação Própria': 'operacao_propria',
}

/**
 * Normaliza um cabeçalho para casamento TOLERANTE a acento, caixa e espaço.
 * O ERP varia a grafia dos cabeçalhos entre exportações — ex.: "Operação Propria"
 * (sem acento em "Própria"), "Mes" (sem acento). Casar o header ao pé da letra
 * descarta a coluna em silêncio (custou caro: Data Início na v4.9, Operação Própria
 * na v4.9.1). Normalizar evita que uma diferença de grafia derrube a ingestão.
 */
export function normalizeHeader(h: string): string {
  return h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Lookup por cabeçalho normalizado (acento/caixa/espaço-insensível).
const COL_MAP_NORM: Record<string, keyof VendaProdutoRaw> = Object.fromEntries(
  Object.entries(COL_MAP).map(([k, v]) => [normalizeHeader(k), v]),
)

/**
 * Converte um valor de célula para data ISO (YYYY-MM-DD) sem deslocar dia/mês.
 * Prioriza o Date NATIVO da célula (ADR-0099): `cellDates: true` na leitura faz a
 * data chegar como Date inequívoco — adivinhar DD/MM vs MM/DD numa string inverte
 * dia↔mês quando ambos ≤ 12. A heurística de string (DD/MM/YYYY) é só fallback
 * para células que cheguem genuinamente como texto.
 */
export function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
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
  const s = String(v).replace(',', '.').trim()
  const n = parseFloat(s)
  return isNaN(n) ? null : String(n)
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s || null
}

/**
 * Transforma a matriz de células (array-of-arrays, linha 0 = cabeçalho) em
 * VendaProdutoRaw[]. É o ponto ÚNICO de verdade do mapeamento de colunas — os dois
 * caminhos (cliente/servidor) só fornecem o `aoa`; tudo o mais é igual.
 *
 * Devolve também `naoMapeadas`: cabeçalhos presentes no arquivo que não casam com
 * nenhum campo conhecido (mesmo com o casamento tolerante) — emite console.warn
 * para um header novo/renomeado não passar despercebido como passou a Data Início
 * (v4.9) e a Operação Própria (v4.9.1).
 */
export function parseVendasRows(
  aoa: unknown[][],
  nomeArquivo: string,
): { linhas: VendaProdutoRaw[]; naoMapeadas: string[] } {
  if (aoa.length < 2) return { linhas: [], naoMapeadas: [] }

  const headers = (aoa[0] as unknown[]).map(h => String(h ?? '').trim())

  const naoMapeadas = headers.filter(h => h && !COL_MAP_NORM[normalizeHeader(h)])
  if (naoMapeadas.length > 0) {
    console.warn('[vendas-parser] colunas não-mapeadas (ignoradas):', naoMapeadas)
  }

  const linhas: VendaProdutoRaw[] = []
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] as unknown[]
    if (!row || row.every(c => c === null || c === '')) continue

    const linha: Partial<VendaProdutoRaw> = {
      arquivo_origem: nomeArquivo,
      linha_origem:   i + 1, // cabeçalho = linha 1; 1ª linha de dados = 2
    }

    for (let j = 0; j < headers.length; j++) {
      const campo = COL_MAP_NORM[normalizeHeader(headers[j])]
      if (!campo) continue
      const v = row[j]
      switch (campo) {
        case 'data_venda':
        case 'data_inicio_evento': linha[campo]        = toIsoDate(v); break
        case 'contrato':           linha.contrato      = toBoolean(v); break
        case 'taxa_servico':       linha.taxa_servico  = toBoolean(v); break
        case 'valor_total':        linha.valor_total   = toNumStr(v);  break
        case 'receitas':           linha.receitas      = toNumStr(v);  break
        case 'semana':             linha.semana = v !== null && v !== '' ? String(Math.round(Number(v))) : null; break
        default:                   (linha as Record<string, string | null>)[campo] = toStr(v)
      }
    }
    linhas.push(linha as VendaProdutoRaw)
  }

  return { linhas, naoMapeadas }
}
