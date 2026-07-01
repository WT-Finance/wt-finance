import { describe, it, expect } from 'vitest'
import * as XLSX from '@e965/xlsx'
import { parseClientesCorpFile } from './parse-clientes-corp'

// Constrói um File .xlsx a partir de uma matriz (linha 0 = cabeçalho).
function xlsxFile(aoa: unknown[][]): File {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([buf], 'clientes.xlsx')
}

describe('parseClientesCorpFile — Fase 3 (v4.33.0)', () => {
  it('ENVIAR PARA → destinatarios; IGNORA EMAIL 1-6; situação normalizada', async () => {
    const f = xlsxFile([
      ['EMPRESA', 'Situação', 'ENVIAR PARA', 'EMAIL 1', 'EMAIL 2', '% JUROS', '% MULTA', 'FATURAR EM', 'CONTATO WHATS'],
      ['Acme Ltda', 'Ativo', 'a@x.com; b@y.com', 'a@x.com', 'b@y.com', '1% ao mês', '2%', '01 / 10 / 20', '11 99999-0000'],
    ])
    const r = await parseClientesCorpFile(f)
    expect(Array.isArray(r)).toBe(true)
    if (!Array.isArray(r)) return
    expect(r).toHaveLength(1)
    expect(r[0].empresa).toBe('Acme Ltda')
    expect(r[0].situacao).toBe('ativo')
    expect(r[0].destinatarios).toBe('a@x.com; b@y.com') // do ENVIAR PARA
    expect(r[0].pct_juros).toBe('1% ao mês')
    expect(r[0].pct_multa).toBe('2%')
    expect(r[0].faturar_em).toBe('01 / 10 / 20')
    expect(r[0].contato_whats).toBe('11 99999-0000')
    // EMAIL 1/2 não têm campo próprio (ignorados) — não aparecem no objeto
    expect((r[0] as unknown as Record<string, unknown>).email_1).toBeUndefined()
  })

  it('normaliza situação: Inativo → inativo; desconhecido → null', async () => {
    const f = xlsxFile([
      ['EMPRESA', 'Situação'],
      ['Beta SA', 'INATIVO'],
      ['Gama ME', 'suspenso'],
    ])
    const r = await parseClientesCorpFile(f)
    if (!Array.isArray(r)) throw new Error('esperava array')
    expect(r[0].situacao).toBe('inativo')
    expect(r[1].situacao).toBeNull()
  })

  it('sem coluna EMPRESA → erro claro', async () => {
    const f = xlsxFile([['Situação', 'ENVIAR PARA'], ['Ativo', 'a@x.com']])
    const r = await parseClientesCorpFile(f)
    expect('error' in (r as object)).toBe(true)
  })

  it('linha sem EMPRESA é pulada (sem chave)', async () => {
    const f = xlsxFile([
      ['EMPRESA', 'Situação'],
      ['', 'Ativo'],          // sem empresa → pula
      ['Delta Corp', 'Ativo'],
    ])
    const r = await parseClientesCorpFile(f)
    if (!Array.isArray(r)) throw new Error('esperava array')
    expect(r).toHaveLength(1)
    expect(r[0].empresa).toBe('Delta Corp')
  })
})
