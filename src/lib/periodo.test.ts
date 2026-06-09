import { describe, it, expect } from 'vitest'
import {
  resolvePeriodo, calcularPeriodoAnterior, calcularPeriodoYoY,
  granularidadeSugerida, formatarLabelPeriodo, resolverPeriodoCompleto,
  periodoEncerrado,
} from './periodo'

// hoje fixo: 15 de maio de 2026 (local) — torna os testes determinísticos.
const HOJE = new Date(2026, 4, 15)
const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()]

describe('resolvePeriodo (hoje fixo = 2026-05-15)', () => {
  it('este-mes → maio inteiro', () => {
    const p = resolvePeriodo('este-mes', HOJE)
    expect(ymd(p.inicio)).toEqual([2026, 5, 1])
    expect(ymd(p.fim)).toEqual([2026, 5, 31])
  })
  it('mes-passado → abril inteiro', () => {
    const p = resolvePeriodo('mes-passado', HOJE)
    expect(ymd(p.inicio)).toEqual([2026, 4, 1])
    expect(ymd(p.fim)).toEqual([2026, 4, 30])
  })
  it('ultimos-3-meses → mar 1 a mai 31', () => {
    const p = resolvePeriodo('ultimos-3-meses', HOJE)
    expect(ymd(p.inicio)).toEqual([2026, 3, 1])
    expect(ymd(p.fim)).toEqual([2026, 5, 31])
  })
  it('este-ano → jan 1 a mai 31', () => {
    const p = resolvePeriodo('este-ano', HOJE)
    expect(ymd(p.inicio)).toEqual([2026, 1, 1])
    expect(ymd(p.fim)).toEqual([2026, 5, 31])
  })
  it('personalizado exige inicio/fim', () => {
    expect(() => resolvePeriodo('personalizado', HOJE)).toThrow()
  })
})

describe('comparativos', () => {
  it('calcularPeriodoAnterior: bloco anterior de mesma duração', () => {
    const ant = calcularPeriodoAnterior({ inicio: new Date(2026, 2, 1), fim: new Date(2026, 2, 15) })
    expect(ymd(ant.fim)).toEqual([2026, 2, 28])   // dia anterior ao início
    expect(ymd(ant.inicio)).toEqual([2026, 2, 14]) // 14 dias antes do fim anterior
  })
  it('calcularPeriodoYoY: mesmo intervalo do ano anterior', () => {
    const yoy = calcularPeriodoYoY({ inicio: new Date(2026, 4, 1), fim: new Date(2026, 4, 31) })
    expect(ymd(yoy.inicio)).toEqual([2025, 5, 1])
    expect(ymd(yoy.fim)).toEqual([2025, 5, 31])
  })
  it('periodoEncerrado', () => {
    expect(periodoEncerrado({ inicio: new Date(2026, 0, 1), fim: new Date(2026, 0, 31) }, HOJE)).toBe(true)
    expect(periodoEncerrado({ inicio: new Date(2026, 4, 1), fim: new Date(2026, 4, 31) }, HOJE)).toBe(false)
  })
})

describe('resolverPeriodoCompleto (em curso, este-ano, hoje=2026-05-15)', () => {
  const c = resolverPeriodoCompleto({ preset: 'este-ano' }, HOJE)
  it('from/to do ano corrente', () => {
    expect(c.from).toBe('2026-01-01')
    expect(c.to).toBe('2026-05-31')
  })
  it('eParcial true (período ainda em curso)', () => {
    expect(c.eParcial).toBe(true)
  })
  it('YoY proporcional até hoje−1ano', () => {
    expect(c.yoyFrom).toBe('2025-01-01')
    expect(c.yoyTo).toBe('2025-05-15')
  })
})

describe('granularidade e rótulos', () => {
  it('granularidadeSugerida por duração', () => {
    expect(granularidadeSugerida({ inicio: new Date(2026, 4, 1), fim: new Date(2026, 4, 15) })).toBe('diario')
    expect(granularidadeSugerida({ inicio: new Date(2026, 4, 1), fim: new Date(2026, 5, 30) })).toBe('semanal')
    expect(granularidadeSugerida({ inicio: new Date(2026, 0, 1), fim: new Date(2026, 3, 30) })).toBe('mensal')
  })
  it('formatarLabelPeriodo', () => {
    expect(formatarLabelPeriodo('este-mes', '2026-05-01', '2026-05-31')).toBe('Maio/2026')
    expect(formatarLabelPeriodo('este-ano', '2026-01-01', '2026-12-31')).toBe('2026')
    expect(formatarLabelPeriodo('ultimos-3-meses', '2026-03-01', '2026-05-31')).toBe('Últimos 3 meses')
  })
})
