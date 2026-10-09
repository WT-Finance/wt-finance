import { describe, it, expect } from 'vitest'
import type { FatiaAno } from './agregacao'
import { somar, totalDoPeriodo } from './agregacao'
import { recortePadrao } from './periodo'
import { linhasTotalPorAno, sentidoDaVariacao } from './total-por-ano'
import type { LinhaMesCategoria } from './tipos'

const HOJE = '2026-10-08'
const m = (mes: number, valor: number, qtd = 1): LinhaMesCategoria => ({ mes, categoria: 'Anúncios', valor, qtd })
const fatia = (ano: number, linhas: LinhaMesCategoria[]): FatiaAno<LinhaMesCategoria> => ({
  ano, recorte: recortePadrao(ano, HOJE), linhas,
})

// 2024 (fechado):  jan −100 · nov −300                      → ano inteiro −400 ; jan–out −100
// 2025 (fechado):  jan −200 · set −100 · nov −500           → ano inteiro −800 ; jan–out −300
// 2026 (corrente, jan–out): jan −250 · out −200 (+ nov −999, FORA do recorte) → −450
// Os números são escolhidos para que "ano inteiro × ano inteiro" e "jan–out × jan–out" dêem Δ DIFERENTES.
const F24 = fatia(2024, [m(1, -100), m(11, -300)])
const F25 = fatia(2025, [m(1, -200), m(9, -100), m(11, -500)])
const F26 = fatia(2026, [m(1, -250), m(10, -200), m(11, -999)])

function ok(fatias: FatiaAno<LinhaMesCategoria>[]) {
  const r = linhasTotalPorAno(fatias, [])
  if (!r.ok) throw new Error('esperava ok')
  return r
}

describe('linhasTotalPorAno — ordem e valores', () => {
  it('uma linha por ano, em ordem DECRESCENTE de ano, qualquer que seja a ordem de entrada', () => {
    expect(ok([F24, F26, F25]).linhas.map(l => l.ano)).toEqual([2026, 2025, 2024])
    expect(ok([F26, F25, F24]).linhas.map(l => l.ano)).toEqual([2026, 2025, 2024])
  })

  it('o valor de cada linha é o do ano no SEU recorte (o lançamento de nov/2026 não entra)', () => {
    const { linhas } = ok([F24, F25, F26])
    expect(linhas.map(l => l.valor)).toEqual([-450, -800, -400])
    expect(linhas.map(l => l.qtd)).toEqual([2, 3, 2])
  })

  it('rótulo: asterisco só no ano parcial, e o recorte ("jan–out") só nele também', () => {
    const { linhas } = ok([F24, F25, F26])
    expect(linhas.map(l => l.rotulo)).toEqual(['2026*', '2025', '2024'])
    expect(linhas.map(l => l.recorte)).toEqual(['jan–out', null, null])
  })
})

