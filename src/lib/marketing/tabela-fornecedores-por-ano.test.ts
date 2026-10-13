import { describe, it, expect } from 'vitest'
import {
  cuboCategorias, cuboFornecedores, somar, tabelaPorCategoria, totalDoPeriodo, type FatiaAno,
} from './agregacao'
import { recortePadrao } from './periodo'
import { tabelaFornecedoresPorAno } from './tabela-fornecedores-por-ano'
import { tabelaCategoriasPorAno } from './tabela-por-ano'
import type { LancamentoMkt, LinhaMesFornecedor } from './tipos'

const HOJE = '2026-10-08'

let seq = 0
const lanc = (data: string, categoria: string, fornecedor: string | null, valor: number): LancamentoMkt => ({
  id: ++seq, data, categoria, fornecedor, descricao: null, documento: null, valor,
})

// 2025 (fechado, jan–dez): Meta jan −100,10 · Meta nov −50,20 | Google mar −300 | (sem) abr −10 | "  " (só espaço) mai −5
//   | Zerado jun +20 e −20 (soma zero ≠ ausência)
// 2026 (corrente, jan–out): Meta jan −200 · out −10,05 · dez −999 (FORA do recorte) | Tiktok fev −40 | (sem) out −7,77
// "Google" só em 2025; "Tiktok" só em 2026; "Meta" e "(sem fornecedor)" nos dois.
const LANC_25: LancamentoMkt[] = [
  lanc('2025-01-10', 'Anúncios', 'Meta', -100.1), lanc('2025-11-03', 'Anúncios', 'Meta', -50.2),
  lanc('2025-03-05', 'Anúncios', 'Google', -300), lanc('2025-04-02', 'Eventos', null, -10),
  lanc('2025-05-02', 'Eventos', '  ', -5), lanc('2025-06-01', 'Eventos', 'Zerado', 20),
  lanc('2025-06-02', 'Eventos', 'Zerado', -20),
]
const LANC_26: LancamentoMkt[] = [
  lanc('2026-01-12', 'Anúncios', 'Meta', -200), lanc('2026-10-01', 'Anúncios', 'Meta', -10.05),
  lanc('2026-12-20', 'Anúncios', 'Meta', -999), lanc('2026-02-09', 'Software', 'Tiktok', -40),
  lanc('2026-10-15', 'Software', null, -7.77),
]

const R25 = recortePadrao(2025, HOJE)
const R26 = recortePadrao(2026, HOJE)

const fatForn = (ano: number, ls: LancamentoMkt[]): FatiaAno<LinhaMesFornecedor> => ({
  ano, recorte: recortePadrao(ano, HOJE), linhas: cuboFornecedores(ano, ls),
})
const fatCat = (ano: number, ls: LancamentoMkt[]) => ({
  ano, recorte: recortePadrao(ano, HOJE), linhas: cuboCategorias(ano, ls),
})

const F25 = fatForn(2025, LANC_25)
const F26 = fatForn(2026, LANC_26)

/** Soma em centavos ignorando as células "—" (null). */
const soma = (vs: (number | null)[]) => somar(vs.filter((v): v is number => v !== null))

describe('tabelaFornecedoresPorAno — anos', () => {
  it('anos em ordem CRESCENTE, qualquer que seja a ordem de entrada', () => {
    expect(tabelaFornecedoresPorAno([F26, F25]).anos.map(a => a.ano)).toEqual([2025, 2026])
    expect(tabelaFornecedoresPorAno([F25, F26]).anos.map(a => a.ano)).toEqual([2025, 2026])
  })

  it('rótulo com * só no ano parcial; recorte ("jan–out") só nele também', () => {
    const { anos } = tabelaFornecedoresPorAno([F25, F26])
    expect(anos.map(a => a.rotulo)).toEqual(['2025', '2026*'])
    expect(anos.map(a => a.recorte)).toEqual([null, 'jan–out'])
  })

  it('o lançamento fora do recorte (dez/2026) não entra em lugar nenhum', () => {
    const t = tabelaFornecedoresPorAno([F25, F26])
    expect(t.anos[1].total).toBe(-257.82) // −200 −10,05 −40 −7,77
    expect(t.linhas.find(x => x.chave === 'Meta')!.anos[1].valor).toBe(-210.05)
  })

  it('um ano só mantém o mesmo formato: um bloco de ano', () => {
    const t = tabelaFornecedoresPorAno([F25])
    expect(t.anos).toHaveLength(1)
    for (const lin of t.linhas) expect(lin.anos).toHaveLength(1)
  })
})

