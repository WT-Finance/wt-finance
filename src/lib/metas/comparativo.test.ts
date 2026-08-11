import { describe, it, expect } from 'vitest'
import {
  chaveMes, janelaDoMes, mesSeguinte, rotuloMes, resolverMeses, montarComparativo,
  ANOS_YOY,
  type MesRef,
} from './comparativo'
import type { MetaMensal } from './ritmo'

describe('chaveMes / janelaDoMes', () => {
  it('chaveMes é yyyy-MM zero-padded', () => {
    expect(chaveMes({ ano: 2026, mes: 8 })).toBe('2026-08')
    expect(chaveMes({ ano: 2026, mes: 12 })).toBe('2026-12')
  })

  it('janelaDoMes devolve primeiro/último dia ISO', () => {
    expect(janelaDoMes({ ano: 2026, mes: 8 })).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    expect(janelaDoMes({ ano: 2024, mes: 2 })).toEqual({ from: '2024-02-01', to: '2024-02-29' }) // bissexto
  })
})

describe('mesSeguinte', () => {
  it('mês comum', () => {
    expect(mesSeguinte({ ano: 2026, mes: 7 })).toEqual({ ano: 2026, mes: 8 })
  })
  it('virada dez → jan do ano seguinte', () => {
    expect(mesSeguinte({ ano: 2026, mes: 12 })).toEqual({ ano: 2027, mes: 1 })
  })
})

describe('rotuloMes', () => {
  it('formato mmm/aa (mesma base do eixo mensal)', () => {
    expect(rotuloMes({ ano: 2026, mes: 8 })).toBe('ago/26')
  })
  it('sufixo " (parcial)" quando parcial=true', () => {
    expect(rotuloMes({ ano: 2026, mes: 8 }, true)).toBe('ago/26 (parcial)')
    expect(rotuloMes({ ano: 2026, mes: 8 }, false)).toBe('ago/26')
  })
})

describe('resolverMeses', () => {
  const HOJE = '2026-08-11'

  it("'este-mes' — mês corrente + ANOS_YOY anos anteriores, ASC", () => {
    const meses = resolverMeses('este-mes', HOJE)
    expect(ANOS_YOY).toBe(2)
    expect(meses).toEqual([
      { ano: 2024, mes: 8 },
      { ano: 2025, mes: 8 },
      { ano: 2026, mes: 8 },
    ])
  })

  it("'ultimo-mes' — mês ANTERIOR ao corrente + ANOS_YOY anos anteriores, ASC", () => {
    const meses = resolverMeses('ultimo-mes', HOJE)
    expect(meses).toEqual([
      { ano: 2024, mes: 7 },
      { ano: 2025, mes: 7 },
      { ano: 2026, mes: 7 },
    ])
  })

  it("'ultimo-mes' — virada jan→dez do ano anterior quando hoje é em janeiro", () => {
    const meses = resolverMeses('ultimo-mes', '2026-01-15')
    expect(meses).toEqual([
      { ano: 2023, mes: 12 },
      { ano: 2024, mes: 12 },
      { ano: 2025, mes: 12 },
    ])
  })

  it("'personalizado' — o mês escolhido vira o foco e o YoY expande igual aos presets", () => {
    const meses = resolverMeses('personalizado', HOJE, [{ ano: 2026, mes: 5 }])
    expect(meses).toEqual([
      { ano: 2024, mes: 5 },
      { ano: 2025, mes: 5 },
      { ano: 2026, mes: 5 },
    ])
  })

  it("'personalizado' — defensivo: se chegar mais de um mês, vale o MAIS RECENTE", () => {
    const personalizados: MesRef[] = [
      { ano: 2026, mes: 8 },
      { ano: 2026, mes: 3 },
    ]
    const meses = resolverMeses('personalizado', HOJE, personalizados)
    expect(meses).toEqual([
      { ano: 2024, mes: 8 },
      { ano: 2025, mes: 8 },
      { ano: 2026, mes: 8 },
    ])
  })

  it("'personalizado' com lista vazia (ou ausente) cai no comportamento de 'este-mes'", () => {
    expect(resolverMeses('personalizado', HOJE, [])).toEqual(resolverMeses('este-mes', HOJE))
    expect(resolverMeses('personalizado', HOJE)).toEqual(resolverMeses('este-mes', HOJE))
  })
})

