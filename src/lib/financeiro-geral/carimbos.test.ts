import { describe, expect, it } from 'vitest'
import {
  FONTE_ANTECIPACOES, FONTE_CAIXA, FONTE_CONTAS_A_RECEBER, carimboDoFluxo, carimboMaisRecente, carimbosDaPagina,
} from './carimbos'
import { fixtureGeral } from './fixture'
import type { DadosGeral } from './tipos'

describe('carimboMaisRecente', () => {
  it('escolhe pelo INSTANTE, não pela string (offsets diferentes)', () => {
    // 10:00-03:00 = 13:00Z; 12:00+00:00 = 12:00Z → o primeiro é o mais recente
    expect(carimboMaisRecente(['2026-10-15T12:00:00+00:00', '2026-10-15T10:00:00-03:00'])).toBe('2026-10-15T10:00:00-03:00')
  })
  it('ignora nulo, vazio e lixo; vazio → null', () => {
    expect(carimboMaisRecente([null, undefined, '', 'não é data'])).toBeNull()
    expect(carimboMaisRecente([])).toBeNull()
    expect(carimboMaisRecente([null, '2026-10-01T00:00:00Z'])).toBe('2026-10-01T00:00:00Z')
  })
})

describe('carimboDoFluxo', () => {
  it('o mais recente entre os anos', () => {
    expect(carimboDoFluxo([
      { atualizado_em: '2026-10-01T00:00:00Z' }, { atualizado_em: null }, { atualizado_em: '2026-10-09T00:00:00Z' },
    ])).toBe('2026-10-09T00:00:00Z')
  })
})

describe('carimbosDaPagina — uma linha por fonte, na ordem do topo', () => {
  const base: DadosGeral = {
    anosPrejuizos: [2026], anosAntecipacoes: [2026], anosDisponiveis: [2026], hoje: '2026-10-15', podeGerir: false,
    recebiveis: { ok: false }, antecipacoes: [], prejuizos: [],
    corrente: { prejuizos: { ano: 2026, leitura: { ok: false } }, antecipacoes: { ano: 2026, leitura: { ok: false } } },
  }
  it('sem nenhuma fonte carregada → nenhuma linha (o título fica)', () => {
    expect(carimbosDaPagina(base)).toEqual([])
    expect(carimbosDaPagina(fixtureGeral('erro', '2026-10-26', [2026]))).toEqual([])
  })
  it('estado vazio da fixture: nenhuma carga e nenhum registro → nenhuma linha', () => {
    expect(carimbosDaPagina(fixtureGeral('vazio', '2026-10-26', [2026]))).toEqual([])
  })
  it('Contas a receber, Caixa e Antecipações, nesta ordem, cada uma com a própria data', () => {
    const d = fixtureGeral('normal', '2026-10-26', [2026])
    expect(carimbosDaPagina(d)).toEqual([
      { fonte: FONTE_CONTAS_A_RECEBER, iso: '2026-10-15T16:42:10+00:00' },
      { fonte: FONTE_CAIXA, iso: '2026-10-15T16:42:10+00:00' },
      { fonte: FONTE_ANTECIPACOES, iso: '2026-09-22T13:05:00+00:00' },
    ])
    expect([FONTE_CONTAS_A_RECEBER, FONTE_CAIXA, FONTE_ANTECIPACOES]).toEqual(['Contas a receber', 'Caixa', 'Antecipações'])
  })
  it('lê a gravação da carga de contas a receber (não o mais recente entre as fontes)', () => {
    const d = fixtureGeral('normal', '2026-10-26', [2026])
    if (!d.recebiveis.ok || !d.recebiveis.dados.carga) throw new Error('fixture')
    const maisNova = { ...d.recebiveis.dados.carga, gravado_em: '2026-10-20T14:00:00-03:00' }
    const r: DadosGeral = { ...d, recebiveis: { ok: true, dados: { ...d.recebiveis.dados, carga: maisNova } } }
    expect(carimbosDaPagina(r)[0]).toEqual({ fonte: FONTE_CONTAS_A_RECEBER, iso: '2026-10-20T14:00:00-03:00' })
  })
  it('fonte sem data não aparece; as outras seguem na ordem', () => {
    const d = fixtureGeral('normal', '2026-10-26', [2026])
    const fontes = (x: DadosGeral) => carimbosDaPagina(x).map(c => c.fonte)
    expect(fontes({ ...d, recebiveis: { ok: false } })).toEqual([FONTE_CAIXA, FONTE_ANTECIPACOES])
    expect(fontes({ ...d, prejuizos: [], corrente: { ...d.corrente, prejuizos: { ano: 2026, leitura: { ok: false } } } }))
      .toEqual([FONTE_CONTAS_A_RECEBER, FONTE_ANTECIPACOES])
    expect(fontes({ ...d, antecipacoes: [], corrente: { ...d.corrente, antecipacoes: { ano: 2026, leitura: { ok: false } } } }))
      .toEqual([FONTE_CONTAS_A_RECEBER, FONTE_CAIXA])
  })
  it('a leitura do ano corrente entra mesmo fora dos anos selecionados', () => {
    const d = fixtureGeral('normal', '2026-10-26', [2026])
    const r: DadosGeral = { ...d, prejuizos: [], antecipacoes: [] }
    expect(carimbosDaPagina(r).map(c => c.fonte)).toEqual([FONTE_CONTAS_A_RECEBER, FONTE_CAIXA, FONTE_ANTECIPACOES])
  })
})
