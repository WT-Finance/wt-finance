import { describe, it, expect } from 'vitest'
import {
  cuboCategorias, cuboFornecedores, lancamentosDoRecorte, rankingFornecedores,
  rankingFornecedoresPeriodo, serieMensalMultiAno, somar, tabelaPorCategoria,
  tabelaPorCategoriaPeriodo, totaisPorAno, totalDoPeriodo, totalNoRecorte,
} from './agregacao'
import { fatiasDeFornecedores, fatiasDeResumo } from './fatias'
import { gerarLancamentos, montarDadosFixture } from './fixture'
import { recortePadrao, type Recorte } from './periodo'
import type { LancamentoMkt } from './tipos'

// ─────────────────────────────────────────────────────────────────────────────────────────
// COMPLETUDE (v6.3.0) — a identidade que dá sentido à página inteira:
//
//   Σ lançamentos ≡ Σ por categoria ≡ Σ por fornecedor ≡ total do período
//
// O total da página É a linha "(-) Despesas Marketing" da DRE de caixa. Se qualquer caminho de
// agregação perder uma linha (fornecedor em branco que some do ranking, estorno que não entra
// na soma, categoria descartada), a página passa a discordar de si mesma — e da DRE. As somas
// são em centavos inteiros, então a igualdade é `toBe`, não "quase igual".
//
// Com VÁRIOS anos selecionados o "total do período" é a soma dos anos, cada um no seu recorte —
// e a identidade tem de valer igual (inclusive para o "(sem fornecedor)" que aparece em mais de
// um ano). A seção "Lançamentos" saiu da tela; a lista de lançamentos segue aqui como ORÁCULO.
// ─────────────────────────────────────────────────────────────────────────────────────────

const HOJE = '2026-10-08'

/** Roda a identidade inteira para UM recorte de um conjunto de lançamentos do `ano`. */
function conferirCompletude(ano: number, lancamentos: LancamentoMkt[], recorte: Recorte) {
  const doRecorte = lancamentosDoRecorte(lancamentos, recorte)
  const totalLancamentos = somar(doRecorte.map(l => l.valor))

  const porCategoria = tabelaPorCategoria(cuboCategorias(ano, lancamentos), recorte)
  const porFornecedor = rankingFornecedores(cuboFornecedores(ano, lancamentos), recorte)

  return {
    nLancamentos: doRecorte.length,
    totalLancamentos,
    // por categoria
    totalCubo: totalNoRecorte(cuboCategorias(ano, lancamentos), recorte).valor,
    totalTabela: porCategoria.total,
    somaLinhasCategoria: somar(porCategoria.linhas.map(l => l.total)),
    somaTotaisPorMes: somar(porCategoria.totalPorMes.map(v => v ?? 0)),
    qtdCategoria: porCategoria.qtd,
    qtdLinhasCategoria: porCategoria.linhas.reduce((a, l) => a + l.qtd, 0),
    // por fornecedor
    totalRanking: porFornecedor.total,
    somaLinhasFornecedor: somar(porFornecedor.linhas.map(l => l.valor)),
    qtdFornecedor: porFornecedor.qtd,
    qtdLinhasFornecedor: porFornecedor.linhas.reduce((a, l) => a + l.qtd, 0),
  }
}

function afirmarIdentidade(r: ReturnType<typeof conferirCompletude>) {
  // Todos os caminhos dão o MESMO total…
  expect(r.totalCubo).toBe(r.totalLancamentos)
  expect(r.totalTabela).toBe(r.totalLancamentos)
  expect(r.somaLinhasCategoria).toBe(r.totalLancamentos)
  expect(r.somaTotaisPorMes).toBe(r.totalLancamentos)
  expect(r.totalRanking).toBe(r.totalLancamentos)
  expect(r.somaLinhasFornecedor).toBe(r.totalLancamentos)
  // …e a MESMA contagem de lançamentos (nenhuma linha some pelo caminho).
  expect(r.qtdCategoria).toBe(r.nLancamentos)
  expect(r.qtdLinhasCategoria).toBe(r.nLancamentos)
  expect(r.qtdFornecedor).toBe(r.nLancamentos)
  expect(r.qtdLinhasFornecedor).toBe(r.nLancamentos)
}

