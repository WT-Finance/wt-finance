import { describe, it, expect } from 'vitest'
import { CENTROS, porCentro, zeros12, type CentroId } from './centros'
import { atribuirAntecipacoes, quemCobreQuem, type EntradaAtribuicao } from './atribuicao'
import type { RecebivelAntecipado } from './tipos'

const soma = (v: number[]) => v.reduce((s, x) => s + x, 0)
const somaCentros = (r: Record<CentroId, number[]>, m: number) => CENTROS.reduce((s, k) => s + r[k][m], 0)

function serie(valores: Partial<Record<number, number>>): number[] {
  const z = zeros12()
  for (const [m, v] of Object.entries(valores)) z[Number(m) - 1] = v ?? 0
  return z
}

// Caso sintético: CSC sempre negativo; Weddings negativo só em jan; Trips e Corp positivos.
function entrada(): EntradaAtribuicao {
  const operacional = porCentro<number[]>(() => zeros12())
  operacional.trips = serie({ 1: 300, 2: 200, 3: 100, 4: 100 })
  operacional.weddings = serie({ 1: -400, 2: 600, 3: 50, 4: 50 })
  operacional.corp = serie({ 1: 250, 2: 100, 3: 0, 4: 0 })
  operacional.csc = serie({ 1: -400, 2: -300, 3: -300, 4: -300 })
  const recebiveis: RecebivelAntecipado[] = [
    { dono: 'weddings', mesAntecipacao: 1, mesVencimento: 2, valor: 100 },
    { dono: 'trips', mesAntecipacao: 1, mesVencimento: 3, valor: 60 },
    { dono: 'weddings', mesAntecipacao: 3, mesVencimento: 5, valor: 80 },
    { dono: 'corp', mesAntecipacao: 3, mesVencimento: 14, valor: 40 }, // vence no ano seguinte
  ]
  const taxaMonde = porCentro<number[]>(() => zeros12())
  taxaMonde.csc = serie({ 1: -4, 3: -3, 6: -1 }) // jun: taxa sem antecipação identificada
  return { operacional, recebiveis, taxaMonde }
}

describe('atribuirAntecipacoes — identidades (§3.4, inv. 4)', () => {
  const e = entrada()
  const a = atribuirAntecipacoes(e)

  it('pesos somam 1 nos meses com antecipação e são proporcionais ao déficit', () => {
    expect(a.pesos[0]).not.toBeNull()
    expect(soma(CENTROS.map(k => a.pesos[0]![k]))).toBeCloseTo(1, 12)
    // jan: Weddings −400, CSC −400 ⇒ 50/50
    expect(a.pesos[0]!.weddings).toBeCloseTo(0.5, 12)
    expect(a.pesos[0]!.csc).toBeCloseTo(0.5, 12)
    // mar: Weddings acumulado = +250 ⇒ só o CSC
    expect(a.pesos[2]!.csc).toBeCloseTo(1, 12)
    expect(a.pesos[1]).toBeNull()
    expect(a.criterio[0]).toBe('deficit')
  })

  it('Σ C = antecipado; o D acompanha o C com os pesos do mês da antecipação', () => {
    expect(somaCentros(a.c, 0)).toBeCloseTo(160, 9)
    expect(somaCentros(a.c, 2)).toBeCloseTo(120, 9)
    // fev: vence o de 100 antecipado em jan (pesos de jan, 50/50)
    expect(a.d.weddings[1]).toBeCloseTo(-50, 9)
    expect(a.d.csc[1]).toBeCloseTo(-50, 9)
    // mai: vence o de 80 antecipado em mar (100% CSC)
    expect(a.d.csc[4]).toBeCloseTo(-80, 9)
    // o de 40 vence em 2027: C sem D no ano
    expect(a.naoDevolvidoNoAno).toBe(40)
    const totalC = CENTROS.reduce((s, k) => s + soma(a.c[k]), 0)
    const totalD = CENTROS.reduce((s, k) => s + soma(a.d[k]), 0)
    expect(totalC + totalD).toBeCloseTo(40, 9)
  })

  it('taxa: Σ = taxa do Monde; mês sem antecipação fica onde o Monde lançou', () => {
    for (let m = 0; m < 12; m++) {
      expect(somaCentros(a.taxa, m)).toBeCloseTo(somaCentros(e.taxaMonde, m), 12)
    }
    expect(a.taxa.weddings[0]).toBeCloseTo(-2, 12)
    expect(a.taxa.csc[5]).toBe(-1)
  })

  it('nenhum centro negativo ⇒ fica com os donos dos recebíveis do mês', () => {
    const e2 = entrada()
    e2.operacional.csc = zeros12()
    e2.operacional.weddings = serie({ 1: 10 })
    const a2 = atribuirAntecipacoes(e2)
    expect(a2.criterio[0]).toBe('donos')
    expect(a2.pesos[0]!.weddings).toBeCloseTo(100 / 160, 12)
    expect(a2.pesos[0]!.trips).toBeCloseTo(60 / 160, 12)
  })

  it('o dono não ganha linha de antecipação; aparece só na memória (cedidos)', () => {
    expect(soma(a.c.trips)).toBe(0)
    expect(a.cedidos.trips[0]).toBe(60)
    expect(a.cedidos.weddings[0]).toBe(100)
  })

  it('saldo de caixa acumulado = operacional + C + D + taxa, acumulado', () => {
    for (const k of CENTROS) {
      const fluxo = e.operacional[k].map((op, m) => op + a.c[k][m] + a.d[k][m] + a.taxa[k][m])
      expect(a.saldoCaixa[k][11]).toBeCloseTo(soma(fluxo), 9)
    }
  })
})

