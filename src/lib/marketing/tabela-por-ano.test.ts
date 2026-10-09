import { describe, it, expect } from 'vitest'
import { somar, tabelaPorCategoriaPeriodo, totalDoPeriodo, type FatiaAno } from './agregacao'
import { recortePadrao } from './periodo'
import { alternarAnoAberto, colunasDoAno, podarAnosAbertos, tabelaCategoriasPorAno } from './tabela-por-ano'
import type { LinhaMesCategoria } from './tipos'

const HOJE = '2026-10-08'
const l = (mes: number, categoria: string, valor: number, qtd = 1): LinhaMesCategoria => ({ mes, categoria, valor, qtd })
const fatia = (ano: number, linhas: LinhaMesCategoria[]): FatiaAno<LinhaMesCategoria> => ({
  ano, recorte: recortePadrao(ano, HOJE), linhas,
})

// 2025 (fechado, jan–dez):  Anúncios jan −100,10 · nov −50,20 | Eventos mar −300 | Zerada jun 0
// 2026 (corrente, jan–out): Anúncios jan −200 · out −10,05 (+ dez −999: FORA do recorte) | Software fev −40
// "Eventos" só existe em 2025; "Software" só em 2026; "Zerada" existe em 2025 com valor 0 (≠ ausência).
const F25 = fatia(2025, [l(1, 'Anúncios', -100.1), l(11, 'Anúncios', -50.2), l(3, 'Eventos', -300), l(6, 'Zerada', 0)])
const F26 = fatia(2026, [l(1, 'Anúncios', -200), l(10, 'Anúncios', -10.05), l(12, 'Anúncios', -999), l(2, 'Software', -40)])

describe('tabelaCategoriasPorAno — anos e meses', () => {
  it('anos em ordem CRESCENTE, qualquer que seja a ordem de entrada', () => {
    expect(tabelaCategoriasPorAno([F26, F25]).anos.map(a => a.ano)).toEqual([2025, 2026])
    expect(tabelaCategoriasPorAno([F25, F26]).anos.map(a => a.ano)).toEqual([2025, 2026])
  })

  it('ano fechado tem jan–dez; o corrente só até o mês atual (sem colunas de futuro)', () => {
    const { anos } = tabelaCategoriasPorAno([F25, F26])
    expect(anos[0].meses).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(anos[1].meses).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(anos[1].totalPorMes).toHaveLength(10)
  })

  it('rótulo com * só no ano parcial; recorte ("jan–out") só nele também', () => {
    const { anos } = tabelaCategoriasPorAno([F25, F26])
    expect(anos.map(a => a.rotulo)).toEqual(['2025', '2026*'])
    expect(anos.map(a => a.recorte)).toEqual([null, 'jan–out'])
  })

  it('o lançamento fora do recorte (dez/2026) não entra em lugar nenhum', () => {
    const t = tabelaCategoriasPorAno([F25, F26])
    expect(t.anos[1].total).toBe(-250.05) // −200 −10,05 −40
    const anuncios = t.linhas.find(x => x.categoria === 'Anúncios')!
    expect(anuncios.anos[1].total).toBe(-210.05)
  })

  it('um ano só mantém o mesmo formato: o acumulado repete o total do ano', () => {
    const t = tabelaCategoriasPorAno([F25])
    expect(t.anos).toHaveLength(1)
    expect(t.acumulado).toBe(t.anos[0].total)
    for (const lin of t.linhas) expect(lin.acumulado).toBe(lin.anos[0].total)
  })
})

describe('tabelaCategoriasPorAno — ausência × zero', () => {
  it('categoria presente só num dos anos: o outro ano é null (travessão), com o eixo de meses todo null', () => {
    const t = tabelaCategoriasPorAno([F25, F26])
    const eventos = t.linhas.find(x => x.categoria === 'Eventos')!
    expect(eventos.anos[0].total).toBe(-300)
    expect(eventos.anos[1].total).toBeNull()
    expect(eventos.anos[1].porMes).toEqual(Array(10).fill(null))
    expect(eventos.acumulado).toBe(-300)
    const software = t.linhas.find(x => x.categoria === 'Software')!
    expect(software.anos[0].total).toBeNull()
    expect(software.anos[0].porMes).toEqual(Array(12).fill(null))
    expect(software.anos[1].total).toBe(-40)
  })

  it('lançamento que soma ZERO é 0 (R$ 0,00), não null; mês sem lançamento é null', () => {
    const t = tabelaCategoriasPorAno([F25, F26])
    const zerada = t.linhas.find(x => x.categoria === 'Zerada')!
    expect(zerada.anos[0].total).toBe(0)
    expect(zerada.anos[0].porMes[5]).toBe(0) // jun
    expect(zerada.anos[0].porMes[4]).toBeNull() // mai
    expect(zerada.anos[1].total).toBeNull()
  })

  it('ano sem lançamento algum no recorte: total do ano null, mas o ano continua na tabela', () => {
    const t = tabelaCategoriasPorAno([F25, fatia(2026, [l(12, 'Anúncios', -5)])]) // só dez/2026, fora do recorte
    expect(t.anos[1].total).toBeNull()
    expect(t.anos[1].totalPorMes.every(v => v === null)).toBe(true)
    expect(t.acumulado).toBe(somar([-150.3, -300, 0]))
  })
})

