import { describe, it, expect } from 'vitest'
import { gerarTextoDecomposicao } from './decomposicao-variacao'

const NBSP = String.fromCharCode(160)
const n = (s: string) => s.split(NBSP).join(' ')

describe('gerarTextoDecomposicao', () => {
  it('variação < 10k → estável', () => {
    expect(gerarTextoDecomposicao(5000, [])).toMatch(/estável/i)
    expect(gerarTextoDecomposicao(-9999, [{ display_nome: 'X', variacao: -9999 }])).toMatch(/estável/i)
  })

  it('um único setor relevante concentra a variação', () => {
    const t = n(gerarTextoDecomposicao(-2_000_000, [{ display_nome: 'Weddings', variacao: -2_000_000 }]))
    expect(t).toContain('Weddings')
    expect(t).toContain('R$ 2,00 Mi')
    expect(t.toLowerCase()).toContain('queda')
  })

  it('múltiplos setores na mesma direção', () => {
    const t = n(gerarTextoDecomposicao(3_000_000, [
      { display_nome: 'Trips', variacao: 2_000_000 },
      { display_nome: 'Corp', variacao: 1_000_000 },
    ]))
    expect(t).toContain('Trips')
    expect(t).toContain('Corp')
    expect(t.toLowerCase()).toContain('aumento')
  })

  it('setores em direções opostas → fala em saldo', () => {
    const t = n(gerarTextoDecomposicao(500_000, [
      { display_nome: 'Trips', variacao: 2_000_000 },
      { display_nome: 'Weddings', variacao: -1_500_000 },
    ]))
    expect(t.toLowerCase()).toContain('saldo')
    expect(t).toContain('Trips')
    expect(t).toContain('Weddings')
  })
})
