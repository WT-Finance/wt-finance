import { describe, it, expect } from 'vitest'
import * as XLSX from '@e965/xlsx'
import { parsePessoasFile, PESSOAS_COLUNAS } from './parse-pessoas'

// Constrói um File .xlsx em memória a partir de uma matriz (cabeçalho + linhas).
function fakeXlsx(aoa: unknown[][]): File {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Plan1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
  return new File([buf as BlobPart], 'pessoas.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

const HEADERS = PESSOAS_COLUNAS // 17 colunas, na ordem canônica

describe('parsePessoasFile — invariantes da Base de Pessoas (v4.29.0)', () => {
  it('17 colunas presentes (mesmo com células vazias) → importa; vazias viram null', async () => {
    // Documentos como STRING (como o Monde exporta) — zeros à esquerda preservados.
    // 1 linha com dados (a maioria das células vazia) + 1 linha 100% vazia (deve ser pulada).
    const linha1 = ['  Acme Ltda', 'a@b.com', '', '', 'Recife', 'PE', 'ACME COMERCIO LTDA',
      'Rua X', '100', '', 'Centro', '66035145', '04602529925', '00111222000133', '', '', 'Brasil']
    const vazia = HEADERS.map(() => '')
    const res = await parsePessoasFile(fakeXlsx([HEADERS, linha1, vazia]))

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res).toHaveLength(1) // linha 100% vazia pulada

    const p = res[0]
    expect(p.nome).toBe('Acme Ltda')          // TRIM (origem traz espaço à esquerda)
    expect(p.cnpj).toBe('00111222000133')     // TEXT — zeros à esquerda preservados
    expect(p.cpf).toBe('04602529925')         // TEXT — não vira número
    expect(p.cep).toBe('66035145')            // TEXT
    expect(p.razao_social).toBe('ACME COMERCIO LTDA')
    expect(p.telefone).toBeNull()             // célula vazia → null (não rejeita)
    expect(p.complemento).toBeNull()
    expect(p.inscricao_estadual).toBeNull()
  })

  it('falta UMA das 17 colunas → erro claro listando a faltante, NÃO importa', async () => {
    const semCnpj = HEADERS.filter(h => h !== 'CNPJ')
    const res = await parsePessoasFile(fakeXlsx([semCnpj, semCnpj.map(() => 'x')]))
    expect(Array.isArray(res)).toBe(false)
    if (Array.isArray(res)) return
    expect(res.error).toContain('CNPJ')
    expect(res.error).toContain('precisa conter')
  })

  it('cabeçalho tolerante a acento (Razao Social sem acento) → ainda importa', async () => {
    const headersSemAcento = HEADERS.map(h => h.normalize('NFD').replace(/[̀-ͯ]/g, ''))
    const res = await parsePessoasFile(fakeXlsx([headersSemAcento, headersSemAcento.map((_, i) => i === 0 ? 'Fulano' : '')]))
    expect(Array.isArray(res)).toBe(true)
  })
})
