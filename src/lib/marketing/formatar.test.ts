import { describe, it, expect } from 'vitest'
import { fmtPct } from './formatar'

describe('fmtPct', () => {
  it('uma casa, vírgula pt-BR; null vira travessão', () => {
    expect(fmtPct(87.84)).toBe('87,8%')
    expect(fmtPct(100)).toBe('100,0%')
    expect(fmtPct(null)).toBe('—')
  })

  it('nunca mostra "-0,0%"', () => {
    expect(fmtPct(-0.04)).toBe('0,0%')
    expect(fmtPct(0)).toBe('0,0%')
  })
})
