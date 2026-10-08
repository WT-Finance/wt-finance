import { describe, it, expect } from 'vitest'
import type { LinhaMesCategoria } from '@/components/marketing/gastos/tipos'
import { deltaYtd } from '@/lib/dre/colunas-tabela'
import { calcularIndicadores, sentidoDoDelta } from './indicadores'

const C = (mes: number, valor: number, qtd = 1): LinhaMesCategoria => ({ mes, categoria: 'Anúncios', valor, qtd })

// Gasto no sinal da DRE (negativo).
const ATUAL = [C(1, -60000, 2), C(2, -60000), C(3, -30000)]
const ANTERIOR = [C(1, -50000), C(2, -50000), C(3, -90000)]
const R12 = { mesIni: 1, mesFim: 2 }

describe('sentidoDoDelta', () => {
  it('positivo é favorável, negativo é desfavorável, perto de zero é estável', () => {
    expect(sentidoDoDelta(null)).toBeNull()
    expect(sentidoDoDelta(0.49)).toBe('neutro')
    expect(sentidoDoDelta(-0.49)).toBe('neutro')
    expect(sentidoDoDelta(0.5)).toBe('favoravel')
    expect(sentidoDoDelta(-0.5)).toBe('desfavoravel')
    expect(sentidoDoDelta(14.3)).toBe('favoravel')
    expect(sentidoDoDelta(-20)).toBe('desfavoravel')
  })
})

describe('calcularIndicadores — período e ano anterior', () => {
  it('gasto no recorte, mesmo recorte do ano anterior e nº de lançamentos', () => {
    const i = calcularIndicadores({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: ANTERIOR })
    expect(i.periodo).toEqual({ valor: -120000, qtd: 3 })
    expect(i.anoAnterior).toEqual({ valor: -100000, qtd: 2 })
  })

  it('gasto que CRESCEU dá Δ negativo e desfavorável (mesma convenção de sinal da DRE)', () => {
    const i = calcularIndicadores({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: ANTERIOR })
    expect(i.deltaPct).toBeCloseTo(-20, 9)
    expect(i.sentido).toBe('desfavoravel')
  })

  it('gasto que CAIU dá Δ positivo e favorável', () => {
    const maior = [C(1, -70000), C(2, -70000)]
    const i = calcularIndicadores({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: maior })
    expect(i.deltaPct).toBeCloseTo((20000 / 140000) * 100, 9)
    expect(i.sentido).toBe('favoravel')
  })

  it('o Δ é exatamente o `deltaYtd` da DRE sobre os mesmos dois valores (dois números vizinhos concordam)', () => {
    const i = calcularIndicadores({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: ANTERIOR })
    expect(i.deltaPct).toBe(deltaYtd(i.anoAnterior!.valor, i.periodo.valor))
  })

  it('variação pequena lê como estável', () => {
    const i = calcularIndicadores({
      ano: 2026, hoje: '2026-10-08', recorte: { mesIni: 1, mesFim: 1 },
      atual: [C(1, -100200)], anterior: [C(1, -100000)],
    })
    expect(i.deltaPct).toBeCloseTo(-0.2, 9)
    expect(i.sentido).toBe('neutro')
  })

  it('ano anterior sem base (|base| < 0,005) → travessão, nunca Infinity', () => {
    const i = calcularIndicadores({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: [] })
    expect(i.anoAnterior).toEqual({ valor: 0, qtd: 0 })
    expect(i.deltaPct).toBeNull()
    expect(i.sentido).toBeNull()
  })

  it('ano anterior que não carregou → sem Δ, o resto dos indicadores segue', () => {
    const i = calcularIndicadores({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: null })
    expect(i.anoAnterior).toBeNull()
    expect(i.deltaPct).toBeNull()
    expect(i.periodo.valor).toBe(-120000)
  })
})

describe('calcularIndicadores — mês de referência', () => {
  it('é a ponta final do recorte, e é o MÊS CORRENTE quando o recorte termina nele', () => {
    const i = calcularIndicadores({ ano: 2026, hoje: '2026-02-10', recorte: R12, atual: ATUAL, anterior: ANTERIOR })
    expect(i.mesRef).toEqual({ mes: 2, valor: -60000, qtd: 1, corrente: true })
  })

  it('recorte que não termina no mês de hoje: último mês do período, não corrente', () => {
    const i = calcularIndicadores({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: ANTERIOR })
    expect(i.mesRef.corrente).toBe(false)
    expect(i.mesRef.mes).toBe(2)
  })

  it('ano encerrado nunca tem mês corrente, mesmo com o mesmo número de mês', () => {
    const i = calcularIndicadores({ ano: 2025, hoje: '2026-02-10', recorte: R12, atual: ATUAL, anterior: ANTERIOR })
    expect(i.mesRef.corrente).toBe(false)
  })

  it('mês sem lançamento: zero e zero lançamentos', () => {
    const i = calcularIndicadores({
      ano: 2026, hoje: '2026-10-08', recorte: { mesIni: 1, mesFim: 6 }, atual: ATUAL, anterior: ANTERIOR,
    })
    expect(i.mesRef).toEqual({ mes: 6, valor: 0, qtd: 0, corrente: false })
  })
})
