import { describe, it, expect } from 'vitest'
import * as XLSX from '@e965/xlsx'
import { parseFaturamentoFile } from './parse-faturamento'

function xlsxFile(aoa: unknown[][]): File {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'faturamento')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([buf], 'faturamento.xlsx')
}

const CAB = ['Número', 'Emissão', 'Pessoa', 'Vencimento', 'Valor', 'Valor Final', 'Fatura Cliente Nº']

describe('parseFaturamentoFile — linha de total do Monde (v6.5.2)', () => {
  it('ignora a linha de total (sem Pessoa e sem Fatura Cliente Nº) — o resumo não dobra', async () => {
    const r = await parseFaturamentoFile(xlsxFile([
      CAB,
      [1, '10/11/2026', 'ABRAT', '20/11/2026', 4008.77, 4008.77, '10629'],
      [2, '10/11/2026', 'ASSOAUDI', '20/11/2026', 5613.93, 5613.93, '10630'],
      [2, null, null, null, 9622.70, 9622.70, null], // total do Monde
    ]))
    if (!Array.isArray(r)) throw new Error(`esperava array: ${JSON.stringify(r)}`)
    expect(r.map(f => f.pessoa)).toEqual(['ABRAT', 'ASSOAUDI'])
    expect(r.reduce((s, f) => s + (f.valor ?? 0), 0)).toBeCloseTo(9622.70, 2)
  })

  it('fatura com só UMA das chaves faltando continua entrando (vai para a revisão)', async () => {
    const r = await parseFaturamentoFile(xlsxFile([
      CAB,
      [1, '10/11/2026', null, '20/11/2026', 100, 100, '10700'],     // sem Pessoa
      [2, '10/11/2026', 'Acme', '20/11/2026', 200, 200, null],      // sem Fatura Cliente Nº
    ]))
    if (!Array.isArray(r)) throw new Error(`esperava array: ${JSON.stringify(r)}`)
    expect(r).toHaveLength(2)
    expect(r[0].fatura_cliente_no).toBe('10700')
    expect(r[1].pessoa).toBe('Acme')
  })

  it('linha sem as duas chaves MAS com data NÃO é descartada (não é a linha de total)', async () => {
    const r = await parseFaturamentoFile(xlsxFile([
      CAB,
      [1, '10/11/2026', null, '20/11/2026', 300, 300, null],
    ]))
    if (!Array.isArray(r)) throw new Error(`esperava array: ${JSON.stringify(r)}`)
    expect(r).toHaveLength(1)
    expect(r[0].valor).toBe(300)
  })
})