describe('quemCobreQuem — usos ≡ fontes por construção', () => {
  it('a conferência é zero em todo mês', () => {
    const e = entrada()
    const q = quemCobreQuem(e, atribuirAntecipacoes(e))
    for (let m = 0; m < 12; m++) expect(q.totalFontes[m] - q.totalUsos[m]).toBeCloseTo(0, 9)
    // jan: 100 (Weddings) + 60 (Trips) antecipados e ainda não vencidos
    expect(q.recebiveisNaoVencidos.weddings[0]).toBe(100)
    expect(q.recebiveisNaoVencidos.weddings[1]).toBe(0)
    expect(q.recebiveisNaoVencidos.trips[1]).toBe(60)
    expect(q.recebiveisNaoVencidos.corp[11]).toBe(40)
  })
})

describe('pesos do oráculo do protótipo (§6 inv. 5)', () => {
  // Fluxo operacional do mês por centro (aba "Pressão de caixa", seção 1, em reais inteiros) e
  // os meses com antecipação. Só jan, fev e abr têm Weddings e CSC dividindo; mar, mai, set e
  // out são 100% CSC. Arredondado ao real ⇒ tolerância de 0,01 p.p.
  const operacional = porCentro<number[]>(() => zeros12())
  operacional.trips = [281667, -136127, 86021, -166734, -17497, 458495, 205545, 38392, 260452, 229915, 301838, 0]
  operacional.weddings = [-424129, 164210, 332122, -207288, 226384, 472998, 211506, 178866, -407895, -318966, 125711, 0]
  operacional.corp = [251968, 317300, 157497, 254627, 138524, 121077, 95152, 357024, -317735, -98095, 33041, 0]
  operacional.csc = [-390607, -297314, -307998, -446936, -426852, -418007, -481197, -468461, -446657, -365705, -21783, 0]
  const recebiveis: RecebivelAntecipado[] = [1, 2, 3, 4, 5, 9, 10].map(m => ({
    dono: 'weddings', mesAntecipacao: m, mesVencimento: 12, valor: 1000,
  }))
  const a = atribuirAntecipacoes({ operacional, recebiveis, taxaMonde: porCentro(() => zeros12()) })
  const esperado: Array<[number, number, number]> = [
    [1, 0.5206, 0.4794], [2, 0.2742, 0.7258], [3, 0, 1], [4, 0.0856, 0.9144], [5, 0, 1], [9, 0, 1], [10, 0, 1],
  ]
  it.each(esperado)('mês %i: Weddings %f · CSC %f', (m, wed, csc) => {
    expect(a.pesos[m - 1]!.weddings).toBeCloseTo(wed, 4)
    expect(a.pesos[m - 1]!.csc).toBeCloseTo(csc, 4)
  })
})
