import { describe, it, expect, afterEach, vi } from 'vitest'
import { fmtValor, vencida, fmtDataBR, hojeSP } from './format'

// Cobre a coerção/limite de Solicitações (v4.17.0 / Balde 2). fmtValor agora usa o
// toNum canônico; vencida é date-only em fuso de São Paulo.

type Resposta = Parameters<typeof fmtValor>[0]
const r = (tipo_campo: string, valor: string | null): Resposta =>
  ({ campo_id: 1, rotulo: 'X', tipo_campo, valor } as unknown as Resposta)

describe('fmtValor — moeda via toNum canônico', () => {
  it('BR milhar+decimal e milhar puro', () => {
    expect(fmtValor(r('moeda', '8.840,00'))).toBe('R$ 8.840,00')
    expect(fmtValor(r('moeda', '1.234,56'))).toBe('R$ 1.234,56')
    expect(fmtValor(r('moeda', '12.345'))).toBe('R$ 12.345,00') // milhar puro → 12345
  })
  it('decimal US e fallback', () => {
    expect(fmtValor(r('moeda', '12.34'))).toBe('R$ 12,34')
    expect(fmtValor(r('moeda', 'abc'))).toBe('abc') // não-numérico → cru
    expect(fmtValor(r('moeda', null))).toBe('—')
  })
  it('data e texto', () => {
    expect(fmtValor(r('data', '2026-06-08'))).toBe('08/06/2026')
    expect(fmtValor(r('texto_curto', 'oi'))).toBe('oi')
  })
})

describe('fmtDataBR — sem deslocar o dia', () => {
  it('ISO e timestamptz → DD/MM/AAAA', () => {
    expect(fmtDataBR('2026-06-08')).toBe('08/06/2026')
    expect(fmtDataBR('2026-06-08T23:30:00+00:00')).toBe('08/06/2026') // date-only (slice 10)
    expect(fmtDataBR(null)).toBe('—')
  })
})

describe('vencida — date-only, fuso de São Paulo, cruzando o limite', () => {
  afterEach(() => vi.useRealTimers())

  it('hoje (SP) é a data local de SP, não a UTC', () => {
    // 2026-06-13T02:00Z = 2026-06-12 23:00 em São Paulo (UTC-3) → hoje = dia 12
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-13T02:00:00Z'))
    expect(hojeSP()).toBe('2026-06-12')
    // limite no dia 12 NÃO está vencido ainda (ainda é dia 12 em SP)
    expect(vencida('2026-06-12', 'aberta')).toBe(false)
    expect(vencida('2026-06-11', 'aberta')).toBe(true)
  })

  it('limite cruza para vencido quando a data-limite < hoje (SP)', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-13T12:00:00Z')) // SP = dia 13, 09:00
    expect(hojeSP()).toBe('2026-06-13')
    expect(vencida('2026-06-12', 'aberta')).toBe(true)  // ontem → vencida
    expect(vencida('2026-06-13', 'aberta')).toBe(false) // vence hoje → ainda não
    expect(vencida('2026-06-14', 'aberta')).toBe(false) // futuro
  })

  it('só conta como vencida se ABERTA', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    expect(vencida('2026-06-01', 'concluida')).toBe(false)
    expect(vencida('2026-06-01', 'cancelada')).toBe(false)
    expect(vencida('2026-06-01', 'rejeitada')).toBe(false)
  })
})
