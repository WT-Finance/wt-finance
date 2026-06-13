import { describe, it, expect } from 'vitest'
import { toNum, toIsoDate, toStr } from './coercao'

// Testes de tabela obrigatórios (v4.17.0 / Balde 2). Travam a regressão da v4.9.x:
// o toNum ingênuo devolvia NaN→null para BR com milhar ("8.840,00", "1.234,56"),
// e datas DD/MM eram invertidas. Estes casos são os do briefing §4.

describe('toNum — robusto BR/US (substitui o ingênuo Number(replace(,,.)))', () => {
  it('BR com milhar + decimal vírgula', () => {
    expect(toNum('8.840,00')).toBe(8840)        // o ingênuo dava NaN→null
    expect(toNum('1.234,56')).toBe(1234.56)     // o ingênuo dava NaN→null
    expect(toNum('R$ 8.840,00')).toBe(8840)     // prefixo monetário
    expect(toNum('R$ 1.234,56')).toBe(1234.56)
  })
  it('ponto: milhar BR (3 dígitos) vs decimal US (≤2 dígitos)', () => {
    expect(toNum('1.234')).toBe(1234)           // milhar BR puro (3 dígitos após ponto)
    expect(toNum('12.345')).toBe(12345)
    expect(toNum('-1.234')).toBe(-1234)
    expect(toNum('12.34')).toBe(12.34)          // decimal US (2 dígitos)
    expect(toNum('1,234.56')).toBe(1234.56)     // US milhar=vírgula, decimal=ponto
  })
  it('números nativos e vazios', () => {
    expect(toNum(8840)).toBe(8840)
    expect(toNum(-12.5)).toBe(-12.5)
    expect(toNum('')).toBeNull()
    expect(toNum(null)).toBeNull()
    expect(toNum(undefined)).toBeNull()
    expect(toNum('abc')).toBeNull()
    expect(toNum(NaN)).toBeNull()
  })
})

describe('toIsoDate — Date nativo e DD/MM/YYYY, sem inverter dia/mês', () => {
  it('Date nativo usa ano/mês/dia locais (sem tz-shift)', () => {
    expect(toIsoDate(new Date(2026, 5, 8))).toBe('2026-06-08')  // 8 de junho
    expect(toIsoDate(new Date(2025, 11, 31))).toBe('2025-12-31') // dia 31 > 12
  })
  it('DD/MM/YYYY não inverte (08/06 = 8 jun, NÃO 6 ago)', () => {
    expect(toIsoDate('08/06/2026')).toBe('2026-06-08')
    expect(toIsoDate('31/12/2025')).toBe('2025-12-31')
  })
  it('ISO passthrough; vazios → null', () => {
    expect(toIsoDate('2026-06-08')).toBe('2026-06-08')
    expect(toIsoDate('')).toBeNull()
    expect(toIsoDate(null)).toBeNull()
    expect(toIsoDate(undefined)).toBeNull()
    expect(toIsoDate('texto')).toBeNull()
  })
})

describe('toStr', () => {
  it('apara e trata vazio', () => {
    expect(toStr('  oi  ')).toBe('oi')
    expect(toStr('')).toBeNull()
    expect(toStr(null)).toBeNull()
    expect(toStr(undefined)).toBeNull()
    expect(toStr(123)).toBe('123')
  })
})
