import { describe, it, expect } from 'vitest'
import { clampTooltip } from './tooltip-clamp'

// Viewport de 1000px, balão de 200px, margem 8. Container começa em x=100.
const BASE = { tipW: 200, viewportW: 1000, containerLeft: 100, margin: 8, caretMin: 12 }
const dentroDoViewport = (leftRelativo: number) => {
  const leftVp = leftRelativo + BASE.containerLeft
  expect(leftVp).toBeGreaterThanOrEqual(BASE.margin - 0.001)
  expect(leftVp + BASE.tipW).toBeLessThanOrEqual(BASE.viewportW - BASE.margin + 0.001)
}

describe('clampTooltip — nunca vaza do viewport, seta sempre no tick', () => {
  it('tick no meio (folga dos dois lados) → balão centrado, seta no centro', () => {
    const r = clampTooltip({ ...BASE, tickX: 500 })
    expect(r.left + BASE.containerLeft).toBeCloseTo(400, 6) // 500 - 100
    expect(r.caret).toBeCloseTo(100, 6)                     // centro do balão
    dentroDoViewport(r.left)
  })

  it('tick colado na borda DIREITA → balão trava antes da borda, seta desliza p/ direita', () => {
    const r = clampTooltip({ ...BASE, tickX: 995 }) // quase no fim
    dentroDoViewport(r.left)                        // não vaza
    expect(r.left + BASE.containerLeft + BASE.tipW).toBeCloseTo(1000 - 8, 6) // encostou na margem
    expect(r.caret).toBeGreaterThan(100)            // seta foi p/ a direita do balão…
    expect(r.caret).toBeLessThanOrEqual(200 - 12)   // …mas dentro dele
  })

  it('tick colado na borda ESQUERDA → balão trava na margem, seta desliza p/ esquerda', () => {
    const r = clampTooltip({ ...BASE, tickX: 5 })
    dentroDoViewport(r.left)
    expect(r.left + BASE.containerLeft).toBeCloseTo(8, 6) // encostou na margem esquerda
    expect(r.caret).toBeGreaterThanOrEqual(12)            // seta presa dentro do balão
    expect(r.caret).toBeLessThan(100)
  })

  it('varredura: para qualquer tick, o balão fica dentro do viewport', () => {
    for (let x = -50; x <= 1050; x += 7) {
      const r = clampTooltip({ ...BASE, tickX: x })
      dentroDoViewport(r.left)
      expect(r.caret).toBeGreaterThanOrEqual(12 - 0.001)
      expect(r.caret).toBeLessThanOrEqual(200 - 12 + 0.001)
    }
  })
})
