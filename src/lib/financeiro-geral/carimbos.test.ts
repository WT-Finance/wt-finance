import { describe, expect, it } from 'vitest'
import { carimboDoFluxo, carimboGeral, carimboMaisRecente } from './carimbos'
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

describe('carimboGeral', () => {
  const base: DadosGeral = {
    anos: [2026], anosDisponiveis: [2026], hoje: '2026-10-15', podeGerir: false,
    recebiveis: { ok: false }, antecipacoes: [], prejuizos: [],
    corrente: { prejuizos: { ano: 2026, leitura: { ok: false } }, antecipacoes: { ano: 2026, leitura: { ok: false } } },
  }
  it('sem nenhuma fonte carregada → null (o carimbo some, o título fica)', () => {
    expect(carimboGeral(base)).toBeNull()
    expect(carimboGeral(fixtureGeral('erro', '2026-10-26', [2026]))).toBeNull()
  })
  it('estado vazio da fixture: nenhuma carga e nenhum registro → null', () => {
    expect(carimboGeral(fixtureGeral('vazio', '2026-10-26', [2026]))).toBeNull()
  })
  it('lê a gravação da carga de contas a receber quando é a fonte mais nova', () => {
    const d = fixtureGeral('normal', '2026-10-26', [2026])
    if (!d.recebiveis.ok || !d.recebiveis.dados.carga) throw new Error('fixture')
    const maisNova = { ...d.recebiveis.dados.carga, gravado_em: '2026-10-20T14:00:00-03:00' }
    const r: DadosGeral = { ...d, recebiveis: { ok: true, dados: { ...d.recebiveis.dados, carga: maisNova } } }
    expect(carimboGeral(r)).toBe('2026-10-20T14:00:00-03:00')
  })
  it('sem a carga, vale o mais recente entre antecipações e prejuízos (2 fontes de fluxo)', () => {
    const d = fixtureGeral('normal', '2026-10-26', [2026])
    // prejuízos (fato_fluxo) e a carga estão em 15/10; as antecipações, em 22/09
    expect(carimboGeral({ ...d, recebiveis: { ok: false } })).toBe('2026-10-15T16:42:10+00:00')
  })
})
