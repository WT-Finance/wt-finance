import { describe, it, expect } from 'vitest'
import {
  anoDaData, mesDaData, mesLimite, mesNoRecorte, mesesDoRecorte,
  recortePadrao, rotuloRecorte, rotuloRecorteAno, somarDias,
} from './periodo'

const HOJE = '2026-10-08'

describe('data → ano e mês', () => {
  it('lê ano e mês de uma data ISO', () => {
    expect(anoDaData('2026-03-14')).toBe(2026)
    expect(mesDaData('2026-03-14')).toBe(3)
    expect(mesDaData('2026-12-01T10:00:00Z')).toBe(12)
  })
})

describe('mesLimite / recortePadrao', () => {
  it('ano em curso vai até o mês de hoje; ano encerrado, até dezembro; ano futuro não inventa mês', () => {
    expect(mesLimite(2026, HOJE)).toBe(10)
    expect(mesLimite(2025, HOJE)).toBe(12)
    expect(mesLimite(2027, HOJE)).toBe(1)
  })

  it('recorte padrão = de janeiro ao último mês alcançado (YTD no ano em curso)', () => {
    expect(recortePadrao(2026, HOJE)).toEqual({ mesIni: 1, mesFim: 10 })
    expect(recortePadrao(2025, HOJE)).toEqual({ mesIni: 1, mesFim: 12 })
  })
})

describe('mesesDoRecorte / mesNoRecorte / rótulos', () => {
  it('lista os meses inclusivos nas duas pontas', () => {
    expect(mesesDoRecorte({ mesIni: 3, mesFim: 5 })).toEqual([3, 4, 5])
    expect(mesesDoRecorte({ mesIni: 7, mesFim: 7 })).toEqual([7])
    expect(mesNoRecorte(3, { mesIni: 3, mesFim: 5 })).toBe(true)
    expect(mesNoRecorte(5, { mesIni: 3, mesFim: 5 })).toBe(true)
    expect(mesNoRecorte(6, { mesIni: 3, mesFim: 5 })).toBe(false)
  })

  it('rótulo do recorte para os subtítulos', () => {
    expect(rotuloRecorte({ mesIni: 1, mesFim: 9 })).toBe('Jan–Set')
    expect(rotuloRecorte({ mesIni: 3, mesFim: 3 })).toBe('Mar')
    expect(rotuloRecorteAno({ mesIni: 1, mesFim: 9 }, 2026)).toBe('Jan–Set/2026')
  })
})

describe('somarDias (calendário puro, sem fuso)', () => {
  it('atravessa mês, ano e bissexto', () => {
    expect(somarDias('2026-10-08', -9)).toBe('2026-09-29')
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(somarDias('2024-03-01', -1)).toBe('2024-02-29')
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
  })
})