describe('tabelaFornecedoresPorAno — ausência × zero', () => {
  const t = tabelaFornecedoresPorAno([F25, F26])

  it('fornecedor presente só num dos anos: o outro ano é null no valor E na % (travessão, não zero)', () => {
    const google = t.linhas.find(x => x.chave === 'Google')!
    expect(google.anos[0]).toEqual({ valor: -300, pct: expect.any(Number) })
    expect(google.anos[1]).toEqual({ valor: null, pct: null })
    const tiktok = t.linhas.find(x => x.chave === 'Tiktok')!
    expect(tiktok.anos[0]).toEqual({ valor: null, pct: null })
    expect(tiktok.anos[1].valor).toBe(-40)
  })

  it('lançamento que soma ZERO é 0 (R$ 0,00 e 0%), não null', () => {
    const zerado = t.linhas.find(x => x.chave === 'Zerado')!
    expect(zerado.anos[0].valor).toBe(0)
    expect(zerado.anos[0].pct).toBeCloseTo(0, 9) // 0 ÷ total negativo dá −0; `fmtPct` o normaliza na tela
    expect(zerado.anos[1]).toEqual({ valor: null, pct: null })
  })

  it('"(sem fornecedor)" entra: chave vazia e espaço em branco colapsam na MESMA linha, nos dois anos', () => {
    const sem = t.linhas.filter(x => x.chave === '')
    expect(sem).toHaveLength(1)
    expect(sem[0].rotulo).toBe('(sem fornecedor)')
    expect(sem[0].anos[0].valor).toBe(-15) // −10 e −5 ("  " aparado)
    expect(sem[0].anos[1].valor).toBe(-7.77)
  })

  it('ano sem lançamento algum no recorte: total e % do total null, mas o ano continua na tabela', () => {
    const vazio = tabelaFornecedoresPorAno([F25, fatForn(2026, [lanc('2026-12-01', 'X', 'Meta', -5)])]) // só dez/2026
    expect(vazio.anos).toHaveLength(2)
    expect(vazio.anos[1].total).toBeNull()
    expect(vazio.anos[1].pctTotal).toBeNull()
    for (const lin of vazio.linhas) expect(lin.anos[1]).toEqual({ valor: null, pct: null })
  })

  it('ano com total ZERO contábil: o valor aparece e a % é null (razão sobre zero é indefinida)', () => {
    const f = fatForn(2025, [lanc('2025-02-01', 'X', 'A', -10), lanc('2025-02-02', 'X', 'B', 10)])
    const t0 = tabelaFornecedoresPorAno([f])
    expect(t0.anos[0].total).toBe(0)
    expect(t0.anos[0].pctTotal).toBeNull()
    for (const lin of t0.linhas) {
      expect(lin.anos[0].valor).not.toBeNull()
      expect(lin.anos[0].pct).toBeNull()
    }
  })
})

