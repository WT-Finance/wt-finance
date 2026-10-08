import { describe, it, expect } from 'vitest'
import type { LancamentoMkt } from './tipos'
import {
  ROTULO_SEM_FORNECEDOR, chaveFornecedor, cuboCategorias, cuboFornecedores, lancamentosDoRecorte,
  pctDoTotal, rankingFornecedores, rotuloFornecedor, serieMensal, somar, tabelaPorCategoria,
  totalDoMes, totalNoRecorte,
} from './agregacao'

const L = (
  id: number, data: string, categoria: string, fornecedor: string | null, valor: number,
): LancamentoMkt => ({ id, data, categoria, fornecedor, descricao: null, documento: null, valor })

// Conjunto à mão (valores que somam em centavos exatos). Inclui o caso raro (estorno POSITIVO) e
// dois lançamentos sem fornecedor: um `null` e um em branco.
const LANCS: LancamentoMkt[] = [
  L(1, '2026-01-10', 'Anúncios', 'Google Ads', -1000.1),
  L(2, '2026-01-20', 'Anúncios', 'Meta Ads', -500.2),
  L(3, '2026-02-05', 'Licença de Software (MKT)', 'Adobe', -100.05),
  L(4, '2026-02-15', 'TravelBack', null, -300),
  L(5, '2026-03-01', 'Anúncios', 'Google Ads', -2000),
  L(6, '2026-03-14', 'Anúncios', 'Google Ads', 250.25), // estorno
  L(7, '2026-03-20', 'TravelBack', '   ', -49.75),
]
const TOTAL = -3699.85

describe('somar — centavos exatos', () => {
  it('não acumula erro de ponto flutuante', () => {
    expect(somar([0.1, 0.2])).toBe(0.3)
    expect(somar([])).toBe(0)
    expect(somar(LANCS.map(l => l.valor))).toBe(TOTAL)
  })

  it('a ordem das parcelas não muda o total', () => {
    const v = LANCS.map(l => l.valor)
    expect(somar([...v].reverse())).toBe(somar(v))
  })
})

describe('pctDoTotal', () => {
  it('razão de dois negativos é positiva', () => {
    expect(pctDoTotal(-25, -100)).toBe(25)
  })
  it('total em zero contábil vira travessão (null), nunca Infinity/NaN', () => {
    expect(pctDoTotal(-10, 0)).toBeNull()
    expect(pctDoTotal(-10, 0.004)).toBeNull()
  })
})

describe('fornecedor: chave e rótulo', () => {
  it('ausente, nulo e em branco caem na mesma chave vazia', () => {
    expect(chaveFornecedor(null)).toBe('')
    expect(chaveFornecedor(undefined)).toBe('')
    expect(chaveFornecedor('   ')).toBe('')
    expect(chaveFornecedor('  Google Ads ')).toBe('Google Ads')
  })
  it('a chave vazia aparece como "(sem fornecedor)"', () => {
    expect(rotuloFornecedor('')).toBe(ROTULO_SEM_FORNECEDOR)
    expect(ROTULO_SEM_FORNECEDOR).toBe('(sem fornecedor)')
    expect(rotuloFornecedor('Adobe')).toBe('Adobe')
  })
})

describe('cubos a partir de lançamentos', () => {
  it('categorias: soma por mês × categoria, com o estorno reduzindo o gasto', () => {
    const cubo = cuboCategorias(2026, LANCS)
    const anunciosMarco = cubo.find(l => l.mes === 3 && l.categoria === 'Anúncios')
    expect(anunciosMarco).toEqual({ mes: 3, categoria: 'Anúncios', valor: -1749.75, qtd: 2 })
    expect(cubo.find(l => l.mes === 1 && l.categoria === 'Anúncios')?.valor).toBe(-1500.3)
    expect(cubo).toHaveLength(5)
  })

  it('fornecedores: nulo e em branco viram UMA linha sem fornecedor (fornecedor null)', () => {
    const cubo = cuboFornecedores(2026, LANCS)
    expect(cubo.find(l => l.mes === 2 && l.fornecedor === null)).toEqual({ mes: 2, fornecedor: null, valor: -300, qtd: 1 })
    expect(cubo.find(l => l.mes === 3 && l.fornecedor === null)).toEqual({ mes: 3, fornecedor: null, valor: -49.75, qtd: 1 })
    expect(cubo.find(l => l.mes === 3 && l.fornecedor === 'Google Ads')?.valor).toBe(-1749.75)
  })

  it('só entra o ano pedido', () => {
    const com2025 = [...LANCS, L(99, '2025-01-10', 'Anúncios', 'Google Ads', -777)]
    expect(cuboCategorias(2026, com2025)).toEqual(cuboCategorias(2026, LANCS))
    expect(cuboFornecedores(2026, com2025)).toEqual(cuboFornecedores(2026, LANCS))
    expect(totalNoRecorte(cuboCategorias(2025, com2025), { mesIni: 1, mesFim: 12 }).valor).toBe(-777)
  })
})

