// Parser client-safe do export Monde "Lançamentos por movimentação" (Fluxo de Caixa,
// Onda 1, v5.2.0) — o REALIZADO: cada linha é um lançamento já liquidado, com a data
// do MOVIMENTO (entrada/saída efetiva no caixa) como eixo temporal. Isomórfico (sem
// 'use client', sem imports de DB/Node) — mesmo molde de parse-pessoas.ts/vendas-parser.ts,
// elegível a rodar num Web Worker futuramente (parse.worker.ts) se o volume exigir.
//
// Casamento de cabeçalho por normalizeHeader (de ./vendas-parser) — tolerante a
// acento/caixa/espaço, ambos os lados (COL_MAP e o header do arquivo) passam pela
// MESMA função, então o 'º' de "Venda Nº" (U+00BA, não removido pelo NFD) casa
// naturalmente sem tratamento especial.
//
// Coerção SEMPRE via ./coercao (toNum/toIsoDate/toStr) — nunca reimplementada
// localmente (lint wt/no-coercao-reimpl).

import { toNum, toIsoDate, toStr } from './coercao'
import { normalizeHeader } from './vendas-parser'
import { validarColunasObrigatorias, mensagemColunasFaltando, type RequisitoColuna } from './colunas-obrigatorias'

export interface LancamentoMovimentacaoRaw {
  numero:              string | null
  venda_no:            number | null
  emissao:             string | null
  vencimento:          string | null
  liquidacao:          string | null
  data_movimentacao:   string | null
  pessoa:              string | null
  descricao:           string | null
  descricao_categoria: string | null
  valor:               number
  categoria:           string | null
  grupo_categoria:     string | null
  conta:               string | null
}

// As 13 colunas do export "Lançamentos por movimentação" (Monde) → campo.
const COL_MAP: Record<string, keyof LancamentoMovimentacaoRaw> = {
  'Grupo de Categoria':  'grupo_categoria',
  'Grupo_de_Categoria':  'grupo_categoria',
  'Categoria':           'categoria',
  'Numero':              'numero',
  'Número':              'numero',
  'Venda Nº':            'venda_no',
  'Venda_Numero':        'venda_no',
  'Emissao':             'emissao',
  'Emissão':             'emissao',
  'Vencimento':          'vencimento',
  'Liquidacao':          'liquidacao',
  'Liquidação':          'liquidacao',
  'Movimentação':        'data_movimentacao',
  'Movimentacao':        'data_movimentacao',
  'Pessoa':              'pessoa',
  'Descricao':           'descricao',
  'Descrição':           'descricao',
  'Descricao_Categoria': 'descricao_categoria',
  'Descrição Categoria': 'descricao_categoria',
  'Valor':               'valor',
  'Conta':               'conta',
}

// Lookup por cabeçalho NORMALIZADO (acento/caixa/espaço-insensível) — os dois lados
// (COL_MAP e o header real do arquivo) passam por normalizeHeader.
const COL_MAP_NORM: Record<string, keyof LancamentoMovimentacaoRaw> = Object.fromEntries(
  Object.entries(COL_MAP).map(([k, v]) => [normalizeHeader(k), v]),
)

// data_movimentacao é o eixo do REALIZADO (não dá pra plotar/agregar sem ela); valor
// é a grandeza. Requisitos com aceitos DERIVADOS do COL_MAP (todas as variantes de
// header que mapeiam ao campo, já normalizadas) — equivale a
// headersNorm.some(h => COL_MAP_NORM[h] === campo).
const COLUNAS_OBRIGATORIAS: (keyof LancamentoMovimentacaoRaw)[] = ['data_movimentacao', 'valor']
const REQUISITOS: RequisitoColuna[] = COLUNAS_OBRIGATORIAS.map(campo => {
  const variantes = Object.keys(COL_MAP).filter(k => COL_MAP[k] === campo)
  return { label: variantes[0] ?? campo, aceitos: variantes.map(normalizeHeader) }
})
/** Colunas obrigatórias (rótulos amigáveis) — exibidas no card da UI. */
export const LANCAMENTOS_MOVIMENTACAO_COLUNAS: string[] = REQUISITOS.map(r => r.label)