/** Um ano do período: os lançamentos dele e o recorte em que ele entra. */
interface AnoDoPeriodo { ano: number; lancamentos: LancamentoMkt[]; recorte: Recorte }

/** A mesma identidade para o PERÍODO de vários anos (cada um no seu recorte). Os três caminhos
 *  — categoria, fornecedor e série mensal/painel Total — leem os cubos por ano, como a página. */
function conferirCompletudePeriodo(anos: AnoDoPeriodo[]) {
  const doPeriodo = anos.flatMap(a => lancamentosDoRecorte(a.lancamentos, a.recorte))
  const totalLancamentos = somar(doPeriodo.map(l => l.valor))

  const fatCat = anos.map(a => ({ ano: a.ano, recorte: a.recorte, linhas: cuboCategorias(a.ano, a.lancamentos) }))
  const fatForn = anos.map(a => ({ ano: a.ano, recorte: a.recorte, linhas: cuboFornecedores(a.ano, a.lancamentos) }))
  const tabela = tabelaPorCategoriaPeriodo(fatCat)
  const ranking = rankingFornecedoresPeriodo(fatForn)
  const painel = totaisPorAno(fatCat)
  const serie = serieMensalMultiAno(fatCat)

  return {
    nLancamentos: doPeriodo.length,
    totalLancamentos,
    totalPeriodo: totalDoPeriodo(fatCat),
    // por categoria
    totalTabela: tabela.total,
    somaLinhasCategoria: somar(tabela.linhas.map(l => l.total)),
    somaTotaisPorMes: somar(tabela.totalPorMes.map(v => v ?? 0)),
    qtdTabela: tabela.qtd,
    qtdLinhasCategoria: tabela.linhas.reduce((a, l) => a + l.qtd, 0),
    // por fornecedor
    totalRanking: ranking.total,
    somaLinhasFornecedor: somar(ranking.linhas.map(l => l.valor)),
    qtdRanking: ranking.qtd,
    qtdLinhasFornecedor: ranking.linhas.reduce((a, l) => a + l.qtd, 0),
    // painel "Total" e série mensal (mês futuro = null conta como 0 na soma)
    somaPainel: somar(painel.map(t => t.valor)),
    qtdPainel: painel.reduce((a, t) => a + t.qtd, 0),
    somaSerie: somar(serie.pontos.flatMap(p => p.valores.map(v => v ?? 0))),
    // o "(sem fornecedor)" do ranking (pode vir de mais de um ano)
    semFornecedor: ranking.linhas.find(l => l.chave === '') ?? null,
  }
}

function afirmarIdentidadePeriodo(r: ReturnType<typeof conferirCompletudePeriodo>) {
  expect(r.totalPeriodo.valor).toBe(r.totalLancamentos)
  expect(r.totalTabela).toBe(r.totalLancamentos)
  expect(r.somaLinhasCategoria).toBe(r.totalLancamentos)
  expect(r.somaTotaisPorMes).toBe(r.totalLancamentos)
  expect(r.totalRanking).toBe(r.totalLancamentos)
  expect(r.somaLinhasFornecedor).toBe(r.totalLancamentos)
  expect(r.somaPainel).toBe(r.totalLancamentos)
  expect(r.somaSerie).toBe(r.totalLancamentos)
  // …e a mesma contagem em todos.
  expect(r.totalPeriodo.qtd).toBe(r.nLancamentos)
  expect(r.qtdTabela).toBe(r.nLancamentos)
  expect(r.qtdLinhasCategoria).toBe(r.nLancamentos)
  expect(r.qtdRanking).toBe(r.nLancamentos)
  expect(r.qtdLinhasFornecedor).toBe(r.nLancamentos)
  expect(r.qtdPainel).toBe(r.nLancamentos)
}