describe('montarComparativo', () => {
  const HOJE = '2026-08-11'

  it('previsto/realizado por mês; parcial=true no corrente, false em mês fechado', () => {
    const meses = resolverMeses('este-mes', HOJE) // [2024-08, 2025-08, 2026-08]
    const metas: MetaMensal[] = [
      { ano: 2024, mes: 8, valorMeta: 1000 },
      { ano: 2025, mes: 8, valorMeta: 1100 },
      // 2026-08 SEM meta cadastrada — testa previsto null.
    ]
    const realizadoPorMes = new Map<string, number | null>([
      ['2024-08', 950],
      ['2025-08', 1200],
      ['2026-08', 500],
    ])

    const r = montarComparativo({ meses, hoje: HOJE, metas, realizadoPorMes })

    expect(r.meses).toHaveLength(3)
    expect(r.meses[0]).toMatchObject({ previsto: 1000, realizado: 950, parcial: false })
    expect(r.meses[0].rotulo).toBe('ago/24')
    expect(r.meses[1]).toMatchObject({ previsto: 1100, realizado: 1200, parcial: false })
    expect(r.meses[2]).toMatchObject({ previsto: null, realizado: 500, parcial: true })
    expect(r.meses[2].rotulo).toBe('ago/26 (parcial)')

    // foco = o mais recente.
    expect(r.foco).toBe(r.meses[2])
    expect(r.foco.mes).toEqual({ ano: 2026, mes: 8 })
  })

  it('anel = null quando o mês EM FOCO não tem meta cadastrada', () => {
    const meses = resolverMeses('este-mes', HOJE) // foco = 2026-08
    const metas: MetaMensal[] = [{ ano: 2024, mes: 8, valorMeta: 1000 }] // só o ano antigo
    const realizadoPorMes = new Map<string, number | null>()

    const r = montarComparativo({ meses, hoje: HOJE, metas, realizadoPorMes })
    expect(r.anel).toBeNull()
  })

  it('anel = meta do PRÓPRIO mês em foco e COINCIDE com o previsto das colunas', () => {
    const meses = resolverMeses('este-mes', HOJE) // foco = 2026-08
    const metas: MetaMensal[] = [{ ano: 2026, mes: 8, valorMeta: 1300 }]
    const realizadoPorMes = new Map<string, number | null>()

    const r = montarComparativo({ meses, hoje: HOJE, metas, realizadoPorMes })
    expect(r.anel).toEqual({ mes: { ano: 2026, mes: 8 }, rotulo: 'ago/26', meta: 1300 })
    expect(r.anel?.meta).toBe(r.foco.previsto) // ajuste do Yan, 11/08
  })

  it('personalizado com mês único: foco no escolhido, YoY em volta (ajuste 11/08)', () => {
    const meses = resolverMeses('personalizado', HOJE, [{ ano: 2026, mes: 5 }])
    const r = montarComparativo({
      meses, hoje: HOJE,
      metas: [{ ano: 2026, mes: 5, valorMeta: 500 }],
      realizadoPorMes: new Map([['2026-05', 400]]),
    })
    expect(r.meses).toHaveLength(3) // mai/24, mai/25, mai/26
    expect(r.foco.mes).toEqual({ ano: 2026, mes: 5 })
    expect(r.foco.previsto).toBe(500)
    expect(r.foco.realizado).toBe(400)
    expect(r.anel?.meta).toBe(500)
  })

  it('realizado null (falha/negação fail-safe) é preservado, não some com o ?? 0', () => {
    const meses: MesRef[] = [{ ano: 2026, mes: 8 }]
    const realizadoPorMes = new Map<string, number | null>([['2026-08', null]])

    const r = montarComparativo({ meses, hoje: HOJE, metas: [], realizadoPorMes })
    expect(r.meses[0].realizado).toBeNull()
  })

  it('ordena defensivamente ASC mesmo se `meses` chegar fora de ordem', () => {
    const meses: MesRef[] = [{ ano: 2026, mes: 8 }, { ano: 2024, mes: 8 }, { ano: 2025, mes: 8 }]
    const r = montarComparativo({ meses, hoje: HOJE, metas: [], realizadoPorMes: new Map() })
    expect(r.meses.map(i => chaveMes(i.mes))).toEqual(['2024-08', '2025-08', '2026-08'])
    expect(r.foco.mes).toEqual({ ano: 2026, mes: 8 })
  })
})
