import { describe, expect, it } from 'vitest'
import { deltaYtd } from '@/lib/dre/colunas-tabela'
import { variacao } from './variacao'

describe('variacao — Δ da DRE com polaridade', () => {
  it('usa o deltaYtd da DRE (não reimplementa): mesmo número', () => {
    for (const [a, b] of [[100, 120], [-100, -150], [-100, -50], [80, 40]] as const) {
      expect(variacao(a, b, 'sem-juizo').pct).toBe(deltaYtd(a, b))
    }
  })

  it('despesa no sinal da DRE (negativa): crescer a despesa é Δ negativo = desfavorável', () => {
    expect(variacao(-100, -150, 'maior-melhor')).toEqual({ pct: -50, sentido: 'desfavoravel' })
    expect(variacao(-100, -50, 'maior-melhor')).toEqual({ pct: 50, sentido: 'favoravel' })
  })

  it('estoque que se quer menor (inadimplência): subir é desfavorável', () => {
    expect(variacao(1000, 1200, 'menor-melhor').sentido).toBe('desfavoravel')
    expect(variacao(1000, 800, 'menor-melhor').sentido).toBe('favoravel')
  })

  it('sem juízo (volume antecipado): traz o Δ, nunca a palavra', () => {
    expect(variacao(1000, 1500, 'sem-juizo')).toEqual({ pct: 50, sentido: null })
  })

  it('falta de referência ou denominador zero → sem Δ (nunca Infinity/NaN)', () => {
    expect(variacao(null, 100, 'maior-melhor')).toEqual({ pct: null, sentido: null })
    expect(variacao(undefined, 100, 'maior-melhor')).toEqual({ pct: null, sentido: null })
    expect(variacao(100, null, 'maior-melhor')).toEqual({ pct: null, sentido: null })
    expect(variacao(0, 100, 'menor-melhor')).toEqual({ pct: null, sentido: null })
    expect(variacao(0.001, 100, 'menor-melhor')).toEqual({ pct: null, sentido: null })
  })

  it('variação que arredonda a 0,0% é "estável", não favorável nem desfavorável', () => {
    expect(variacao(100000, 100001, 'maior-melhor').sentido).toBe('neutro')
    expect(variacao(100000, 99999, 'menor-melhor').sentido).toBe('neutro')
    expect(variacao(100, 100, 'maior-melhor')).toEqual({ pct: 0, sentido: 'neutro' })
  })

  it('sair de prejuízo para lucro lê como melhora (denominador em módulo)', () => {
    expect(variacao(-100, 50, 'maior-melhor')).toEqual({ pct: 150, sentido: 'favoravel' })
  })
})