describe('tabelaCategoriasPorAno — completude (toBe exato, em centavos)', () => {
  const t = tabelaCategoriasPorAno([F25, F26])
  const soma = (vs: (number | null)[]) => somar(vs.filter((v): v is number => v !== null))

  it('Σ dos meses de um ano ≡ total do ano (linha de cada categoria e linha de total)', () => {
    t.anos.forEach((a, i) => {
      expect(soma(a.totalPorMes)).toBe(a.total)
      for (const lin of t.linhas) {
        const c = lin.anos[i]
        if (c.total !== null) expect(soma(c.porMes)).toBe(c.total)
      }
    })
  })

  it('Σ dos anos ≡ acumulado (e ≡ totalDoPeriodo, o card "Total de despesas no período")', () => {
    expect(soma(t.anos.map(a => a.total))).toBe(t.acumulado)
    expect(t.acumulado).toBe(totalDoPeriodo([F25, F26]).valor)
    expect(t.qtd).toBe(totalDoPeriodo([F25, F26]).qtd)
    for (const lin of t.linhas) expect(soma(lin.anos.map(c => c.total))).toBe(lin.acumulado)
  })

  it('Σ das categorias ≡ linha de total — por mês, por ano e no acumulado', () => {
    expect(somar(t.linhas.map(x => x.acumulado))).toBe(t.acumulado)
    t.anos.forEach((a, i) => {
      expect(soma(t.linhas.map(x => x.anos[i].total))).toBe(a.total)
      a.meses.forEach((_, j) => {
        expect(soma(t.linhas.map(x => x.anos[i].porMes[j]))).toBe(a.totalPorMes[j] ?? 0)
      })
    })
  })

  it('o acumulado e as linhas batem com a tabela de período já existente (mesma soma por outro caminho)', () => {
    const antiga = tabelaPorCategoriaPeriodo([F25, F26])
    expect(t.acumulado).toBe(antiga.total)
    for (const lin of antiga.linhas) {
      expect(t.linhas.find(x => x.categoria === lin.categoria)!.acumulado).toBe(lin.total)
    }
  })

  it('% do total: denominador único, as linhas somam 100% e as razões são positivas', () => {
    expect(t.linhas.reduce((s, x) => s + (x.pct ?? 0), 0)).toBeCloseTo(100, 9)
    for (const lin of t.linhas) expect(lin.pct!).toBeGreaterThanOrEqual(0)
  })

  it('acumulado total zero → pct null (travessão), nunca NaN/Infinity', () => {
    const z = tabelaCategoriasPorAno([fatia(2025, [l(1, 'A', -10), l(2, 'B', 10)])])
    expect(z.acumulado).toBe(0)
    expect(z.linhas.every(x => x.pct === null)).toBe(true)
  })
})

describe('tabelaCategoriasPorAno — ordem das linhas', () => {
  it('pelo acumulado (a mais negativa primeiro), desempate por nome', () => {
    const t = tabelaCategoriasPorAno([F25, F26])
    // Anúncios −360,35 · Eventos −300 · Software −40 · Zerada 0 (o Σ dos DOIS anos, não só o 1º).
    expect(t.linhas.map(x => x.categoria)).toEqual(['Anúncios', 'Eventos', 'Software', 'Zerada'])
    const empate = tabelaCategoriasPorAno([fatia(2025, [l(1, 'B', -10), l(1, 'A', -10)])])
    expect(empate.linhas.map(x => x.categoria)).toEqual(['A', 'B'])
  })
})

describe('estado de expansão por ano', () => {
  it('podar: ano que saiu da seleção sai dos abertos (e, ao voltar, entra recolhido)', () => {
    expect(podarAnosAbertos([2025, 2026], [2026, 2027])).toEqual([2026])
    expect(podarAnosAbertos([], [2025])).toEqual([])
  })

  it('alternar: abre um ano fechado e fecha um aberto, sem mexer nos outros', () => {
    expect(alternarAnoAberto([2025], 2026)).toEqual([2025, 2026])
    expect(alternarAnoAberto([2025, 2026], 2025)).toEqual([2026])
  })

  it('colunas: recolhido = 1 (o total); aberto = meses + 1', () => {
    const { anos } = tabelaCategoriasPorAno([F25, F26])
    expect(colunasDoAno(anos[0], false)).toBe(1)
    expect(colunasDoAno(anos[0], true)).toBe(13)
    expect(colunasDoAno(anos[1], true)).toBe(11)
  })
})
