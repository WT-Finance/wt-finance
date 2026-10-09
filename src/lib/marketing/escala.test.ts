import { describe, it, expect } from 'vitest'
import { escalaSerie } from './escala'

describe('escalaSerie — eixo de uma série de gasto (negativa)', () => {
  it('série só negativa: domínio vai de abaixo do menor valor até o zero, com ticks redondos', () => {
    const e = escalaSerie([-10000, -20000, -15000])
    expect(e.domain).toEqual([-20000, 0])
    expect(e.ticks).toEqual([-20000, -15000, -10000, -5000, 0])
  })

  it('o zero é sempre um tick (o ancoramento do domínio default NÃO é herdado)', () => {
    for (const serie of [[-3000], [-123456, -98765], [-40, -10], [-18000, 2500, -3000]]) {
      const e = escalaSerie(serie)
      expect(e.ticks).toContain(0)
      expect(e.ticks[0]).toBe(e.domain[0])
      expect(e.ticks[e.ticks.length - 1]).toBe(e.domain[1])
    }
  })

  it('estorno positivo: o domínio abre para cima sem cortar os negativos', () => {
    const e = escalaSerie([-18000, 2500, -3000])
    expect(e.domain).toEqual([-18000, 6000])
    expect(e.ticks).toEqual([-18000, -12000, -6000, 0, 6000])
  })

  it('o domínio sempre CONTÉM todos os pontos (nenhum sai do eixo)', () => {
    const series = [[-1, -2], [-99999.99, -1], [-250000, 1800], [-7, 0, -3.5]]
    for (const s of series) {
      const e = escalaSerie(s)
      for (const v of s) {
        expect(v).toBeGreaterThanOrEqual(e.domain[0])
        expect(v).toBeLessThanOrEqual(e.domain[1])
      }
    }
  })

  it('null/undefined (mês não alcançado, ano anterior que falhou) são ignorados', () => {
    const e = escalaSerie([null, -1000, undefined])
    expect(e.domain).toEqual([-1000, 0])
    expect(e.ticks).toEqual([-1000, -750, -500, -250, 0])
  })

  it('série toda zero (ou vazia) devolve um eixo mínimo legível, sem NaN', () => {
    for (const s of [[], [0, 0], [null]]) {
      const e = escalaSerie(s)
      expect(e.domain).toEqual([-4000, 0])
      expect(e.ticks.every(Number.isFinite)).toBe(true)
    }
  })
})
