import { describe, it, expect } from 'vitest'
import { mesFinalCoberto, janelaYtdCompetencia, rotuloJanela, type EnvelopeJanela } from './janela-competencia'

// A janela é a decisão que separa "faturamos zero em agosto" de "agosto ainda não subiu".
// Nenhum gate pega esse erro — é definição, não tipo —, então ele é travado aqui.

function envelope(over: Partial<EnvelopeJanela> = {}): EnvelopeJanela {
  return { ano: 2026, relacao: 'corrente', mes_corrente: 8, cobertura_ate: '2026-08-01', ...over }
}

describe('mesFinalCoberto — comparação por ANO, não por distância de datas', () => {
  it('cobertura no ano pedido devolve o mês da cobertura', () => {
    expect(mesFinalCoberto('2026-08-01', 2026)).toBe(8)
    expect(mesFinalCoberto('2026-01-31', 2026)).toBe(1)
    expect(mesFinalCoberto('2026-12-01', 2026)).toBe(12)
  })

  it('cobertura em ano POSTERIOR fecha o ano pedido inteiro', () => {
    expect(mesFinalCoberto('2026-08-01', 2025)).toBe(12)
    expect(mesFinalCoberto('2026-01-01', 2024)).toBe(12)
  })

  it('cobertura em ano ANTERIOR não cobre mês nenhum do ano pedido', () => {
    expect(mesFinalCoberto('2025-12-01', 2026)).toBe(0)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['vazio', ''],
    ['sem forma de data', 'ago/2026'],
  ])('devolve null para %s — o chamador decide o fallback', (_r, v) => {
    expect(mesFinalCoberto(v as string | null | undefined, 2026)).toBeNull()
  })

  it('mês fora da faixa é limitado, nunca propagado', () => {
    expect(mesFinalCoberto('2026-13-01', 2026)).toBe(12)
    expect(mesFinalCoberto('2026-00-01', 2026)).toBe(0)
  })
})

describe('janelaYtdCompetencia — cobertura primeiro, envelope como rede', () => {
  it('usa a cobertura quando ela existe', () => {
    expect(janelaYtdCompetencia(envelope())).toBe(8)
  })

  it('a cobertura VENCE o mes_corrente — é justamente o ponto da decisão', () => {
    // Base parada em julho, envelope dizendo que o mês corrente é setembro: a janela
    // tem de ser julho, senão ago e set entram como zero e o YTD subestima em silêncio.
    expect(janelaYtdCompetencia(envelope({ cobertura_ate: '2026-07-01', mes_corrente: 9 }))).toBe(7)
  })

  it.each([
    ['fechado', 'fechado' as const, 12],
    ['futuro', 'futuro' as const, 0],
  ])('sem cobertura, ano %s cai no envelope', (_r, relacao, esperado) => {
    expect(janelaYtdCompetencia(envelope({ cobertura_ate: null, relacao }))).toBe(esperado)
  })

  it('sem cobertura, ano corrente usa mes_corrente', () => {
    expect(janelaYtdCompetencia(envelope({ cobertura_ate: null, mes_corrente: 5 }))).toBe(5)
  })

  it('sem cobertura e sem mes_corrente num ano corrente devolve 0, não NaN', () => {
    expect(janelaYtdCompetencia(envelope({ cobertura_ate: null, mes_corrente: null }))).toBe(0)
  })
})

describe('rotuloJanela — o subtítulo que explica a divergência com a tabela densa', () => {
  it.each([
    [1, 'jan–jan'],
    [8, 'jan–ago'],
    [11, 'jan–nov'],
    [12, 'ano inteiro'],
  ])('%i meses → "%s"', (m, esperado) => {
    expect(rotuloJanela(m)).toBe(esperado)
  })

  it('sem mês nenhum não há o que declarar', () => {
    expect(rotuloJanela(0)).toBe('')
    expect(rotuloJanela(-1)).toBe('')
  })
})