describe('tabelaFornecedoresPorAno — completude por ano (toBe exato, em centavos)', () => {
  const t = tabelaFornecedoresPorAno([F25, F26])
  const categorias = [fatCat(2025, LANC_25), fatCat(2026, LANC_26)]

  it('Σ fornecedores ≡ total do ano ≡ total da tabela "Por categoria" daquele ano', () => {
    t.anos.forEach((a, i) => {
      const porCategoria = tabelaPorCategoria(categorias[i].linhas, categorias[i].recorte)
      expect(soma(t.linhas.map(l => l.anos[i].valor))).toBe(a.total)
      expect(a.total).toBe(porCategoria.total)
      expect(a.qtd).toBe(porCategoria.qtd)
    })
  })

  it('o total de cada ano é o MESMO da tabela "Por categoria" que a página renderiza (`tabelaCategoriasPorAno`)', () => {
    const irma = tabelaCategoriasPorAno(categorias)
    expect(t.anos.map(a => a.ano)).toEqual(irma.anos.map(a => a.ano))
    t.anos.forEach((a, i) => expect(a.total).toBe(irma.anos[i].total))
  })

  it('Σ dos totais dos anos ≡ totalDoPeriodo (o card "Total de despesas no período") e a qtd bate', () => {
    expect(soma(t.anos.map(a => a.total))).toBe(totalDoPeriodo(categorias).valor)
    expect(t.qtd).toBe(totalDoPeriodo(categorias).qtd)
  })

  it('Σ "% do ano" = 100% por ano (o desvio é só o do arredondamento de exibição) e o total do ano é 100', () => {
    t.anos.forEach((a, i) => {
      const pcts = t.linhas.map(l => l.anos[i].pct).filter((p): p is number => p !== null)
      expect(pcts.reduce((s, p) => s + p, 0)).toBeCloseTo(100, 6)
      expect(a.pctTotal).toBe(100)
    })
  })

  it('o "(sem fornecedor)" de cada ano entra na soma (sem ele o total do ano não fecharia)', () => {
    const semNoAno = (i: number) => t.linhas.find(l => l.chave === '')!.anos[i].valor!
    const semEle = (i: number) => soma(t.linhas.filter(l => l.chave !== '').map(l => l.anos[i].valor))
    t.anos.forEach((a, i) => expect(somar([semEle(i), semNoAno(i)])).toBe(a.total))
    expect(semEle(0)).not.toBe(t.anos[0].total)
  })

  it('o ano é lido no recorte do SEU ano: os mesmos lançamentos num recorte maior dariam outro total', () => {
    const inteiro = tabelaFornecedoresPorAno([{ ano: 2026, recorte: { mesIni: 1, mesFim: 12 }, linhas: F26.linhas }])
    expect(inteiro.anos[0].total).toBe(somar([-257.82, -999]))
    expect(R26.mesFim).toBe(10)
    expect(R25.mesFim).toBe(12)
  })
})

describe('tabelaFornecedoresPorAno — ordem das linhas', () => {
  it('pela soma dos anos (a mais negativa primeiro), desempate por nome; "(sem fornecedor)" segue a mesma regra', () => {
    const t = tabelaFornecedoresPorAno([F25, F26])
    // Meta −360,35 · Google −300 · Tiktok −40 · (sem fornecedor) −22,77 · Zerado 0
    expect(t.linhas.map(l => l.rotulo)).toEqual(['Meta', 'Google', 'Tiktok', '(sem fornecedor)', 'Zerado'])
  })

  it('usa a soma dos DOIS anos, não só a do 1º', () => {
    // A: −10 em 2025 e −100 em 2026 (−110) · B: −50 em 2025 (−50). Só pelo 1º ano, B viria antes.
    const t = tabelaFornecedoresPorAno([
      fatForn(2025, [lanc('2025-01-01', 'X', 'A', -10), lanc('2025-01-02', 'X', 'B', -50)]),
      fatForn(2026, [lanc('2026-01-01', 'X', 'A', -100)]),
    ])
    expect(t.linhas.map(l => l.chave)).toEqual(['A', 'B'])
  })

  it('empate de valor desempata por nome', () => {
    const t = tabelaFornecedoresPorAno([
      fatForn(2025, [lanc('2025-01-01', 'X', 'Beta', -10), lanc('2025-01-02', 'X', 'Alfa', -10)]),
    ])
    expect(t.linhas.map(l => l.chave)).toEqual(['Alfa', 'Beta'])
  })
})
