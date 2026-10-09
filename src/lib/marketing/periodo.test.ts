import { describe, it, expect } from 'vitest'
import {
  anoDaData, mesDaData, mesLimite, mesNoRecorte, mesesDoRecorte,
  recortePadrao, rotuloAnos, rotuloPeriodoAnos, somarDias,
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

describe('mesesDoRecorte / mesNoRecorte', () => {
  it('lista os meses inclusivos nas duas pontas', () => {
    expect(mesesDoRecorte({ mesIni: 3, mesFim: 5 })).toEqual([3, 4, 5])
    expect(mesesDoRecorte({ mesIni: 7, mesFim: 7 })).toEqual([7])
    expect(mesNoRecorte(3, { mesIni: 3, mesFim: 5 })).toBe(true)
    expect(mesNoRecorte(5, { mesIni: 3, mesFim: 5 })).toBe(true)
    expect(mesNoRecorte(6, { mesIni: 3, mesFim: 5 })).toBe(false)
  })
})

describe('período multi-ano: rótulo e meses de cada ano', () => {
  it('rotuloAnos: do mais antigo ao mais recente, mesmo recebido fora de ordem', () => {
    expect(rotuloAnos([2026])).toBe('2026')
    expect(rotuloAnos([2025, 2026])).toBe('2025 + 2026')
    expect(rotuloAnos([2026, 2024, 2025])).toBe('2024 + 2025 + 2026')
  })

  it('ano corrente sozinho ou somado: sufixo "(até <mês>)"; ano fechado: só o número', () => {
    expect(rotuloPeriodoAnos([2026], HOJE)).toBe('2026 (até out)')
    expect(rotuloPeriodoAnos([2025, 2026], HOJE)).toBe('2025 + 2026 (até out)')
    expect(rotuloPeriodoAnos([2024, 2025, 2026], HOJE)).toBe('2024 + 2025 + 2026 (até out)')
    expect(rotuloPeriodoAnos([2025], HOJE)).toBe('2025')
    expect(rotuloPeriodoAnos([2024, 2025], HOJE)).toBe('2024 + 2025')
  })

  it('o sufixo acompanha o mês corrente; em dezembro o ano corrente já é inteiro', () => {
    expect(rotuloPeriodoAnos([2026], '2026-01-05')).toBe('2026 (até jan)')
    expect(rotuloPeriodoAnos([2025, 2026], '2026-03-31')).toBe('2025 + 2026 (até mar)')
    expect(rotuloPeriodoAnos([2025, 2026], '2026-12-10')).toBe('2025 + 2026')
  })

  it('os meses de cada ano do período: fechado jan–dez, corrente jan até o mês de hoje', () => {
    const recortes = [2025, 2026].map(a => mesesDoRecorte(recortePadrao(a, HOJE)))
    expect(recortes[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(recortes[1]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
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
