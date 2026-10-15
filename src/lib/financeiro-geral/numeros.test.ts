import { describe, expect, it } from 'vitest'
import { diaMes, pctDe, somarCentavos } from './numeros'

describe('numeros', () => {
  it('somarCentavos não carrega ruído de ponto flutuante', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(somarCentavos([0.1, 0.2])).toBe(0.3)
    expect(somarCentavos([-205629.09, 80119.24])).toBe(-125509.85)
    expect(somarCentavos([])).toBe(0)
  })
  it('pctDe: proporção com o sinal; total ~0 → null', () => {
    expect(pctDe(-180, 9000)).toBeCloseTo(-2, 10)
    expect(pctDe(5, 0)).toBeNull()
  })
  it('diaMes', () => {
    expect(diaMes('2026-09-05')).toBe('05/09')
  })
})
