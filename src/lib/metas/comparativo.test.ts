import { describe, it, expect } from 'vitest'
import {
  chaveMes, janelaDoMes, mesSeguinte, rotuloMes,
  periodoDeMes, normalizarPeriodo, qtdMesesPeriodo, mesesDoPeriodo,
  chavePeriodo, janelaDoPeriodo, rotuloPeriodo, tituloPeriodo,
  resolverPeriodos, montarComparativo,
  ANOS_YOY, TETO_MESES_PERSONALIZADO,
  type MesRef, type PeriodoRef,
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

describe('período contíguo (v5.6.4)', () => {
  const JAN26: MesRef = { ano: 2026, mes: 1 }
  const ABR26: MesRef = { ano: 2026, mes: 4 }
  const NOV25: MesRef = { ano: 2025, mes: 11 }
  const FEV26: MesRef = { ano: 2026, mes: 2 }

  it('periodoDeMes degenera em período de 1 mês', () => {
    const p = periodoDeMes(JAN26)
    expect(p).toEqual({ inicio: JAN26, fim: JAN26 })
    expect(qtdMesesPeriodo(p)).toBe(1)
  })

  it('normalizarPeriodo — a ordem dos cliques é indiferente', () => {
    expect(normalizarPeriodo(JAN26, ABR26)).toEqual({ inicio: JAN26, fim: ABR26 })
    expect(normalizarPeriodo(ABR26, JAN26)).toEqual({ inicio: JAN26, fim: ABR26 })
    expect(normalizarPeriodo(FEV26, NOV25)).toEqual({ inicio: NOV25, fim: FEV26 }) // cruza ano
  })

  it('qtdMesesPeriodo conta inclusivo, inclusive na virada de ano', () => {
    expect(qtdMesesPeriodo({ inicio: JAN26, fim: ABR26 })).toBe(4)
    expect(qtdMesesPeriodo({ inicio: NOV25, fim: FEV26 })).toBe(4)
    expect(TETO_MESES_PERSONALIZADO).toBe(12)
  })

  it('mesesDoPeriodo expande ASC atravessando a virada de ano', () => {
    expect(mesesDoPeriodo({ inicio: NOV25, fim: FEV26 })).toEqual([
      { ano: 2025, mes: 11 },
      { ano: 2025, mes: 12 },
      { ano: 2026, mes: 1 },
      { ano: 2026, mes: 2 },
    ])
  })

  it('chavePeriodo: mês único degenera em chaveMes; range usa as duas pontas', () => {
    expect(chavePeriodo(periodoDeMes({ ano: 2026, mes: 8 }))).toBe('2026-08')
    expect(chavePeriodo({ inicio: JAN26, fim: ABR26 })).toBe('2026-01..2026-04')
  })

  it('janelaDoPeriodo cobre do 1º dia do mês inicial ao último do final', () => {
    expect(janelaDoPeriodo({ inicio: JAN26, fim: ABR26 })).toEqual({ from: '2026-01-01', to: '2026-04-30' })
    expect(janelaDoPeriodo(periodoDeMes({ ano: 2026, mes: 8 }))).toEqual(janelaDoMes({ ano: 2026, mes: 8 }))
  })

  it('rotuloPeriodo: mês único, range no mesmo ano e range que cruza ano', () => {
    expect(rotuloPeriodo(periodoDeMes({ ano: 2026, mes: 8 }))).toBe('ago/26')
    expect(rotuloPeriodo({ inicio: JAN26, fim: ABR26 })).toBe('jan–abr/26')
    expect(rotuloPeriodo({ inicio: NOV25, fim: FEV26 })).toBe('nov/25–fev/26')
    expect(rotuloPeriodo({ inicio: JAN26, fim: ABR26 }, true)).toBe('jan–abr/26 (parcial)')
  })

  it('tituloPeriodo: extenso no mês único (paridade v5.6.1), compacto no range', () => {
    expect(tituloPeriodo(periodoDeMes({ ano: 2026, mes: 8 }))).toBe('Agosto')
    expect(tituloPeriodo({ inicio: JAN26, fim: ABR26 })).toBe('jan–abr/26')
  })
})

describe('resolverPeriodos', () => {
  const HOJE = '2026-08-11'

  it("'este-mes' — período de 1 mês corrente + ANOS_YOY anos anteriores, ASC", () => {
    const periodos = resolverPeriodos('este-mes', HOJE)
    expect(ANOS_YOY).toBe(2)
    expect(periodos).toEqual([
      periodoDeMes({ ano: 2024, mes: 8 }),
      periodoDeMes({ ano: 2025, mes: 8 }),
      periodoDeMes({ ano: 2026, mes: 8 }),
    ])
  })

  it("'ultimo-mes' — mês ANTERIOR ao corrente + ANOS_YOY anos anteriores, ASC", () => {
    const periodos = resolverPeriodos('ultimo-mes', HOJE)
    expect(periodos).toEqual([
      periodoDeMes({ ano: 2024, mes: 7 }),
      periodoDeMes({ ano: 2025, mes: 7 }),
      periodoDeMes({ ano: 2026, mes: 7 }),
    ])
  })

  it("'ultimo-mes' — virada jan→dez do ano anterior quando hoje é em janeiro", () => {
    const periodos = resolverPeriodos('ultimo-mes', '2026-01-15')
    expect(periodos).toEqual([
      periodoDeMes({ ano: 2023, mes: 12 }),
      periodoDeMes({ ano: 2024, mes: 12 }),
      periodoDeMes({ ano: 2025, mes: 12 }),
    ])
  })

  it("'personalizado' com range — o MESMO range nos anos anteriores (YoY automático)", () => {
    const range: PeriodoRef = { inicio: { ano: 2026, mes: 1 }, fim: { ano: 2026, mes: 4 } }
    expect(resolverPeriodos('personalizado', HOJE, range)).toEqual([
      { inicio: { ano: 2024, mes: 1 }, fim: { ano: 2024, mes: 4 } },
      { inicio: { ano: 2025, mes: 1 }, fim: { ano: 2025, mes: 4 } },
      { inicio: { ano: 2026, mes: 1 }, fim: { ano: 2026, mes: 4 } },
    ])
  })

  it("'personalizado' com range de 1 mês ≡ comportamento da v5.6.1 (mês único)", () => {
    const p = resolverPeriodos('personalizado', HOJE, periodoDeMes({ ano: 2026, mes: 5 }))
    expect(p).toEqual([
      periodoDeMes({ ano: 2024, mes: 5 }),
      periodoDeMes({ ano: 2025, mes: 5 }),
      periodoDeMes({ ano: 2026, mes: 5 }),
    ])
  })

  it("'personalizado' — defensivo: pontas fora de ordem são normalizadas", () => {
    const invertido: PeriodoRef = { inicio: { ano: 2026, mes: 4 }, fim: { ano: 2026, mes: 1 } }
    expect(resolverPeriodos('personalizado', HOJE, invertido))
      .toEqual(resolverPeriodos('personalizado', HOJE, { inicio: { ano: 2026, mes: 1 }, fim: { ano: 2026, mes: 4 } }))
  })

  it("'personalizado' sem range (null/ausente) cai no comportamento de 'este-mes'", () => {
    expect(resolverPeriodos('personalizado', HOJE, null)).toEqual(resolverPeriodos('este-mes', HOJE))
    expect(resolverPeriodos('personalizado', HOJE)).toEqual(resolverPeriodos('este-mes', HOJE))
  })
})

describe('montarComparativo', () => {
  const HOJE = '2026-08-11'

  it('previsto/realizado por período; parcial=true no corrente, false em fechado', () => {
    const periodos = resolverPeriodos('este-mes', HOJE) // [2024-08, 2025-08, 2026-08]
    const metas: MetaMensal[] = [
      { ano: 2024, mes: 8, valorMeta: 1000 },
      { ano: 2025, mes: 8, valorMeta: 1100 },
      // 2026-08 SEM meta cadastrada — testa previsto null.
    ]
    const realizadoPorPeriodo = new Map<string, number | null>([
      ['2024-08', 950],
      ['2025-08', 1200],
      ['2026-08', 500],
    ])

    const r = montarComparativo({ periodos, hoje: HOJE, metas, realizadoPorPeriodo })

    expect(r.periodos).toHaveLength(3)
    expect(r.periodos[0]).toMatchObject({ previsto: 1000, realizado: 950, parcial: false })
    expect(r.periodos[0].rotulo).toBe('ago/24')
    expect(r.periodos[1]).toMatchObject({ previsto: 1100, realizado: 1200, parcial: false })
    expect(r.periodos[2]).toMatchObject({ previsto: null, realizado: 500, parcial: true })
    expect(r.periodos[2].rotulo).toBe('ago/26 (parcial)')

    // foco = o mais recente.
    expect(r.foco).toBe(r.periodos[2])
    expect(r.foco.periodo).toEqual(periodoDeMes({ ano: 2026, mes: 8 }))
  })

  it('range: previsto = SOMA das metas dos meses cobertos; realizado vem da janela composta', () => {
    const range: PeriodoRef = { inicio: { ano: 2026, mes: 1 }, fim: { ano: 2026, mes: 4 } }
    const periodos = resolverPeriodos('personalizado', HOJE, range)
    const metas: MetaMensal[] = [
      { ano: 2026, mes: 1, valorMeta: 100 },
      { ano: 2026, mes: 2, valorMeta: 200 },
      { ano: 2026, mes: 3, valorMeta: 300 },
      { ano: 2026, mes: 4, valorMeta: 400 },
      { ano: 2025, mes: 1, valorMeta: 90 },
      // 2025: só jan cadastrada — soma parcial (não zera).
      // 2024: nenhuma — previsto null.
    ]
    const realizadoPorPeriodo = new Map<string, number | null>([
      ['2026-01..2026-04', 950],
      ['2025-01..2025-04', 800],
      ['2024-01..2024-04', 700],
    ])

    const r = montarComparativo({ periodos, hoje: HOJE, metas, realizadoPorPeriodo })

    expect(r.periodos).toHaveLength(3)
    expect(r.periodos[0]).toMatchObject({ previsto: null, realizado: 700 })   // 2024
    expect(r.periodos[1]).toMatchObject({ previsto: 90, realizado: 800 })     // 2025 (soma parcial)
    expect(r.periodos[2]).toMatchObject({ previsto: 1000, realizado: 950 })   // 2026
    expect(r.foco.rotulo).toBe('jan–abr/26')
    expect(r.foco.parcial).toBe(false) // jan–abr/26 fechou antes de HOJE (ago)
    expect(r.anel).toEqual({ periodo: range, rotulo: 'jan–abr/26', meta: 1000 })
  })

  it('range em curso (contém hoje) é parcial', () => {
    const range: PeriodoRef = { inicio: { ano: 2026, mes: 6 }, fim: { ano: 2026, mes: 8 } }
    const r = montarComparativo({
      periodos: [range], hoje: HOJE, metas: [], realizadoPorPeriodo: new Map(),
    })
    expect(r.foco.parcial).toBe(true)
    expect(r.foco.rotulo).toBe('jun–ago/26 (parcial)')
  })

  it('anel = null quando o período EM FOCO não tem NENHUMA meta cadastrada', () => {
    const periodos = resolverPeriodos('este-mes', HOJE) // foco = 2026-08
    const metas: MetaMensal[] = [{ ano: 2024, mes: 8, valorMeta: 1000 }] // só o ano antigo
    const realizadoPorPeriodo = new Map<string, number | null>()

    const r = montarComparativo({ periodos, hoje: HOJE, metas, realizadoPorPeriodo })
    expect(r.anel).toBeNull()
  })

  it('anel = meta do PRÓPRIO período em foco e COINCIDE com o previsto das colunas', () => {
    const periodos = resolverPeriodos('este-mes', HOJE) // foco = 2026-08
    const metas: MetaMensal[] = [{ ano: 2026, mes: 8, valorMeta: 1300 }]
    const realizadoPorPeriodo = new Map<string, number | null>()

    const r = montarComparativo({ periodos, hoje: HOJE, metas, realizadoPorPeriodo })
    expect(r.anel).toEqual({ periodo: periodoDeMes({ ano: 2026, mes: 8 }), rotulo: 'ago/26', meta: 1300 })
    expect(r.anel?.meta).toBe(r.foco.previsto) // ajuste do Yan, 11/08
  })

  it('realizado null (falha/negação fail-safe) é preservado, não some com o ?? 0', () => {
    const periodos = [periodoDeMes({ ano: 2026, mes: 8 })]
    const realizadoPorPeriodo = new Map<string, number | null>([['2026-08', null]])

    const r = montarComparativo({ periodos, hoje: HOJE, metas: [], realizadoPorPeriodo })
    expect(r.periodos[0].realizado).toBeNull()
  })

  it('ordena defensivamente ASC mesmo se `periodos` chegar fora de ordem', () => {
    const periodos = [
      periodoDeMes({ ano: 2026, mes: 8 }),
      periodoDeMes({ ano: 2024, mes: 8 }),
      periodoDeMes({ ano: 2025, mes: 8 }),
    ]
    const r = montarComparativo({ periodos, hoje: HOJE, metas: [], realizadoPorPeriodo: new Map() })
    expect(r.periodos.map(i => chavePeriodo(i.periodo))).toEqual(['2024-08', '2025-08', '2026-08'])
    expect(r.foco.periodo).toEqual(periodoDeMes({ ano: 2026, mes: 8 }))
  })
})