describe('linhasTotalPorAno — variação contra o ano logo abaixo', () => {
  it('cada linha compara com a de baixo; a última (a mais antiga) não tem variação', () => {
    const { linhas } = ok([F24, F25, F26])
    expect(linhas.map(l => l.variacao?.contra ?? null)).toEqual([2025, 2024, null])
    expect(linhas[2].variacao).toBeNull()
  })

  it('ano da linha PARCIAL: o de baixo entra com o MESMO recorte (2026 jan–out × 2025 jan–out)', () => {
    const v = ok([F24, F25, F26]).linhas[0].variacao
    // base = 2025 em jan–out = −300 (e NÃO o ano inteiro, −800): (−450 − −300) / 300 = −50%.
    expect(v?.pct).toBe(-50)
    expect(v?.recorte).toBe('jan–out')
    expect(v?.referencia).toBe('vs 2025 (jan–out)')
  })

  it('ano da linha FECHADO: ano inteiro × ano inteiro (2025 × 2024, sem recorte)', () => {
    const v = ok([F24, F25, F26]).linhas[1].variacao
    // base = 2024 inteiro = −400 (e NÃO jan–out, −100): (−800 − −400) / 400 = −100%.
    expect(v?.pct).toBe(-100)
    expect(v?.recorte).toBeNull()
    expect(v?.referencia).toBe('vs 2024')
  })

  it('sinal: despesa que CRESCE (−100 → −120) dá −20% = desfavorável; que cai dá + = favorável', () => {
    const cresce = ok([fatia(2024, [m(1, -100)]), fatia(2025, [m(1, -120)])]).linhas[0].variacao
    expect(cresce?.pct).toBeCloseTo(-20, 10)
    expect(cresce?.sentido).toBe('desfavoravel')
    const cai = ok([fatia(2024, [m(1, -1000)]), fatia(2025, [m(1, -400)])]).linhas[0].variacao
    expect(cai?.pct).toBeCloseTo(60, 10)
    expect(cai?.sentido).toBe('favoravel')
  })

  it('a conta é a `deltaYtd` da DRE: base com módulo (denominador |base|)', () => {
    // Estorno líquido (positivo) na base: (−50 − 100) / |100| = −150%.
    const v = ok([fatia(2024, [m(1, 100)]), fatia(2025, [m(1, -50)])]).linhas[0].variacao
    expect(v?.pct).toBe(-150)
  })

  it('base em zero contábil: travessão (pct e sentido null), nunca Infinity', () => {
    const v = ok([fatia(2024, []), fatia(2025, [m(1, -500)])]).linhas[0].variacao
    expect(v).toMatchObject({ contra: 2024, pct: null, sentido: null })
    const quase = ok([fatia(2024, [m(1, 0.004)]), fatia(2025, [m(1, -500)])]).linhas[0].variacao
    expect(quase?.pct).toBeNull()
  })

  it('valor igual: Δ zero é NEUTRO (nem favorável nem desfavorável)', () => {
    const v = ok([fatia(2024, [m(1, -300)]), fatia(2025, [m(1, -300)])]).linhas[0].variacao
    expect(v?.pct).toBe(0)
    expect(v?.sentido).toBe('neutro')
  })

  it('anos NÃO contíguos: compara com o próximo mais antigo SELECIONADO (2026 × 2024)', () => {
    const { linhas } = ok([F24, F26])
    expect(linhas.map(l => l.ano)).toEqual([2026, 2024])
    expect(linhas[0].variacao?.contra).toBe(2024)
    // jan–out de 2024 = −100 → (−450 − −100) / 100 = −350%.
    expect(linhas[0].variacao?.pct).toBe(-350)
  })

  it('mais de três anos: cada linha contra a de baixo, sem teto', () => {
    const f23 = fatia(2023, [m(1, -50)])
    const { linhas } = ok([f23, F24, F25, F26])
    expect(linhas.map(l => l.ano)).toEqual([2026, 2025, 2024, 2023])
    expect(linhas.map(l => l.variacao?.contra ?? null)).toEqual([2025, 2024, 2023, null])
  })
})

describe('linhasTotalPorAno — acumulado, um ano e falha', () => {
  it('acumulado = Σ dos anos (cada um no seu recorte) = totalDoPeriodo, em centavos exatos', () => {
    const r = ok([F24, F25, F26])
    expect(r.acumulado).toEqual({ valor: -1650, qtd: 7 })
    expect(r.acumulado).toEqual(totalDoPeriodo([F24, F25, F26]))
    expect(r.acumulado.valor).toBe(somar(r.linhas.map(l => l.valor)))
    // Σ de float sem centavos exatos daria 0,30000000000000004:
    const fl = ok([fatia(2024, [m(1, -0.1)]), fatia(2025, [m(1, -0.2)])])
    expect(fl.acumulado.valor).toBe(-0.3)
  })

  it('um ano só: uma linha sem variação; o acumulado é o próprio total do ano', () => {
    const r = ok([F26])
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0]).toMatchObject({ ano: 2026, valor: -450, qtd: 2, variacao: null })
    expect(r.acumulado).toEqual({ valor: -450, qtd: 2 })
  })

  it('nenhum lançamento: linhas zeradas e acumulado 0/0 (o card mostra o vazio)', () => {
    const r = ok([fatia(2025, []), fatia(2026, [])])
    expect(r.acumulado).toEqual({ valor: 0, qtd: 0 })
    expect(r.linhas.map(l => l.valor)).toEqual([0, 0])
  })

  it('FALHA de um ano: fail-closed — nenhuma linha, nenhum total, só os anos que faltam', () => {
    // 2025 falhou: as fatias que chegaram são 2024 e 2026, mas somá-las daria um total menor sob o mesmo rótulo.
    const r = linhasTotalPorAno([F24, F26], [2025])
    expect(r).toEqual({ ok: false, anosFalha: [2025] })
    expect('linhas' in r).toBe(false)
    expect('acumulado' in r).toBe(false)
  })
})

describe('sentidoDaVariacao — olha o valor EXIBIDO (1 casa)', () => {
  it('sinal do Δ; null sem Δ; arredondado a zero é neutro', () => {
    expect(sentidoDaVariacao(-0.01)).toBe('neutro')
    expect(sentidoDaVariacao(0.04)).toBe('neutro')
    expect(sentidoDaVariacao(-0.06)).toBe('desfavoravel')
    expect(sentidoDaVariacao(12)).toBe('favoravel')
    expect(sentidoDaVariacao(null)).toBeNull()
  })
})
