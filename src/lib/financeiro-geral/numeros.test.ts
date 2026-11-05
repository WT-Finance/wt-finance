import { describe, expect, it } from 'vitest'
import { diaMes, diasEntre, emCentavos, pctDe, segundaDaSemana, somarCentavos, somarDias } from './numeros'

describe('numeros', () => {
  it('somarCentavos não carrega ruído de ponto flutuante', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(somarCentavos([0.1, 0.2])).toBe(0.3)
    expect(somarCentavos([-205629.09, 80119.24])).toBe(-125509.85)
    expect(somarCentavos([])).toBe(0)
  })
  it('emCentavos devolve inteiro, também onde o ponto flutuante dá dízima', () => {
    expect(emCentavos(0.1 + 0.2)).toBe(30)
    expect(emCentavos(199767.74)).toBe(19976774)
    expect(emCentavos(-77892.96)).toBe(-7789296)
    expect(Number.isInteger(emCentavos(12146832.84))).toBe(true)
  })
  it('pctDe: proporção com o sinal; total ~0 → null', () => {
    expect(pctDe(-180, 9000)).toBeCloseTo(-2, 10)
    expect(pctDe(5, 0)).toBeNull()
  })
  it('diaMes', () => {
    expect(diaMes('2026-09-05')).toBe('05/09')
  })
})

describe('calendário puro', () => {
  it('diasEntre: sem fuso nem horário de verão; negativo quando invertido', () => {
    expect(diasEntre('2026-10-05', '2026-10-15')).toBe(10)
    expect(diasEntre('2026-02-27', '2026-03-01')).toBe(2)
    expect(diasEntre('2025-12-31', '2026-01-01')).toBe(1)
    expect(diasEntre('2026-10-15', '2026-10-15')).toBe(0)
    expect(diasEntre('2026-10-15', '2026-10-05')).toBe(-10)
  })
  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-10-26', 7)).toBe('2026-11-02')
    expect(somarDias('2026-01-03', -7)).toBe('2025-12-27')
    expect(somarDias('2024-02-28', 2)).toBe('2024-03-01') // 2024 é bissexto: 29/02 existe
    expect(somarDias('2026-10-26', 0)).toBe('2026-10-26')
  })
  it('segundaDaSemana: seg–dom; segunda e domingo são os casos de borda', () => {
    expect(segundaDaSemana('2026-10-26')).toBe('2026-10-26') // segunda
    expect(segundaDaSemana('2026-10-25')).toBe('2026-10-19') // domingo fecha a semana anterior
    expect(segundaDaSemana('2026-10-15')).toBe('2026-10-12') // quinta
    expect(segundaDaSemana('2026-01-01')).toBe('2025-12-29') // atravessa o ano
  })
})
