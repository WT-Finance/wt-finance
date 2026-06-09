import { describe, it, expect } from 'vitest'
import {
  fmtBRL, fmtBRL2, numBRL2, fmtMi, fmtAxisBRL, fmtMeses,
  fmtAxisPct, fmtAxisMes, fmtDate, fmtDateCompact, fmtDateLong, fmtDateMid, fmtDataHora,
  parseLocalDate,
} from './fmt'

// Intl pt-BR usa NBSP (char 160) entre "R$" e o número; normalizamos para espaço comum.
const NBSP = String.fromCharCode(160)
const n = (s: string) => s.split(NBSP).join(' ')

describe('fmt — moeda', () => {
  it('fmtBRL: sem centavos, separador de milhar', () => {
    expect(n(fmtBRL(0))).toBe('R$ 0')
    expect(n(fmtBRL(1234567))).toBe('R$ 1.234.567')
  })

  it('fmtBRL2: 2 casas (operação individual)', () => {
    expect(n(fmtBRL2(1234.5))).toBe('R$ 1.234,50')
    expect(n(fmtBRL2(0))).toBe('R$ 0,00')
  })

  it('numBRL2: contábil, sem símbolo, 2 casas', () => {
    expect(numBRL2(344444.4)).toBe('344.444,40')
  })

  it('fmtMi: abreviação por faixa', () => {
    expect(n(fmtMi(1_800_000))).toBe('R$ 1,80 Mi')
    expect(n(fmtMi(600_000))).toBe('R$ 600,0 k')
    expect(n(fmtMi(1_500))).toBe('R$ 1,5 k')
    expect(n(fmtMi(999))).toBe(n(fmtBRL(999)))       // < 1k cai no fmtBRL
    expect(n(fmtMi(-2_000_000))).toBe('R$ -2,00 Mi')  // usa abs para escolher a faixa
  })

  it('fmtAxisBRL: tick curto (1 casa em Mi, arredondado em k)', () => {
    expect(fmtAxisBRL(0)).toBe('R$ 0')
    expect(n(fmtAxisBRL(1_800_000))).toBe('R$ 1,8 Mi')
    expect(n(fmtAxisBRL(600_000))).toBe('R$ 600 k')
    expect(n(fmtAxisBRL(500))).toBe('R$ 500')
  })
})

describe('fmt — números/percentual/duração', () => {
  it('fmtAxisPct', () => {
    expect(fmtAxisPct(14)).toBe('14%')
    expect(fmtAxisPct(-3.5, 1)).toBe('-3,5%')
  })

  it('fmtMeses: dias corridos → meses (30,44 d/mês)', () => {
    expect(fmtMeses(112)).toBe('3,7 meses') // 112/30,44 ≈ 3,68
    expect(fmtMeses(0)).toBe('0,0 meses')
  })
})

describe('fmt — datas (parsing por split, sem fuso)', () => {
  it('fmtAxisMes: yyyy-MM e yyyy-MM-dd', () => {
    expect(fmtAxisMes('2026-01')).toBe('jan/26')
    expect(fmtAxisMes('2026-12-31')).toBe('dez/26')
  })

  it('fmtDate / fmtDateCompact / fmtDateLong / fmtDateMid', () => {
    expect(fmtDate('2026-06-08')).toBe('08/06/2026')
    expect(fmtDateCompact('2026-05-21')).toBe('21 mai 2026')
    expect(fmtDateLong('2026-11-07')).toBe('07 de novembro de 2026')
    expect(fmtDateMid('2026-06-17')).toBe('17 de jun de 2026')
  })

  it('fmtDataHora: com e sem hora', () => {
    expect(fmtDataHora('2026-06-05T17:53')).toBe('05 de jun de 2026, às 17h53min')
    expect(fmtDataHora('2026-06-05')).toBe('05 de jun de 2026')
  })

  it('parseLocalDate: parse LOCAL, sem deslocamento de fuso (F6)', () => {
    const d = parseLocalDate('2026-06-08')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)  // junho (0-based)
    expect(d.getDate()).toBe(8)   // NÃO 7 — o componente do dia é preservado
    expect(d.getHours()).toBe(0)
    // aceita 'yyyy-MM-ddT…' (ignora a hora)
    expect(parseLocalDate('2026-12-31T10:00').getDate()).toBe(31)
  })
})