/**
 * Transforma a matriz de células (array-of-arrays, linha 0 = cabeçalho) em
 * LancamentoMovimentacaoRaw[]. Pula linha sem `valor` coercível (obrigatório) e sem
 * `data_movimentacao` (eixo do realizado) — o sinal do valor é PRESERVADO (positivo =
 * entrada, negativo = saída).
 */
export function parseLancamentosMovimentacaoRows(
  rows: unknown[][],
  arquivo?: string,
): LancamentoMovimentacaoRaw[] | { error: string } {
  if (rows.length < 2) return { error: 'Arquivo vazio ou sem dados.' }

  const headers = (rows[0] as unknown[]).map(h => String(h ?? '').trim())
  const headersNorm = headers.map(normalizeHeader)
  const faltando = validarColunasObrigatorias(headersNorm, REQUISITOS)
  if (faltando.length > 0) return { error: mensagemColunasFaltando(faltando) }

  const naoMapeadas = headers.filter(h => h && !COL_MAP_NORM[normalizeHeader(h)])
  if (naoMapeadas.length > 0) {
    console.warn(
      `[lancamentos-movimentacao]${arquivo ? ` (${arquivo})` : ''} colunas não-mapeadas (ignoradas):`,
      naoMapeadas,
    )
  }

  const linhas: LancamentoMovimentacaoRaw[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => c === null || c === undefined || c === '')) continue

    const linha: Partial<LancamentoMovimentacaoRaw> = {}
    for (let j = 0; j < headers.length; j++) {
      const campo = COL_MAP_NORM[normalizeHeader(headers[j])]
      if (!campo) continue
      const v = row[j]
      switch (campo) {
        case 'emissao':
        case 'vencimento':
        case 'liquidacao':
        case 'data_movimentacao':
          linha[campo] = toIsoDate(v)
          break
        case 'venda_no': {
          const n = toNum(v)
          linha.venda_no = n === null ? null : Math.round(n)
          break
        }
        case 'valor': {
          const n = toNum(v)
          if (n !== null) linha.valor = n
          break
        }
        default:
          (linha as unknown as Record<string, string | null>)[campo] = toStr(v)
      }
    }

    const valor = linha.valor
    if (valor === undefined) continue          // valor obrigatório e coercível
    const dataMovimentacao = linha.data_movimentacao
    if (!dataMovimentacao) continue            // eixo do realizado

    linhas.push({
      numero:              linha.numero ?? null,
      venda_no:            linha.venda_no ?? null,
      emissao:             linha.emissao ?? null,
      vencimento:          linha.vencimento ?? null,
      liquidacao:          linha.liquidacao ?? null,
      data_movimentacao:   dataMovimentacao,
      pessoa:              linha.pessoa ?? null,
      descricao:           linha.descricao ?? null,
      descricao_categoria: linha.descricao_categoria ?? null,
      valor,
      categoria:           linha.categoria ?? null,
      grupo_categoria:     linha.grupo_categoria ?? null,
      conta:               linha.conta ?? null,
    })
  }

  return linhas
}

export async function parseLancamentosMovimentacaoFile(
  file: File,
): Promise<LancamentoMovimentacaoRaw[] | { error: string }> {
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
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false })
    if (aoa.length === 0) return { error: 'Arquivo vazio ou sem dados.' }

    const resultado = parseLancamentosMovimentacaoRows(aoa, file.name)
    if (!Array.isArray(resultado)) return resultado
    if (resultado.length === 0)
      return { error: 'Nenhuma linha válida encontrada (verifique se o arquivo tem as colunas obrigatórias preenchidas).' }
    return resultado
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao processar o arquivo.' }
  }
}
