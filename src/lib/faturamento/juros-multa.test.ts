import { describe, it, expect } from 'vitest'
import { parsePctContrato, jurosMultaDoCadastro, JUROS_MULTA_DEFAULT } from './juros-multa'

describe('parsePctContrato — contrato estrito', () => {
  it('aceita as 4 strings do contrato', () => {
    expect(parsePctContrato('1%')).toBe(1)
    expect(parsePctContrato('2%')).toBe(2)
    expect(parsePctContrato('5%')).toBe(5)
    expect(parsePctContrato('10%')).toBe(10)
    expect(parsePctContrato('  10%  ')).toBe(10) // trima
  })
  it('rejeita qualquer outra coisa → null', () => {
    for (const v of ['', null, undefined, '3%', '1', '10', '1% ao mês', '10% do valor', 'padrão', '1,5%', '2 %', 'R$ 2']) {
      expect(parsePctContrato(v as string)).toBeNull()
    }
  })
})

describe('jurosMultaDoCadastro — MAPEAMENTO NÃO INVERTE (multa→fine, juros→interest)', () => {
  it('multa 10% + juros 1% → fine=10, interest=1 (o teste crítico)', () => {
    expect(jurosMultaDoCadastro({ pct_multa: '10%', pct_juros: '1%' })).toEqual({ fine: 10, interest: 1 })
  })
  it('valores distintos não se confundem: multa 5% + juros 2%', () => {
    expect(jurosMultaDoCadastro({ pct_multa: '5%', pct_juros: '2%' })).toEqual({ fine: 5, interest: 2 })
  })
  it('default 2/2 quando vazio / inválido / fora do cadastro', () => {
    expect(jurosMultaDoCadastro({ pct_multa: '', pct_juros: '' })).toEqual(JUROS_MULTA_DEFAULT)
    expect(jurosMultaDoCadastro({ pct_multa: '10% do valor', pct_juros: '1% ao mês' })).toEqual(JUROS_MULTA_DEFAULT)
    expect(jurosMultaDoCadastro(null)).toEqual({ fine: 2, interest: 2 })
    expect(jurosMultaDoCadastro(undefined)).toEqual({ fine: 2, interest: 2 })
  })
  it('mistura: multa do contrato (5%) + juros inválido → interest cai para 2', () => {
    expect(jurosMultaDoCadastro({ pct_multa: '5%', pct_juros: 'padrão' })).toEqual({ fine: 5, interest: 2 })
  })
})
