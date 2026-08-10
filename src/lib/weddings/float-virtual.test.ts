import { describe, it, expect } from 'vitest'
import { curvasFloat, rendimentoDaJanela } from './float-virtual'
import type { PontoJanela } from './janela-fluxo'

/** Ponto de janela mínimo — só `mes` e `resultado_mes` importam para as curvas. */
const ponto = (mes: string, resultado_mes: number, eh_futuro = false): PontoJanela => ({
  mes,
  eh_futuro,
  entrada_acum: 0,
  saida_acum: 0,
  entrada_mes: Math.max(resultado_mes, 0),
  saida_mes: Math.max(-resultado_mes, 0),
  resultado_mes,
})

const taxas = (...pares: [string, number][]) => new Map(pares)

describe('curvasFloat — as duas curvas nascem juntas na borda', () => {
  it('gap começa em ZERO no primeiro mês visível', () => {
    const c = curvasFloat(
      [ponto('2026-01-01', 1000), ponto('2026-02-01', 0)],
      taxas(['2026-01-01', 0.01], ['2026-02-01', 0.01]),
    )
    expect(c[0].rendimento_acum).toBe(0)
    expect(c[0].saldo_real).toBe(1000)
    expect(c[0].saldo_virtual).toBe(1000)
  })

  it('o fluxo do 1º mês NÃO rende no próprio mês', () => {
    // Mesma convenção da RPC: o juro incide sobre o saldo do mês anterior.
    const c = curvasFloat(
      [ponto('2026-01-01', 1000), ponto('2026-02-01', 0)],
      taxas(['2026-01-01', 0.10], ['2026-02-01', 0.10]),
    )
    expect(c[1].saldo_virtual).toBeCloseTo(1100, 10) // 1000 × 1,10 + 0
    expect(c[1].saldo_real).toBe(1000)
    expect(c[1].rendimento_acum).toBeCloseTo(100, 10)
  })

  it('compõe (juro sobre juro), nunca soma linear', () => {
    const c = curvasFloat(
      [ponto('2026-01-01', 1000), ponto('2026-02-01', 0), ponto('2026-03-01', 0)],
      taxas(['2026-01-01', 0.10], ['2026-02-01', 0.10], ['2026-03-01', 0.10]),
    )
    // Composto: 1000 → 1100 → 1210. Linear daria 1200.
    expect(c[2].saldo_virtual).toBeCloseTo(1210, 10)
    expect(c[2].saldo_virtual).not.toBeCloseTo(1200, 6)
  })

  it('é SIMÉTRICO: saldo negativo gera custo teórico, sem ramo especial', () => {
    const c = curvasFloat(
      [ponto('2026-01-01', -1000), ponto('2026-02-01', 0)],
      taxas(['2026-01-01', 0.10], ['2026-02-01', 0.10]),
    )
    expect(c[1].saldo_virtual).toBeCloseTo(-1100, 10)
    expect(c[1].rendimento_acum).toBeCloseTo(-100, 10)
  })
})

describe('curvasFloat — o que o gap faz de verdade', () => {
  it('com saldo POSITIVO e taxa positiva, o gap nunca encolhe', () => {
    const c = curvasFloat(
      [ponto('2026-01-01', 500), ponto('2026-02-01', 500), ponto('2026-03-01', 500)],
      taxas(['2026-01-01', 0.01], ['2026-02-01', 0.01], ['2026-03-01', 0.01]),
    )
    for (let i = 1; i < c.length; i++) {
      expect(c[i].rendimento_acum).toBeGreaterThanOrEqual(c[i - 1].rendimento_acum)
    }
  })

  it('⚠️ com saldo NEGATIVO o gap encolhe — e isso está certo', () => {
    // O briefing pedia como auto-auditoria "o gap nunca encolhe em janela sem taxa
    // negativa". A afirmação é imprecisa: o que decide o sinal do juro é o SALDO,
    // não a taxa. Saldo devedor a taxa positiva gera custo, e o gap desce. Fixar o
    // critério do briefing como teste faria reprovar justamente a simetria que a
    // versão existe para entregar.
    const c = curvasFloat(
      [ponto('2026-01-01', -500), ponto('2026-02-01', 0), ponto('2026-03-01', 0)],
      taxas(['2026-01-01', 0.01], ['2026-02-01', 0.01], ['2026-03-01', 0.01]),
    )
    expect(c[2].rendimento_acum).toBeLessThan(c[1].rendimento_acum)
  })

  it('saldo que CRUZA o zero inverte a direção do gap', () => {
    const c = curvasFloat(
      [ponto('2026-01-01', -1000), ponto('2026-02-01', 3000), ponto('2026-03-01', 0)],
      taxas(['2026-01-01', 0.10], ['2026-02-01', 0.10], ['2026-03-01', 0.10]),
    )
    expect(c[1].rendimento_acum).toBeLessThan(0)   // ainda devedor no mês 2
    expect(c[2].rendimento_acum).toBeGreaterThan(c[1].rendimento_acum)
  })
})

describe('curvasFloat — degradação honesta', () => {
  it('sem NENHUMA taxa conhecida, não desenha nada', () => {
    // Curvas coincidentes afirmariam "o float não rendeu nada", que é falso.
    expect(curvasFloat([ponto('2026-01-01', 1000)], new Map())).toEqual([])
    expect(curvasFloat([ponto('2026-01-01', 1000)], taxas().set('2026-01-01', null as never))).toEqual([])
  })

  it('janela vazia devolve vazio, sem lançar', () => {
    expect(curvasFloat([], taxas(['2026-01-01', 0.01]))).toEqual([])
    expect(rendimentoDaJanela([])).toBe(0)
  })

  it('mês sem taxa dentro de série conhecida rende zero naquele mês, e só nele', () => {
    const c = curvasFloat(
      [ponto('2026-01-01', 1000), ponto('2026-02-01', 0), ponto('2026-03-01', 0)],
      taxas(['2026-01-01', 0.10], ['2026-03-01', 0.10]),
    )
    expect(c[1].saldo_virtual).toBeCloseTo(1000, 10) // fev sem taxa
    expect(c[2].saldo_virtual).toBeCloseTo(1100, 10) // mar volta a render
  })
})

describe('rendimentoDaJanela', () => {
  it('é o gap do último mês visível', () => {
    const c = curvasFloat(
      [ponto('2026-01-01', 1000), ponto('2026-02-01', 0)],
      taxas(['2026-01-01', 0.10], ['2026-02-01', 0.10]),
    )
    expect(rendimentoDaJanela(c)).toBeCloseTo(100, 10)
  })

  it('janela MENOR mede rendimento MENOR — é o efeito esperado do slider', () => {
    // O número do gráfico é "gerado na janela", não a vida inteira da operação.
    // É por isso que ele diverge da coluna da Lista de propósito.
    const todos = [ponto('2026-01-01', 1000), ponto('2026-02-01', 0), ponto('2026-03-01', 0)]
    const t = taxas(['2026-01-01', 0.10], ['2026-02-01', 0.10], ['2026-03-01', 0.10])
    const largo = rendimentoDaJanela(curvasFloat(todos, t))
    const estreito = rendimentoDaJanela(curvasFloat(todos.slice(1), t))
    expect(largo).toBeGreaterThan(estreito)
  })
})
