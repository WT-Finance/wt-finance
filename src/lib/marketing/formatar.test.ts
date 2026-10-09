import { describe, it, expect } from 'vitest'
import { fmtDeltaPct, fmtPct } from './formatar'

describe('fmtDeltaPct — variação com sinal, no molde do Δ% da DRE', () => {
  it('positivo com "+", negativo com o menos tipográfico, uma casa e vírgula pt-BR', () => {
    expect(fmtDeltaPct(16.34)).toBe('+16,3%')
    expect(fmtDeltaPct(-34.5)).toBe('−34,5%')
    expect(fmtDeltaPct(-20)).toBe('−20,0%')
  })

  it('zero sem sinal e nunca "−0,0%"; null vira travessão', () => {
    expect(fmtDeltaPct(0)).toBe('0,0%')
    expect(fmtDeltaPct(-0.04)).toBe('0,0%')
    expect(fmtDeltaPct(0.04)).toBe('0,0%')
    expect(fmtDeltaPct(null)).toBe('—')
  })
})

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