// ── Caso nominal, à mão: o estorno e o lançamento sem fornecedor ───────────────────────────
const L = (
  id: number, data: string, categoria: string, fornecedor: string | null, valor: number,
): LancamentoMkt => ({ id, data, categoria, fornecedor, descricao: null, documento: null, valor })

const NOMINAL: LancamentoMkt[] = [
  L(1, '2026-01-10', 'Anúncios', 'Google Ads', -1000.1),
  L(2, '2026-01-20', 'Anúncios', 'Meta Ads', -500.2),
  L(3, '2026-02-05', 'Licença de Software (MKT)', 'Adobe', -100.05),
  L(4, '2026-02-15', 'TravelBack', null, -300),
  L(5, '2026-03-01', 'Anúncios', 'Google Ads', -2000),
  L(6, '2026-03-14', 'Anúncios', 'Google Ads', 250.25), // ESTORNO (positivo)
  L(7, '2026-03-20', 'TravelBack', '   ', -49.75),      // fornecedor em branco
]

// O ano anterior à mão: outro estorno e o "(sem fornecedor)" de novo (nulo), para provar que o
// ranking junta as duas linhas sem fornecedor de ANOS diferentes numa só.
const NOMINAL_2025: LancamentoMkt[] = [
  L(11, '2025-01-12', 'Anúncios', 'Google Ads', -700.7),
  L(12, '2025-02-03', 'TravelBack', null, -125.4),
  L(13, '2025-02-20', 'Anúncios', 'Meta Ads', 90.9), // ESTORNO
  L(14, '2025-07-09', 'Marcas e Patentes', 'Registro de Marcas Alfa', -420),
  L(15, '2025-12-01', 'Licença de Software (MKT)', 'Adobe', -79.9),
]

describe('completude — caso nominal (estorno + sem fornecedor)', () => {
  it('Σ lançamentos ≡ Σ categoria ≡ Σ fornecedor ≡ total, no ano inteiro', () => {
    const r = conferirCompletude(2026, NOMINAL, { mesIni: 1, mesFim: 12 })
    afirmarIdentidade(r)
    expect(r.totalLancamentos).toBe(-3699.85)
    expect(r.nLancamentos).toBe(7)
  })

  it('vale para QUALQUER recorte de meses, não só o ano inteiro', () => {
    for (let ini = 1; ini <= 4; ini++) {
      for (let fim = ini; fim <= 4; fim++) {
        afirmarIdentidade(conferirCompletude(2026, NOMINAL, { mesIni: ini, mesFim: fim }))
      }
    }
  })

  it('o ESTORNO entra na soma com o sinal certo (reduz o gasto), nos três caminhos', () => {
    const sem = NOMINAL.filter(l => l.id !== 6)
    const comEstorno = conferirCompletude(2026, NOMINAL, { mesIni: 1, mesFim: 12 })
    const semEstorno = conferirCompletude(2026, sem, { mesIni: 1, mesFim: 12 })
    expect(semEstorno.totalLancamentos).toBe(-3950.1)
    // O gasto com o estorno é MENOR (menos negativo) em exatamente o valor do estorno.
    expect(somar([comEstorno.totalLancamentos, -semEstorno.totalLancamentos])).toBe(250.25)
    expect(comEstorno.totalTabela).toBe(comEstorno.totalLancamentos)
    expect(comEstorno.totalRanking).toBe(comEstorno.totalLancamentos)
  })

  it('o lançamento SEM fornecedor (nulo e em branco) aparece no ranking e entra na soma', () => {
    const ranking = rankingFornecedores(cuboFornecedores(2026, NOMINAL), { mesIni: 1, mesFim: 12 })
    const sem = ranking.linhas.find(l => l.rotulo === '(sem fornecedor)')
    expect(sem).toBeDefined()
    expect(sem).toMatchObject({ chave: '', valor: -349.75, qtd: 2 })
    expect(ranking.linhas.some(l => l.chave === '   ')).toBe(false) // o em branco foi normalizado
    expect(ranking.total).toBe(-3699.85)
  })

  it('recorte sem nenhum lançamento: tudo em zero, e ainda idêntico', () => {
    const r = conferirCompletude(2026, NOMINAL, { mesIni: 8, mesFim: 9 })
    afirmarIdentidade(r)
    expect(r.totalLancamentos).toBe(0)
    expect(r.nLancamentos).toBe(0)
  })
})

