import { describe, it, expect } from 'vitest'
import { MAX_ANOS } from './anos'
import { TONS_DO_ANO, coresDosAnos } from './cores'

describe('coresDosAnos — o mais recente na cor principal, os anteriores em cinzas mais claros', () => {
  it('um ano: a cor principal da série', () => {
    expect(coresDosAnos([2026])).toEqual(['var(--action-soft-border)'])
  })

  it('dois anos: o anterior em um tom mais claro, o mais recente (à direita) na principal', () => {
    expect(coresDosAnos([2025, 2026])).toEqual(['var(--text-subtle)', 'var(--action-soft-border)'])
  })

  it('três anos: dois tons progressivamente mais claros para trás', () => {
    expect(coresDosAnos([2024, 2025, 2026])).toEqual([
      'var(--band)', 'var(--text-subtle)', 'var(--action-soft-border)',
    ])
  })

  it('segue a POSIÇÃO entre os selecionados, não o calendário: 2024 + 2026 recebem tons vizinhos', () => {
    expect(coresDosAnos([2024, 2026])).toEqual(['var(--text-subtle)', 'var(--action-soft-border)'])
  })

  it('só tokens (nunca hex) e, com o teto de anos, nenhuma cor se repete', () => {
    expect(TONS_DO_ANO.every(c => /^var\(--[a-z-]+\)$/.test(c))).toBe(true)
    expect(TONS_DO_ANO.length).toBeGreaterThanOrEqual(MAX_ANOS)
    const cores = coresDosAnos([2024, 2025, 2026].slice(-MAX_ANOS))
    expect(new Set(cores).size).toBe(cores.length)
  })
})
