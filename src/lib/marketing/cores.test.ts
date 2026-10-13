import { describe, it, expect } from 'vitest'
import { TONS_DO_ANO, coresDosAnos, coresPorAno } from './cores'

describe('coresDosAnos — o mais recente na cor principal, os anteriores em cinzas mais claros', () => {
  it('um ano: a cor principal da série', () => {
    expect(coresDosAnos([2026])).toEqual(['var(--action-primary)'])
  })

  it('dois anos: o anterior em um tom mais claro, o mais recente (à direita) na principal', () => {
    expect(coresDosAnos([2025, 2026])).toEqual(['var(--action-soft-border)', 'var(--action-primary)'])
  })

  it('três anos: dois tons progressivamente mais claros para trás', () => {
    expect(coresDosAnos([2024, 2025, 2026])).toEqual([
      'var(--text-subtle)', 'var(--action-soft-border)', 'var(--action-primary)',
    ])
  })

  it('segue a POSIÇÃO entre os selecionados, não o calendário: 2024 + 2026 recebem tons vizinhos', () => {
    expect(coresDosAnos([2024, 2026])).toEqual(['var(--action-soft-border)', 'var(--action-primary)'])
  })

  it('só tokens (nunca hex) e, com até 3 anos, nenhuma cor se repete', () => {
    expect(TONS_DO_ANO.every(c => /^var\(--[a-z-]+\)$/.test(c))).toBe(true)
    expect(TONS_DO_ANO.length).toBe(3)
    const cores = coresDosAnos([2024, 2025, 2026])
    expect(new Set(cores).size).toBe(cores.length)
  })

  it('SEM teto de anos: com mais de 3, os mais antigos REPETEM o tom mais claro (--text-subtle)', () => {
    expect(coresDosAnos([2022, 2023, 2024, 2025, 2026])).toEqual([
      'var(--text-subtle)', 'var(--text-subtle)', 'var(--text-subtle)',
      'var(--action-soft-border)', 'var(--action-primary)',
    ])
    // Os três mais recentes mantêm a escada de sempre.
    expect(coresDosAnos([2023, 2024, 2025, 2026]).slice(-3)).toEqual(coresDosAnos([2024, 2025, 2026]))
  })

  it('o tom mais claro NÃO é a banda (#E8E6E1 sumia como barra): fica em --text-subtle', () => {
    expect(TONS_DO_ANO).not.toContain('var(--band)')
    expect(TONS_DO_ANO[TONS_DO_ANO.length - 1]).toBe('var(--text-subtle)')
  })
})

describe('coresPorAno — a cor é do ANO, pela lista dos SELECIONADOS', () => {
  it('mesma escada de coresDosAnos, indexada por ano, qualquer que seja a ordem de entrada', () => {
    const m = coresPorAno([2026, 2024, 2025])
    expect(m.get(2024)).toBe('var(--text-subtle)')
    expect(m.get(2025)).toBe('var(--action-soft-border)')
    expect(m.get(2026)).toBe('var(--action-primary)')
  })

  it('a falha de um ano não muda a cor dos outros: quem colore passa os selecionados, não os carregados', () => {
    const selecionados = [2024, 2025, 2026]
    const carregados = [2024, 2026] // 2025 falhou
    const porSelecionados = coresPorAno(selecionados)
    // Errado (o que a SerieMensal fazia): colorir só os carregados desloca a escada.
    expect(coresDosAnos(carregados)[0]).not.toBe(porSelecionados.get(2024))
    // Certo: o ano carregado lê a sua cor no mapa dos selecionados.
    expect(carregados.map(a => porSelecionados.get(a))).toEqual([
      'var(--text-subtle)', 'var(--action-primary)',
    ])
  })

  it('anos repetidos na entrada não deslocam a escada', () => {
    expect(coresPorAno([2025, 2025, 2026]).get(2026)).toBe('var(--action-primary)')
    expect(coresPorAno([2025, 2025, 2026]).get(2025)).toBe('var(--action-soft-border)')
  })
})