// ── VÁRIOS anos: a identidade vale para a soma, cada ano no seu recorte ────────────────────
describe('completude — período de vários anos (caso nominal à mão)', () => {
  const FECHADO: Recorte = { mesIni: 1, mesFim: 12 }

  it('2025 + 2026: Σ lançamentos ≡ Σ categoria ≡ Σ fornecedor ≡ total do período ≡ Σ painel ≡ Σ série', () => {
    const r = conferirCompletudePeriodo([
      { ano: 2025, lancamentos: NOMINAL_2025, recorte: FECHADO },
      { ano: 2026, lancamentos: NOMINAL, recorte: FECHADO },
    ])
    afirmarIdentidadePeriodo(r)
    // 2025: −700,7 −125,4 +90,9 −420 −79,9 = −1235,1 · 2026: −3699,85
    expect(r.totalLancamentos).toBe(-4934.95)
    expect(r.nLancamentos).toBe(12)
  })

  it('o "(sem fornecedor)" de anos diferentes é UMA linha, com a soma e a contagem dos dois', () => {
    const r = conferirCompletudePeriodo([
      { ano: 2025, lancamentos: NOMINAL_2025, recorte: FECHADO },
      { ano: 2026, lancamentos: NOMINAL, recorte: FECHADO },
    ])
    // 2025: −125,4 (nulo) · 2026: −300 (nulo) e −49,75 (em branco)
    expect(r.semFornecedor).toMatchObject({ rotulo: '(sem fornecedor)', valor: -475.15, qtd: 3 })
  })

  it('cada ano no SEU recorte: o ano corrente cortado em fev não leva março junto', () => {
    // hoje = 20/02/2026 → 2026 vai de jan a fev; 2025 segue jan–dez.
    const hoje = '2026-02-20'
    const r = conferirCompletudePeriodo([
      { ano: 2025, lancamentos: NOMINAL_2025, recorte: recortePadrao(2025, hoje) },
      { ano: 2026, lancamentos: NOMINAL, recorte: recortePadrao(2026, hoje) },
    ])
    afirmarIdentidadePeriodo(r)
    // 2026 jan–fev: −1000,1 −500,2 −100,05 −300 = −1900,35 (março fora) · 2025: −1235,1
    expect(r.totalLancamentos).toBe(-3135.45)
    expect(r.nLancamentos).toBe(9)
  })

  it('1, 2 e 3 anos (subconjuntos) e qualquer recorte do ano corrente', () => {
    const FEV = '2026-02-20'
    const outro: LancamentoMkt[] = [L(21, '2024-05-05', 'TravelBack', null, -10.1), L(22, '2024-09-09', 'Anúncios', 'Meta Ads', -20.2)]
    const todos = [
      { ano: 2024, lancamentos: outro },
      { ano: 2025, lancamentos: NOMINAL_2025 },
      { ano: 2026, lancamentos: NOMINAL },
    ]
    for (let n = 1; n <= 3; n++) {
      for (const hoje of [FEV, HOJE, '2026-12-31']) {
        const anos = todos.slice(todos.length - n).map(t => ({ ...t, recorte: recortePadrao(t.ano, hoje) }))
        afirmarIdentidadePeriodo(conferirCompletudePeriodo(anos))
      }
    }
  })

  it('sem nenhum lançamento nos anos selecionados: tudo em zero, e ainda idêntico', () => {
    const r = conferirCompletudePeriodo([
      { ano: 2025, lancamentos: [], recorte: FECHADO },
      { ano: 2026, lancamentos: [], recorte: recortePadrao(2026, HOJE) },
    ])
    afirmarIdentidadePeriodo(r)
    expect(r.totalLancamentos).toBe(0)
    expect(r.semFornecedor).toBeNull()
  })
})