describe('leituras do recorte', () => {
  const cubo = cuboCategorias(2026, LANCS)

  it('total e nº de lançamentos no recorte e num mês', () => {
    expect(totalNoRecorte(cubo, { mesIni: 1, mesFim: 2 })).toEqual({ valor: -1900.35, qtd: 4 })
    expect(totalNoRecorte(cubo, { mesIni: 1, mesFim: 12 })).toEqual({ valor: TOTAL, qtd: 7 })
    expect(totalDoMes(cubo, 3)).toEqual({ valor: -1799.5, qtd: 3 })
    expect(totalDoMes(cubo, 9)).toEqual({ valor: 0, qtd: 0 })
  })

  it('lancamentosDoRecorte filtra por mês', () => {
    expect(lancamentosDoRecorte(LANCS, { mesIni: 2, mesFim: 2 }).map(l => l.id)).toEqual([3, 4])
  })

  it('série mensal: mês depois do limite é null (ausência ≠ zero); ano anterior null se falhou', () => {
    const ant = cuboCategorias(2025, [
      L(8, '2025-01-15', 'Anúncios', 'Google Ads', -800),
      L(9, '2025-02-10', 'TravelBack', null, -200),
    ])
    const serie = serieMensal(cubo, ant, { mesIni: 1, mesFim: 4 }, 3)
    expect(serie).toEqual([
      { mes: 1, atual: -1500.3, anterior: -800 },
      { mes: 2, atual: -400.05, anterior: -200 },
      { mes: 3, atual: -1799.5, anterior: 0 },
      { mes: 4, atual: null, anterior: 0 },
    ])
    expect(serieMensal(cubo, null, { mesIni: 1, mesFim: 2 }, 3).map(p => p.anterior)).toEqual([null, null])
  })
})

describe('tabela por categoria', () => {
  const cubo = cuboCategorias(2026, LANCS)

  it('ordena pela maior despesa e marca com null o mês sem lançamento', () => {
    const t = tabelaPorCategoria(cubo, { mesIni: 1, mesFim: 3 })
    expect(t.meses).toEqual([1, 2, 3])
    expect(t.linhas.map(l => l.categoria)).toEqual(['Anúncios', 'TravelBack', 'Licença de Software (MKT)'])
    expect(t.linhas[0].porMes).toEqual([-1500.3, null, -1749.75])
    expect(t.linhas[1].porMes).toEqual([null, -300, -49.75])
    expect(t.linhas.map(l => l.total)).toEqual([-3250.05, -349.75, -100.05])
    expect(t.totalPorMes).toEqual([-1500.3, -400.05, -1799.5])
    expect(t.total).toBe(TOTAL)
    expect(t.qtd).toBe(7)
  })

  it('% do total: UM denominador (o total do recorte); as linhas somam 100%', () => {
    const t = tabelaPorCategoria(cubo, { mesIni: 1, mesFim: 3 })
    expect(t.linhas[0].pct).toBeCloseTo((-3250.05 / TOTAL) * 100, 6)
    expect(t.linhas.every(l => l.pct !== null && l.pct > 0)).toBe(true)
    expect(t.linhas.reduce((a, l) => a + (l.pct ?? 0), 0)).toBeCloseTo(100, 6)
  })

  it('o recorte muda o denominador junto com o numerador', () => {
    const t = tabelaPorCategoria(cubo, { mesIni: 2, mesFim: 2 })
    expect(t.total).toBe(-400.05)
    expect(t.linhas.map(l => l.categoria)).toEqual(['TravelBack', 'Licença de Software (MKT)'])
    expect(t.linhas.reduce((a, l) => a + (l.pct ?? 0), 0)).toBeCloseTo(100, 6)
  })

  it('recorte sem lançamento: zero linhas, zero total', () => {
    const t = tabelaPorCategoria(cubo, { mesIni: 6, mesFim: 8 })
    expect(t).toMatchObject({ linhas: [], total: 0, qtd: 0 })
    expect(t.totalPorMes).toEqual([null, null, null])
  })
})

describe('ranking por fornecedor', () => {
  const cubo = cuboFornecedores(2026, LANCS)

  it('maior despesa primeiro; "(sem fornecedor)" entra como qualquer outro e nunca some', () => {
    const r = rankingFornecedores(cubo, { mesIni: 1, mesFim: 3 })
    expect(r.linhas.map(l => l.rotulo)).toEqual(['Google Ads', 'Meta Ads', ROTULO_SEM_FORNECEDOR, 'Adobe'])
    const sem = r.linhas.find(l => l.chave === '')
    expect(sem).toMatchObject({ rotulo: '(sem fornecedor)', valor: -349.75, qtd: 2 })
    expect(r.linhas.find(l => l.chave === 'Google Ads')).toMatchObject({ valor: -2749.85, qtd: 3 })
    expect(r.total).toBe(TOTAL)
    expect(r.qtd).toBe(7)
  })

  it('as razões somam 100%', () => {
    const r = rankingFornecedores(cubo, { mesIni: 1, mesFim: 3 })
    expect(r.linhas.reduce((a, l) => a + (l.pct ?? 0), 0)).toBeCloseTo(100, 6)
  })

  it('recorte vazio', () => {
    expect(rankingFornecedores(cubo, { mesIni: 9, mesFim: 9 })).toEqual({ linhas: [], total: 0, qtd: 0 })
  })
})
