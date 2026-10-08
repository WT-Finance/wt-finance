import { describe, it, expect } from 'vitest'
import {
  cuboCategorias, cuboFornecedores, lancamentosDoRecorte, rankingFornecedores, somar,
  tabelaPorCategoria, totalNoRecorte,
} from './agregacao'
import { gerarLancamentos, montarDadosFixture } from './fixture'
import type { Recorte } from './periodo'
import type { LancamentoMkt, ResumoMarketing } from './tipos'

// ─────────────────────────────────────────────────────────────────────────────────────────
// COMPLETUDE (v6.3.0) — a identidade que dá sentido à página inteira:
//
//   Σ lançamentos ≡ Σ por categoria ≡ Σ por fornecedor ≡ total do recorte
//
// O total da página É a linha "(-) Despesas Marketing" da DRE de caixa. Se qualquer caminho de
// agregação perder uma linha (fornecedor em branco que some do ranking, estorno que não entra
// na soma, categoria descartada), a página passa a discordar de si mesma — e da DRE. As somas
// são em centavos inteiros, então a igualdade é `toBe`, não "quase igual".
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

// ── A fixture respeita a mesma identidade ──────────────────────────────────────────────────
describe('completude — fixture', () => {
  const anoCorrente = gerarLancamentos(2026, HOJE)
  const anoCheio = gerarLancamentos(2025, HOJE)

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

  it('o payload montado (cubos da fixture) fecha com a lista de lançamentos', () => {
    const dados = montarDadosFixture({ ano: 2026, hoje: HOJE, estado: null })
    if (!dados.resumo.ok || !dados.fornecedores.ok || !dados.lancamentos.ok) throw new Error('fixture deveria carregar tudo')
    const recorte: Recorte = { mesIni: 1, mesFim: 10 }
    const doRecorte = lancamentosDoRecorte(dados.lancamentos.dados, recorte)
    const total = somar(doRecorte.map(l => l.valor))
    expect(tabelaPorCategoria(dados.resumo.dados.porMesCategoria, recorte).total).toBe(total)
    expect(rankingFornecedores(dados.fornecedores.dados.porMesFornecedor, recorte).total).toBe(total)
  })
})

describe('fixture — estados degradados', () => {
  const base = { ano: 2026, hoje: HOJE }

  it('padrão: tudo carregado, pills de 2024 ao ano corrente, aviso do cartão com atraso', () => {
    const d = montarDadosFixture({ ...base, estado: null })
    expect(d.anosDisponiveis).toEqual([2024, 2025, 2026])
    expect([d.resumo.ok, d.resumoAnterior.ok, d.fornecedores.ok, d.lancamentos.ok]).toEqual([true, true, true, true])
    const resumo = d.resumo.ok ? d.resumo.dados : null
    expect(resumo?.ultimaDataCartao).toBe('2026-09-29')
    expect((resumo?.cobertura?.max ?? '9999-12-31') <= HOJE).toBe(true)
    // O cartão está ATRASADO em relação ao fim dos dados — é o que o aviso existe para mostrar.
    expect((resumo?.ultimaDataCartao ?? '') < (resumo?.cobertura?.max ?? '')).toBe(true)
  })

  it('ano antes do 1º da base (2024 → 2023): o resumo anterior vem vazio e 2023 fora de anosDisponiveis', () => {
    const d = montarDadosFixture({ ano: 2024, hoje: HOJE, estado: null })
    expect(d.anosDisponiveis).not.toContain(2023)
    expect(d.resumoAnterior.ok && d.resumoAnterior.dados.porMesCategoria).toEqual([])
    expect(d.resumoAnterior.ok && d.resumoAnterior.dados.cobertura).toBeNull()
    // …e o ano selecionado segue com dado.
    expect(d.resumo.ok && d.resumo.dados.porMesCategoria.length).toBeGreaterThan(0)
  })

  it('estado "vazio": o ano selecionado não tem lançamento; o anterior segue com dado', () => {
    const d = montarDadosFixture({ ...base, estado: 'vazio' })
    const resumo = d.resumo.ok ? d.resumo.dados : null
    const anterior = d.resumoAnterior.ok ? d.resumoAnterior.dados : null
    expect(d.lancamentos).toEqual({ ok: true, dados: [] })
    expect(resumo?.porMesCategoria).toEqual([])
    expect(resumo?.cobertura).toBeNull()
    expect((anterior as ResumoMarketing).porMesCategoria.length).toBeGreaterThan(0)
  })

  it('estado "erro": só o ranking por fornecedor falha; o resto carrega', () => {
    const d = montarDadosFixture({ ...base, estado: 'erro' })
    expect(d.fornecedores).toEqual({ ok: false })
    expect([d.resumo.ok, d.resumoAnterior.ok, d.lancamentos.ok]).toEqual([true, true, true])
  })
})