// ── A fixture respeita a mesma identidade ──────────────────────────────────────────────────
describe('completude — fixture', () => {
  const anoCorrente = gerarLancamentos(2026, HOJE)
  const anoCheio = gerarLancamentos(2025, HOJE)
  const anoAntigo = gerarLancamentos(2024, HOJE)

  it('a fixture tem o tamanho de um ano real (~200 lançamentos) e os casos raros embutidos', () => {
    expect(anoCheio.length).toBeGreaterThanOrEqual(190)
    expect(anoCheio.length).toBeLessThanOrEqual(230)
    for (const lancs of [anoCheio, anoCorrente]) {
      expect(lancs.filter(l => l.valor > 0)).toHaveLength(1)                       // 1 estorno
      expect(lancs.some(l => l.fornecedor === null)).toBe(true)                    // sem fornecedor (null)
      expect(lancs.some(l => l.fornecedor === '')).toBe(true)                      // sem fornecedor (em branco)
      expect(new Set(lancs.map(l => l.id)).size).toBe(lancs.length)                // ids únicos
      expect(lancs.every(l => Math.round(l.valor * 100) / 100 === l.valor)).toBe(true) // 2 casas
    }
  })

  it('é determinística (mesma chamada, mesmos lançamentos)', () => {
    expect(gerarLancamentos(2026, HOJE)).toEqual(anoCorrente)
    expect(gerarLancamentos(2025, HOJE)).toEqual(anoCheio)
  })

  it('o ano em curso não tem lançamento depois de hoje; o ano cheio fica dentro do ano', () => {
    expect(anoCorrente.every(l => l.data >= '2026-01-01' && l.data <= HOJE)).toBe(true)
    expect(anoCheio.every(l => l.data >= '2025-01-01' && l.data <= '2025-12-31')).toBe(true)
  })

  it('usa as 6 categorias reais da DRE e muitos fornecedores distintos', () => {
    const categorias = new Set(anoCheio.map(l => l.categoria))
    expect(categorias).toEqual(new Set([
      'Anúncios', 'Agência de Marketing / Terceiros de MKT', 'Licença de Software (MKT)',
      'TravelBack', 'Marcas e Patentes', 'Material gráfico MKT',
    ]))
    expect(new Set(anoCheio.map(l => l.fornecedor)).size).toBeGreaterThan(30)
  })

  it('Σ lançamentos ≡ Σ categoria ≡ Σ fornecedor ≡ total, em vários recortes', () => {
    const recortes: Recorte[] = [
      { mesIni: 1, mesFim: 12 }, { mesIni: 1, mesFim: 6 }, { mesIni: 3, mesFim: 3 }, { mesIni: 7, mesFim: 12 },
    ]
    for (const r of recortes) afirmarIdentidade(conferirCompletude(2025, anoCheio, r))
    const ytd: Recorte[] = [{ mesIni: 1, mesFim: 10 }, { mesIni: 10, mesFim: 10 }, { mesIni: 2, mesFim: 5 }]
    for (const r of ytd) afirmarIdentidade(conferirCompletude(2026, anoCorrente, r))
  })

  it('2024 + 2025 + 2026 (volume real, ~600 lançamentos): a identidade do período fecha', () => {
    const anos = [
      { ano: 2024, lancamentos: anoAntigo },
      { ano: 2025, lancamentos: anoCheio },
      { ano: 2026, lancamentos: anoCorrente },
    ].map(a => ({ ...a, recorte: recortePadrao(a.ano, HOJE) }))
    const r = conferirCompletudePeriodo(anos)
    afirmarIdentidadePeriodo(r)
    expect(r.nLancamentos).toBe(anoAntigo.length + anoCheio.length + anoCorrente.length)
    expect(r.semFornecedor).not.toBeNull()
    // o "(sem fornecedor)" soma os três anos
    const semPorAno = [anoAntigo, anoCheio, anoCorrente].map(ls =>
      ls.filter(l => (l.fornecedor ?? '').trim() === ''))
    expect(r.semFornecedor?.qtd).toBe(semPorAno.reduce((a, ls) => a + ls.length, 0))
    expect(r.semFornecedor?.valor).toBe(somar(semPorAno.flat().map(l => l.valor)))
  })

  it('o payload montado (cubos da fixture, lidos pelas fatias da página) fecha com os lançamentos', () => {
    const dados = montarDadosFixture({ anos: [2025, 2026], hoje: HOJE, estado: null })
    const resumo = fatiasDeResumo(dados.porAno, HOJE)
    const forn = fatiasDeFornecedores(dados.porAno, HOJE)
    expect(resumo.anosFalha).toEqual([])
    expect(forn.anosFalha).toEqual([])
    const total = somar([
      ...lancamentosDoRecorte(anoCheio, recortePadrao(2025, HOJE)),
      ...lancamentosDoRecorte(anoCorrente, recortePadrao(2026, HOJE)),
    ].map(l => l.valor))
    expect(totalDoPeriodo(resumo.fatias).valor).toBe(total)
    expect(tabelaPorCategoriaPeriodo(resumo.fatias).total).toBe(total)
    expect(rankingFornecedoresPeriodo(forn.fatias).total).toBe(total)
  })
})

