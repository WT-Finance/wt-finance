import { describe, expect, it } from 'vitest'
import {
  anosQueFalharam, dadosCarregados, dadosOuNull, escalaEixo, leituraDoAnoCorrente, serieMensalMultiAno,
  valoresDaSerie,
} from './composicao'
import type { LeituraAno } from './tipos'

interface Dado {
  relacao: 'fechado' | 'corrente' | 'futuro'
  mes_corrente: number | null
  meses: number[]
}

const fechado = (ano: number, meses: number[]): LeituraAno<Dado> =>
  ({ ano, leitura: { ok: true, dados: { relacao: 'fechado', mes_corrente: null, meses } } })
const corrente = (ano: number, mes: number, meses: number[]): LeituraAno<Dado> =>
  ({ ano, leitura: { ok: true, dados: { relacao: 'corrente', mes_corrente: mes, meses } } })
const falha = (ano: number): LeituraAno<Dado> => ({ ano, leitura: { ok: false } })

const cheio = (v: number) => Array.from({ length: 12 }, () => v)

describe('serieMensalMultiAno', () => {
  it('eixo SEMPRE jan–dez; mês que o ano corrente ainda não alcançou é null (não zero)', () => {
    const s = serieMensalMultiAno([corrente(2026, 3, [-1, -2, -3, 0, 0, 0, 0, 0, 0, 0, 0, 0])], d => d.meses)
    expect(s.pontos).toHaveLength(12)
    expect(s.pontos.map(p => p.label).slice(0, 3)).toEqual(['Jan', 'Fev', 'Mar'])
    expect(s.pontos.map(p => p.valores[0])).toEqual([-1, -2, -3, null, null, null, null, null, null, null, null, null])
  })

  it('mês REALIZADO sem lançamento é zero de verdade (dentro do recorte)', () => {
    const s = serieMensalMultiAno([fechado(2025, cheio(0))], d => d.meses)
    expect(s.pontos.every(p => p.valores[0] === 0)).toBe(true)
    expect(s.temMovimento).toBe(false)
  })

  it('anos em ordem crescente, uma coluna por ano, com "*" no parcial', () => {
    const s = serieMensalMultiAno([
      corrente(2026, 10, cheio(-2)), fechado(2024, cheio(-1)), fechado(2025, cheio(-3)),
    ], d => d.meses)
    expect(s.anos).toEqual([
      { ano: 2024, rotulo: '2024' }, { ano: 2025, rotulo: '2025' }, { ano: 2026, rotulo: '2026*' },
    ])
    expect(s.pontos[0].valores).toEqual([-1, -3, -2])
    // Out (10) ainda é realizado em 2026; nov e dez não.
    expect(s.pontos[9].valores).toEqual([-1, -3, -2])
    expect(s.pontos[10].valores).toEqual([-1, -3, null])
    expect(s.temMovimento).toBe(true)
  })

  it('ano que falhou sai da série e vem em anosFalha (a cor dos outros não depende dele)', () => {
    const s = serieMensalMultiAno([fechado(2025, cheio(-1)), falha(2026)], d => d.meses)
    expect(s.anos.map(a => a.ano)).toEqual([2025])
    expect(s.anosFalha).toEqual([2026])
    expect(s.pontos[0].valores).toEqual([-1])
  })

  it('todos falharam: série sem anos, sem movimento', () => {
    const s = serieMensalMultiAno([falha(2025), falha(2026)], d => d.meses)
    expect(s.anos).toEqual([])
    expect(s.anosFalha).toEqual([2025, 2026])
    expect(s.temMovimento).toBe(false)
  })

  it('o extrator escolhe a grandeza (antecipação: volume dentro de meses[])', () => {
    const l: LeituraAno<{ relacao: 'fechado'; mes_corrente: null; m: { volume: number }[] }> = {
      ano: 2025, leitura: { ok: true, dados: { relacao: 'fechado', mes_corrente: null, m: Array.from({ length: 12 }, (_, i) => ({ volume: i * 10 })) } },
    }
    const s = serieMensalMultiAno([l], d => d.m.map(x => x.volume))
    expect(s.pontos.map(p => p.valores[0])).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110])
  })
})

describe('auxiliares', () => {
  it('dadosCarregados / anosQueFalharam / dadosOuNull', () => {
    const ls = [falha(2026), fechado(2025, cheio(1)), fechado(2024, cheio(2))]
    expect(dadosCarregados(ls).map(x => x.ano)).toEqual([2024, 2025])
    expect(anosQueFalharam(ls)).toEqual([2026])
    expect(dadosOuNull({ ok: false })).toBeNull()
    expect(dadosOuNull({ ok: true, dados: 7 })).toBe(7)
  })
})

describe('leituraDoAnoCorrente — a RPC decide; falhou ≠ não selecionada', () => {
  it('acha a leitura carregada com relacao "corrente"', () => {
    const l = leituraDoAnoCorrente([fechado(2025, cheio(1)), corrente(2026, 10, cheio(2))], '2026-10-26')
    expect(l?.ano).toBe(2026)
  })
  it('leitura do ano de hoje que FALHOU é devolvida (a UI mostra erro, não "não selecionado")', () => {
    const l = leituraDoAnoCorrente([fechado(2025, cheio(1)), falha(2026)], '2026-10-26')
    expect(l).toEqual({ ano: 2026, leitura: { ok: false } })
  })
  it('ano corrente fora da seleção → null', () => {
    expect(leituraDoAnoCorrente([fechado(2024, cheio(1)), fechado(2025, cheio(1))], '2026-10-26')).toBeNull()
    expect(leituraDoAnoCorrente([], '2026-10-26')).toBeNull()
  })
})

describe('escalaEixo — domínio e ticks juntos, sempre contendo dado e zero', () => {
  it('série só negativa: o domínio chega ao zero e cobre o mínimo', () => {
    const e = escalaEixo([-1300, -200, 0])
    expect(e.domain[1]).toBe(0)
    expect(e.domain[0]).toBeLessThanOrEqual(-1300)
    expect(e.ticks).toContain(0)
    expect(e.ticks[0]).toBe(e.domain[0])
    expect(e.ticks[e.ticks.length - 1]).toBe(e.domain[1])
  })

  it('série que cruza o zero: o zero está entre os ticks e nenhum ponto sai do domínio', () => {
    const vals = [-205629.09, 80119.24, -50000]
    const e = escalaEixo(vals)
    expect(e.ticks).toContain(0)
    for (const v of vals) { expect(v).toBeGreaterThanOrEqual(e.domain[0]); expect(v).toBeLessThanOrEqual(e.domain[1]) }
  })

  it('ticks equidistantes (passo redondo, sem 3,75)', () => {
    const e = escalaEixo([0, 8200])
    const passos = e.ticks.slice(1).map((t, i) => t - e.ticks[i])
    expect(new Set(passos).size).toBe(1)
    expect(e.domain[1]).toBeGreaterThanOrEqual(8200)
  })

  it('ignora null (mês não alcançado) e série vazia/zero não estoura', () => {
    expect(escalaEixo([null, undefined, 100]).domain[1]).toBeGreaterThanOrEqual(100)
    const z = escalaEixo([0, 0, null])
    expect(Number.isFinite(z.domain[0]) && Number.isFinite(z.domain[1])).toBe(true)
    expect(z.ticks.length).toBeGreaterThan(1)
  })

  it('valoresDaSerie achata os pontos para a escala', () => {
    const s = serieMensalMultiAno([fechado(2025, cheio(-5))], d => d.meses)
    expect(valoresDaSerie(s)).toHaveLength(12)
  })
})
