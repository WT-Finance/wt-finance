import { describe, it, expect } from 'vitest'
import type { LancamentoMkt } from './tipos'
import {
  ROTULO_SEM_FORNECEDOR, chaveFornecedor, cuboCategorias, cuboFornecedores, lancamentosDoRecorte,
  pctDoTotal, rankingFornecedores, rankingFornecedoresPeriodo, rotuloFornecedor,
  serieMensalMultiAno, somar, tabelaPorCategoria, tabelaPorCategoriaPeriodo, totaisPorAno,
  totalDoMes, totalDoPeriodo, totalNoRecorte,
} from './agregacao'
import { recortePadrao } from './periodo'

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

})

// ── Vários anos: o período é a união dos recortes ────────────────────────────────────────────
//
// 2025 (ano fechado, jan–dez) + 2026 (ano corrente em out/2026, jan–out). Valores à mão, em
// centavos exatos; o 2026 reaproveita `LANCS` (jan–mar), e há lançamento de 2026 FORA do recorte
// (nov) para provar que o recorte do ano corrente corta.
const HOJE = '2026-10-08'
const R25 = recortePadrao(2025, HOJE)
const R26 = recortePadrao(2026, HOJE)

const LANCS_2025: LancamentoMkt[] = [
  L(101, '2025-01-15', 'Anúncios', 'Google Ads', -800),
  L(102, '2025-02-10', 'TravelBack', null, -200),
  L(103, '2025-11-20', 'Anúncios', 'Meta Ads', -1000), // Nov/2025: só o ano fechado alcança
  L(104, '2025-12-05', 'Licença de Software (MKT)', 'Adobe', -50.5),
]
const LANCS_2026_COM_FUTURO = [...LANCS, L(105, '2026-11-02', 'Anúncios', 'Google Ads', -9999)]

function fatias() {
  return [
    { ano: 2026, recorte: R26, linhas: cuboCategorias(2026, LANCS_2026_COM_FUTURO) },
    { ano: 2025, recorte: R25, linhas: cuboCategorias(2025, LANCS_2025) }, // fora de ordem de propósito
  ]
}

describe('período multi-ano — total, série mensal e totais por ano', () => {
  it('total do período = soma dos anos, cada um no seu recorte (o Nov/2026 futuro não entra)', () => {
    // 2025: −800 −200 −1000 −50,5 = −2050,5 · 2026 (jan–out): TOTAL (−3699,85)
    expect(totalDoPeriodo(fatias())).toEqual({ valor: somar([-2050.5, TOTAL]), qtd: 4 + 7 })
    expect(totalDoPeriodo(fatias()).valor).toBe(-5750.35)
  })

  it('um ano só: o total do período é o total daquele ano no seu recorte', () => {
    expect(totalDoPeriodo([fatias()[1]])).toEqual({ valor: -2050.5, qtd: 4 })
  })

  it('totais por ano: um por ano, do mais antigo ao mais recente, no recorte de cada um', () => {
    expect(totaisPorAno(fatias())).toEqual([
      { ano: 2025, valor: -2050.5, qtd: 4 },
      { ano: 2026, valor: TOTAL, qtd: 7 },
    ])
    expect(somar(totaisPorAno(fatias()).map(t => t.valor))).toBe(totalDoPeriodo(fatias()).valor)
  })

  it('série mensal: SEMPRE 12 meses, anos do mais antigo ao mais recente, mês futuro = null', () => {
    const s = serieMensalMultiAno(fatias())
    expect(s.anos).toEqual([2025, 2026])
    expect(s.pontos.map(p => p.mes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(s.pontos.every(p => p.valores.length === 2)).toBe(true)
    // [2025, 2026] por mês
    expect(s.pontos[0].valores).toEqual([-800, -1500.3])    // jan
    expect(s.pontos[1].valores).toEqual([-200, -400.05])    // fev
    expect(s.pontos[2].valores).toEqual([0, -1799.5])       // mar: 2025 sem gasto = zero REAL
    expect(s.pontos[9].valores).toEqual([0, 0])             // out: 2026 alcançou o mês (sem gasto → 0)
    expect(s.pontos[10].valores).toEqual([-1000, null])     // nov: 2026 ainda não chegou → null, não 0
    expect(s.pontos[11].valores).toEqual([-50.5, null])     // dez
  })

  it('o mês futuro NUNCA vira zero, e o lançamento de nov/2026 fora do recorte não aparece', () => {
    const s = serieMensalMultiAno(fatias())
    const ano26 = s.pontos.map(p => p.valores[1])
    expect(ano26.slice(0, 10).every(v => typeof v === 'number')).toBe(true)
    expect(ano26.slice(10)).toEqual([null, null])
  })

  it('um ano fechado sozinho: 12 barras com valor (nenhum null)', () => {
    const s = serieMensalMultiAno([fatias()[1]])
    expect(s.anos).toEqual([2025])
    expect(s.pontos.every(p => typeof p.valores[0] === 'number')).toBe(true)
  })

  it('o painel Total fecha com a série: Σ de cada ano nos 12 pontos = total do ano', () => {
    const s = serieMensalMultiAno(fatias())
    const totais = totaisPorAno(fatias())
    s.anos.forEach((_, i) => {
      expect(somar(s.pontos.map(p => p.valores[i] ?? 0))).toBe(totais[i].valor)
    })
  })
})

describe('período multi-ano — tabela por categoria e ranking somam os anos', () => {
  it('tabela: categoria × mês jan–dez somando os meses dos anos; total e % sobre o total do período', () => {
    const t = tabelaPorCategoriaPeriodo(fatias())
    expect(t.meses).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    const anuncios = t.linhas.find(l => l.categoria === 'Anúncios')
    // jan: −800 (2025) + −1500,3 (2026) · nov: só 2025 (−1000); o nov/2026 (−9999) está fora do recorte
    expect(anuncios?.porMes[0]).toBe(-2300.3)
    expect(anuncios?.porMes[10]).toBe(-1000)
    expect(t.total).toBe(totalDoPeriodo(fatias()).valor)
    expect(t.qtd).toBe(11)
    expect(t.linhas.reduce((a, l) => a + (l.pct ?? 0), 0)).toBeCloseTo(100, 6)
    // mês sem lançamento em NENHUM ano é ausência ("—"), não zero
    expect(t.totalPorMes[3]).toBeNull() // abril
  })

  it('ranking: o mesmo fornecedor de anos diferentes vira UMA linha; "(sem fornecedor)" soma os anos', () => {
    const r = rankingFornecedoresPeriodo([
      { ano: 2025, recorte: R25, linhas: cuboFornecedores(2025, LANCS_2025) },
      { ano: 2026, recorte: R26, linhas: cuboFornecedores(2026, LANCS_2026_COM_FUTURO) },
    ])
    expect(r.linhas.find(l => l.chave === 'Google Ads')).toMatchObject({ valor: -3549.85, qtd: 4 }) // −800 + (−2749,85)
    // 2025: TravelBack sem fornecedor (−200); 2026: −300 e −49,75
    expect(r.linhas.find(l => l.chave === '')).toMatchObject({ rotulo: ROTULO_SEM_FORNECEDOR, valor: -549.75, qtd: 3 })
    expect(r.total).toBe(totalDoPeriodo(fatias()).valor)
    expect(r.qtd).toBe(11)
  })

  it('a ordem em que os anos chegam não muda o resultado', () => {
    const f = fatias()
    expect(tabelaPorCategoriaPeriodo(f)).toEqual(tabelaPorCategoriaPeriodo([...f].reverse()))
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
