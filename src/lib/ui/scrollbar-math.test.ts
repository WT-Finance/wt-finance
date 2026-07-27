import { describe, it, expect } from 'vitest'
import { thumbGeom, scrollAoArrastar, THUMB_MIN, THUMB_CRUZ } from './scrollbar-math'

describe('thumbGeom — geometria do thumb por eixo', () => {
  it('conteúdo cabe (scroll ≤ client) → invisível', () => {
    expect(thumbGeom(300, 300, 0).visivel).toBe(false)
    expect(thumbGeom(250, 300, 0).visivel).toBe(false)
  })

  it('proporcional ao conteúdo: 2× o viewport → thumb ~metade', () => {
    const g = thumbGeom(600, 300, 0)
    expect(g.visivel).toBe(true)
    expect(g.tamanho).toBe(150) // 300/600 * 300
    expect(g.pos).toBe(0)       // topo
  })

  it('no fim do scroll → thumb encostado no fim do trilho', () => {
    const g = thumbGeom(600, 300, 300) // maxScroll = 300
    expect(g.pos).toBe(300 - g.tamanho) // livre = 300 - 150 = 150 = pos
  })

  it('no meio do scroll → thumb no meio do trilho livre', () => {
    const g = thumbGeom(600, 300, 150)
    expect(g.pos).toBe(75) // metade de (300-150)
  })

  it('conteúdo enorme → thumb nunca menor que THUMB_MIN', () => {
    const g = thumbGeom(100000, 300, 0)
    expect(g.tamanho).toBe(THUMB_MIN)
  })
})

describe('scrollAoArrastar — arraste do thumb → scrollTop, preso em [0, max]', () => {
  it('arrastar o thumb 1 px de trilho move o scroll pela razão max/livre', () => {
    // scrollSize 600, client 300: thumb 150, livre 150, max 300 → fator 2.
    expect(scrollAoArrastar(10, 0, 600, 300)).toBeCloseTo(20, 6)
  })

  it('arrastar além do fim prende no máximo (max = scrollSize − client)', () => {
    expect(scrollAoArrastar(1000, 0, 600, 300)).toBe(300)
  })

  it('arrastar para trás abaixo de zero prende em 0', () => {
    expect(scrollAoArrastar(-1000, 100, 600, 300)).toBe(0)
  })

  it('sem overflow (nada a rolar) → 0', () => {
    expect(scrollAoArrastar(50, 0, 300, 300)).toBe(0)
  })

  it('ida e volta é consistente: arrastar todo o trilho e depois todo de volta zera', () => {
    const noFim = scrollAoArrastar(150, 0, 600, 300) // livre = 150 → scroll no máximo
    expect(noFim).toBe(300)
    expect(scrollAoArrastar(-150, noFim, 600, 300)).toBe(0) // volta ao topo
  })

  it('folga (respiro nas pontas, v5.2.0): thumb começa em folga e termina em client − folga', () => {
    const inicio = thumbGeom(600, 300, 0, 8)
    expect(inicio.pos).toBe(8) // não encosta no topo
    const fim = thumbGeom(600, 300, 300, 8) // scroll no máximo (600 − 300)
    expect(fim.pos + fim.tamanho).toBe(300 - 8) // não encosta no rodapé
    // arraste consistente com a mesma folga: percorrer o trilho útil inteiro chega ao máximo
    const livre = (300 - 2 * 8) - fim.tamanho
    expect(scrollAoArrastar(livre, 0, 600, 300, 8)).toBe(300)
  })
})

describe('folga assimétrica no fim do trilho (THUMB_CRUZ — barras que se cruzam)', () => {
  it('folgaFim default = folga (comportamento anterior preservado)', () => {
    expect(thumbGeom(600, 300, 150, 8)).toEqual(thumbGeom(600, 300, 150, 8, 8))
  })

  it('folgaFim maior ENCURTA o trilho e o thumb nunca alcança o canto', () => {
    const simetrico = thumbGeom(600, 300, 300, 8)          // rolado até o fim (maxScroll = 300)
    const comCruz   = thumbGeom(600, 300, 300, 8, 8 + THUMB_CRUZ)
    const fimSim    = simetrico.pos + simetrico.tamanho
    const fimCruz   = comCruz.pos + comCruz.tamanho
    expect(fimCruz).toBeLessThan(fimSim)
    // sobra ao menos a reserva do cruzamento até a borda do container
    expect(300 - fimCruz).toBeGreaterThanOrEqual(THUMB_CRUZ)
  })

  it('o arraste usa o MESMO trilho encurtado (proporção não descola)', () => {
    const folgaFim = 8 + THUMB_CRUZ
    const fim = scrollAoArrastar(9999, 0, 600, 300, 8, folgaFim)
    expect(fim).toBe(300)                                   // satura no maxScroll, sem estourar
    const meio = scrollAoArrastar(0, 150, 600, 300, 8, folgaFim)
    expect(meio).toBe(150)                                  // delta zero não move
  })
})
