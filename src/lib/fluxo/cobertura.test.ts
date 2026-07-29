import { describe, it, expect } from 'vitest'
import { calcularCobertura, tCritico95, FATOR_ANTECIPACAO } from './cobertura'

describe('tCritico95', () => {
  it('valores canônicos da tabela t (bicaudal, 95%)', () => {
    expect(tCritico95(1)).toBeCloseTo(12.706, 3)
    expect(tCritico95(5)).toBeCloseTo(2.571, 3)
    expect(tCritico95(30)).toBeCloseTo(2.042, 3)
  })
  it('df > 30 cai no z normal (1,96); df < 1 é NaN', () => {
    expect(tCritico95(31)).toBe(1.96)
    expect(tCritico95(120)).toBe(1.96)
    expect(Number.isNaN(tCritico95(0))).toBe(true)
  })
})

describe('calcularCobertura', () => {
  it('caso da referência: 16,96 Mi ÷ 4,44 Mi/mês ≈ 3,8 meses', () => {
    // 5 meses com média 4,44 Mi (variância pequena, só para o denominador ser realista)
    const saidas = [4.2e6, 4.5e6, 4.44e6, 4.66e6, 4.4e6]
    const r = calcularCobertura(16.96e6, saidas)!
    expect(r.n).toBe(5)
    expect(r.semTaxa.meses).toBeCloseTo(16.96e6 / r.mediaSaida, 10)
    expect(r.semTaxa.meses).toBeGreaterThan(3.7)
    expect(r.semTaxa.meses).toBeLessThan(3.9)
  })

  it('IC calculado à mão: R=12, saídas [3,4,5] → t(2)=4,303', () => {
    // média 4, sd 1, SE 1/√3=0,57735, m±t·SE = 4 ± 2,48438 → [1,51562, 6,48438]
    const r = calcularCobertura(12, [3, 4, 5])!
    expect(r.mediaSaida).toBeCloseTo(4, 10)
    expect(r.sdSaida).toBeCloseTo(1, 10)
    expect(r.se).toBeCloseTo(1 / Math.sqrt(3), 10)
    expect(r.tCrit).toBeCloseTo(4.303, 3)
    expect(r.semTaxa.meses).toBeCloseTo(3, 10)
    expect(r.semTaxa.icLo).toBeCloseTo(12 / 6.48438, 3)
    expect(r.semTaxa.icHi!).toBeCloseTo(12 / 1.51562, 3)
  })

  it('com taxa de antecipação = 0,96 × cada ponta do IC (mesmo denominador)', () => {
    const r = calcularCobertura(12, [3, 4, 5])!
    expect(r.comTaxa.meses).toBeCloseTo(r.semTaxa.meses * FATOR_ANTECIPACAO, 10)
    expect(r.comTaxa.icLo).toBeCloseTo(r.semTaxa.icLo * FATOR_ANTECIPACAO, 10)
    expect(r.comTaxa.icHi!).toBeCloseTo(r.semTaxa.icHi! * FATOR_ANTECIPACAO, 10)
  })

  it('variância zero → IC colapsa no ponto', () => {
    const r = calcularCobertura(8, [4, 4, 4, 4])!
    expect(r.semTaxa.meses).toBe(2)
    expect(r.semTaxa.icLo).toBe(2)
    expect(r.semTaxa.icHi).toBe(2)
  })

  it('denominador indistinguível de zero (m − t·SE ≤ 0) → teto ABERTO (null)', () => {
    // [1, 10]: média 5,5, sd 6,364, SE 4,5, t(1)=12,706 → m − t·SE ≪ 0
    const r = calcularCobertura(10, [1, 10])!
    expect(r.semTaxa.icHi).toBeNull()
    expect(r.comTaxa.icHi).toBeNull()
    expect(r.semTaxa.icLo).toBeGreaterThan(0)
  })

  it('n = 1: sem variância amostral → IC degenera no ponto', () => {
    const r = calcularCobertura(9, [3])!
    expect(r.n).toBe(1)
    expect(r.semTaxa).toEqual({ meses: 3, icLo: 3, icHi: 3 })
  })

  it('saídas com sinal (negativas do fato) são normalizadas por módulo', () => {
    const neg = calcularCobertura(12, [-3, -4, -5])!
    const pos = calcularCobertura(12, [3, 4, 5])!
    expect(neg.semTaxa).toEqual(pos.semTaxa)
  })

  it('sem base → null (recebíveis ≤ 0, sem meses, média 0)', () => {
    expect(calcularCobertura(0, [3, 4])).toBeNull()
    expect(calcularCobertura(-5, [3, 4])).toBeNull()
    expect(calcularCobertura(10, [])).toBeNull()
    expect(calcularCobertura(10, [0, 0])).toBeNull()
  })
})