describe('fixture — estados degradados', () => {
  const base = { anos: [2025, 2026], hoje: HOJE }

  it('padrão: tudo carregado, uma leitura por ano (em ordem crescente), pills de 2024 ao corrente', () => {
    const d = montarDadosFixture({ ...base, anos: [2026, 2025], estado: null })
    expect(d.anos).toEqual([2025, 2026])
    expect(d.anosDisponiveis).toEqual([2024, 2025, 2026])
    expect(d.porAno.map(l => l.ano)).toEqual([2025, 2026])
    expect(d.porAno.every(l => l.resumo.ok && l.fornecedores.ok)).toBe(true)
    const resumo = d.porAno[1].resumo.ok ? d.porAno[1].resumo.dados : null
    expect(resumo?.ultimaDataCartao).toBe('2026-09-29')
    expect((resumo?.cobertura?.max ?? '9999-12-31') <= HOJE).toBe(true)
    // O cartão está ATRASADO em relação ao fim dos dados (o campo segue no dado da RPC; a página
    // não o exibe mais).
    expect((resumo?.ultimaDataCartao ?? '') < (resumo?.cobertura?.max ?? '')).toBe(true)
  })

  it('ano antes do 1º da base (2023): o resumo vem vazio e 2023 fora de anosDisponiveis', () => {
    const d = montarDadosFixture({ anos: [2023, 2024], hoje: HOJE, estado: null })
    expect(d.anosDisponiveis).not.toContain(2023)
    const [de2023, de2024] = d.porAno
    expect(de2023.resumo.ok && de2023.resumo.dados.porMesCategoria).toEqual([])
    expect(de2023.resumo.ok && de2023.resumo.dados.cobertura).toBeNull()
    expect(de2024.resumo.ok && de2024.resumo.dados.porMesCategoria.length).toBeGreaterThan(0)
  })

  it('estado "vazio": nenhum ano selecionado tem lançamento', () => {
    const d = montarDadosFixture({ ...base, estado: 'vazio' })
    for (const l of d.porAno) {
      expect(l.resumo.ok && l.resumo.dados.porMesCategoria).toEqual([])
      expect(l.resumo.ok && l.resumo.dados.cobertura).toBeNull()
    }
    expect(totalDoPeriodo(fatiasDeResumo(d.porAno, HOJE).fatias)).toEqual({ valor: 0, qtd: 0 })
  })

  it('estado "erro": só o ranking por fornecedor falha (em todos os anos); o resto carrega', () => {
    const d = montarDadosFixture({ ...base, estado: 'erro' })
    expect(d.porAno.map(l => l.fornecedores)).toEqual([{ ok: false }, { ok: false }])
    expect(d.porAno.every(l => l.resumo.ok)).toBe(true)
  })
})
