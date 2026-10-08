import { describe, it, expect } from 'vitest'
import { fmtDeltaPct, fmtPct } from './formatar'

describe('fmtDeltaPct', () => {
  it('sinal explícito no positivo, travessão em null', () => {
    expect(fmtDeltaPct(12.34)).toBe('+12,3%')
    expect(fmtDeltaPct(-20)).toBe('-20,0%')
    expect(fmtDeltaPct(null)).toBe('—')
  })
  it('nunca mostra "-0,0%" nem "+0,0%"', () => {
    expect(fmtDeltaPct(0.04)).toBe('0,0%')
    expect(fmtDeltaPct(-0.04)).toBe('0,0%')
    expect(fmtDeltaPct(0)).toBe('0,0%')
  })
})

describe('fmtPct', () => {
  it('uma casa, vírgula pt-BR; null vira travessão', () => {
    expect(fmtPct(87.84)).toBe('87,8%')
    expect(fmtPct(100)).toBe('100,0%')
    expect(fmtPct(null)).toBe('—')
  })
})
