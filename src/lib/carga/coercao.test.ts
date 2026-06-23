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

describe('toNum — negativo entre parênteses (convenção contábil, v4.27)', () => {
  // Extensão da v4.27 (ADR-0130): "(1.000)" → -1000. NÃO altera nenhum caso acima
  // (nenhum tem parênteses) — invólucro detectado ANTES da desambiguação BR/US, que
  // segue idêntica no conteúdo; só o sinal muda no fim.
  it('parênteses = negativo, preservando a desambiguação BR/US do conteúdo', () => {
    expect(toNum('(1.000)')).toBe(-1000)         // BR milhar puro
    expect(toNum('(1.234,56)')).toBe(-1234.56)   // BR decimal
    expect(toNum('(8.840,00)')).toBe(-8840)
    expect(toNum('(1,234.56)')).toBe(-1234.56)   // US dentro dos parênteses
  })
  it('aceita R$ dentro ou fora dos parênteses', () => {
    expect(toNum('R$ (1.234,56)')).toBe(-1234.56)
    expect(toNum('(R$ 1.234,56)')).toBe(-1234.56)
  })
  it('parênteses vazios/lixo → null; positivo sem parênteses intacto', () => {
    expect(toNum('()')).toBeNull()
    expect(toNum('(abc)')).toBeNull()
    expect(toNum('1.234,56')).toBe(1234.56)
  })
})

// Oráculo CONGELADO do antigo gerencial/parser.ts:parseValorMonetario (removido na
// v4.27/M2). Prova que o toNum ESTENDIDO concorda com ele em TODA entrada de moeda
// realista — a não-regressão do import do Gerencial após convergir ao toNum.
// (Arquivo de teste → isento da regra wt/no-coercao-reimpl.)
function parseValorMonetarioLegado(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return isNaN(raw) ? null : raw
  let s = String(raw).trim()
  if (!s) return null
  const negativo = /^-|\(.*\)$/.test(s)
  s = s.replace(/[^\d.,]/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma > -1) {
    const aposVirgula = s.length - lastComma - 1
    s = aposVirgula === 1 || aposVirgula === 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  }
  const n = Number(s)
  if (isNaN(n)) return null
  return negativo ? -n : n
}

describe('toNum estendido CONCORDA com o parseValorMonetario legado (não-regressão Gerencial)', () => {
  // Formatos REAIS de moeda (raw:false do XLSX): BR/US, 2 casas, com/sem R$, positivos
  // e negativos entre parênteses — onde o parseValorMonetario era usado. Os dois DEVEM
  // concordar; é a prova da convergência.
  const casosReais: Array<[string, number]> = [
    ['R$ 1.000,00', 1000],
    ['R$ 1.234,56', 1234.56],
    ['1.000,00', 1000],
    ['1.234,56', 1234.56],
    ['R$ 1,000.00', 1000],
    ['1,234.56', 1234.56],
    ['12.345,67', 12345.67],
    ['1.234.567,89', 1234567.89],
    ['1,234,567.89', 1234567.89],
    ['0,00', 0],
    ['0.00', 0],
    ['-1.234,56', -1234.56],
    ['(R$ 1.000,00)', -1000],
    ['(1.234,56)', -1234.56],
    ['(1,234.56)', -1234.56],
  ]
  it.each(casosReais)('%s → mesmo valor nos dois caminhos', (entrada, esperado) => {
    expect(toNum(entrada)).toBe(esperado)
    expect(parseValorMonetarioLegado(entrada)).toBe(esperado)
    expect(toNum(entrada)).toBe(parseValorMonetarioLegado(entrada))
  })
  it('números nativos: idênticos nos dois', () => {
    for (const n of [1000, -50.5, 0, 8840.25]) {
      expect(toNum(n)).toBe(parseValorMonetarioLegado(n))
    }
  })
})
