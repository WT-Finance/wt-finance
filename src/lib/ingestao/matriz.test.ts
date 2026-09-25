import { describe, it, expect } from 'vitest'
import * as XLSX from '@e965/xlsx'
import { formatoPeloNome, lerMatriz } from './matriz'

// GUARD dos dois bugs de leitura (skill `ingestao-planilhas` §3) — CONSTRUINDO arquivos de
// verdade e entrando por `lerMatriz`, nunca montando a matriz na mão. É a mesma disciplina do
// guard v5.5.2 (`src/lib/carga/parse-fluxo-caixa-valor-nativo.test.ts`): o defeito mora na
// EXTRAÇÃO (a opção do `sheet_to_json`/`XLSX.read`), então um teste que chama um parser com uma
// matriz já pronta passa por cima dele.

/** Monta um .xlsx REAL em memória, como um upload faz — devolve os BYTES, não um `File`. */
function bytesXlsx(abas: { nome: string; aoa: unknown[][] }[]): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const { nome, aoa } of abas) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nome)
  }
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Uint8Array(buf)
}

/** Bytes de um CSV a partir de um texto (opcionalmente com BOM já embutido no texto). */
function bytesCsv(texto: string): Uint8Array {
  return new TextEncoder().encode(texto)
}

describe('formatoPeloNome', () => {
  it('reconhece xlsx e csv, insensível a caixa', () => {
    expect(formatoPeloNome('vendas.xlsx')).toBe('xlsx')
    expect(formatoPeloNome('VENDAS.XLSX')).toBe('xlsx')
    expect(formatoPeloNome('dados.csv')).toBe('csv')
    expect(formatoPeloNome('dados.CSV')).toBe('csv')
  })

  it('devolve null para o que não é planilha suportada', () => {
    expect(formatoPeloNome('sememextensao')).toBeNull()
    expect(formatoPeloNome('arquivo.txt')).toBeNull()
    expect(formatoPeloNome('arquivo.tar.gz')).toBeNull()
    expect(formatoPeloNome('')).toBeNull()
  })

  it('tolera caminho com pasta antes do nome', () => {
    expect(formatoPeloNome('2026/09/vendas-produto.xlsx')).toBe('xlsx')
  })
})

describe('lerMatriz — xlsx', () => {
  it('célula de data chega como Date nativo, não como string', () => {
    const data = new Date('2025-10-16T12:00:00Z')
    const bytes = bytesXlsx([{ nome: 'Plan1', aoa: [['Emissao'], [data]] }])
    const matriz = lerMatriz(bytes, 'xlsx')

    expect(matriz[1][0]).toBeInstanceOf(Date)
    expect(typeof matriz[1][0]).not.toBe('string')
  })

  it('valor com três casas decimais (-40.933) sobrevive como número, não vira milhar ×1000', () => {
    const bytes = bytesXlsx([{ nome: 'Plan1', aoa: [['Valor'], [-40.933]] }])
    const matriz = lerMatriz(bytes, 'xlsx')

    expect(matriz[1][0]).toBe(-40.933)
    expect(matriz[1][0]).not.toBe(-40933)
  })

  it('célula ausente (linha mais curta que o cabeçalho) vira null, não some do array', () => {
    const bytes = bytesXlsx([{ nome: 'Plan1', aoa: [['A', 'B', 'C'], ['x']] }])
    const matriz = lerMatriz(bytes, 'xlsx')

    expect(matriz[1]).toEqual(['x', null, null])
  })

  it('lê a primeira aba por default e uma aba específica quando pedida pelo nome', () => {
    const bytes = bytesXlsx([
      { nome: 'Plan1', aoa: [['Primeira']] },
      { nome: 'Outra', aoa: [['Segunda']] },
    ])

    expect(lerMatriz(bytes, 'xlsx')[0][0]).toBe('Primeira')
    expect(lerMatriz(bytes, 'xlsx', 'Outra')[0][0]).toBe('Segunda')
  })
})

describe('lerMatriz — csv', () => {
  it('valor BR com vírgula decimal ("40,93") NÃO vira 4093 (heurístico americano desligado)', () => {
    const bytes = bytesCsv('Categoria,Valor\nDespesas,"40,93"\n')
    const matriz = lerMatriz(bytes, 'csv')

    expect(matriz[1][1]).toBe('40,93')
    expect(matriz[1][1]).not.toBe(4093)
  })

  it('o BOM de um CSV exportado pelo Excel não contamina a primeira célula do cabeçalho', () => {
    const bytes = bytesCsv('﻿Grupo,Valor\nDespesas,10\n')
    const matriz = lerMatriz(bytes, 'csv')

    expect(matriz[0][0]).toBe('Grupo')
  })

  it('célula vazia (linha mais curta que o cabeçalho) vira null', () => {
    const bytes = bytesCsv('A,B,C\nx\n')
    const matriz = lerMatriz(bytes, 'csv')

    expect(matriz[1]).toEqual(['x', null, null])
  })
})
