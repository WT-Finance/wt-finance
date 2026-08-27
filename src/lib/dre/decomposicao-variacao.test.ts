import { describe, it, expect } from 'vitest'
import { montarDecomposicao, narrativaVariacao } from './decomposicao-variacao'
import { ROTULO_RESIDUAL } from './cascata'
import type { DreLinha, DreMensalLike } from './schemas'

let seq = 1

function cat(g: string, valorMensal: number, rotulo = `${g} cat`, id = seq++): DreLinha {
  const meses = Array.from({ length: 12 }, () => valorMensal)
  return {
    t: 'cat', rotulo, estrela: false, meses, venc: 0,
    total: valorMensal * 12, g, categoria_id: id,
  } as DreLinha
}

function bloco(chave: string, rotulo: string): DreLinha {
  return {
    t: 'sub', rotulo, estrela: false, meses: Array.from({ length: 12 }, () => 0),
    venc: 0, total: 0, chave,
  } as DreLinha
}

function payload(linhas: DreLinha[]): DreMensalLike {
  return {
    ano: 2026, hoje: '2026-08-15', relacao: 'corrente', mes_corrente: 8,
    token_estrutura: null, linhas, bandeja: [],
  }
}

const soma = (ds: { delta: number }[]) => ds.reduce((s, d) => s + d.delta, 0)

describe('montarDecomposicao — aditividade ao centavo', () => {
  it('REX anterior + Σ degraus ≡ REX atual', () => {
    const anterior = payload([cat('RV', 1000), cat('RH', -400), cat('ADM', -100)])
    const atual = payload([cat('RV', 1400), cat('RH', -450), cat('ADM', -90)])
    const c = montarDecomposicao(atual, anterior, 8, 'YTD 25', 'YTD 26')
    expect(c.inicial.valor + soma(c.degraus)).toBe(c.final.valor)
    expect(c.fecha).toBe(true)
  })

  it('folha que só existe num dos anos entra com o outro lado valendo zero', () => {
    const anterior = payload([cat('RV', 1000)])
    const atual = payload([cat('RV', 1000), cat('MKT', -800)])
    const c = montarDecomposicao(atual, anterior, 8, 'a', 'b')
    expect(c.inicial.valor + soma(c.degraus)).toBe(c.final.valor)
    expect(c.degraus.some(d => d.delta === -800 * 8 * 100)).toBe(true)
  })
})

describe('montarDecomposicao — ordenação e agrupamento', () => {
  it('ordena por |Δ| decrescente: o que mais pesou vem primeiro', () => {
    const anterior = payload([cat('RV', 0), cat('RH', 0), cat('ADM', 0)])
    const atual = payload([cat('RV', 100), cat('RH', -900), cat('ADM', 300)])
    const c = montarDecomposicao(atual, anterior, 8, 'a', 'b')
    const magnitudes = c.degraus.filter(d => !d.residual).map(d => Math.abs(d.delta))
    expect(magnitudes).toEqual([...magnitudes].sort((x, y) => y - x))
    expect(c.degraus[0].delta).toBe(-900 * 8 * 100)
  })

  it('degraus sub-piso caem no residual sem perder valor', () => {
    const anterior = payload([cat('RV', 1000), cat('ADM', -100)])
    const atual = payload([cat('RV', 1500), cat('ADM', -101)])
    const c = montarDecomposicao(atual, anterior, 8, 'a', 'b')
    expect(c.degraus.find(d => d.residual)?.delta).toBe(-8 * 100)
    expect(c.inicial.valor + soma(c.degraus)).toBe(c.final.valor)
  })

  it('residual sempre por último', () => {
    const anterior = payload([cat('RV', 1000), cat('ADM', -100)])
    const atual = payload([cat('RV', 1500), cat('ADM', -101)])
    const c = montarDecomposicao(atual, anterior, 8, 'a', 'b')
    expect(c.degraus.at(-1)!.rotulo).toBe(ROTULO_RESIDUAL)
  })
})

describe('rótulos — vivos do payload, sem prefixo contábil', () => {
  it('usa o rótulo do bloco e retira o `(-)`', () => {
    const anterior = payload([cat('RH', -400), bloco('RH', '(-) Despesas Operacionais de RH')])
    const atual = payload([cat('RH', -900), bloco('RH', '(-) Despesas Operacionais de RH')])
    const c = montarDecomposicao(atual, anterior, 8, 'a', 'b')
    expect(c.degraus[0].rotulo).toBe('Despesas Operacionais de RH')
  })

  it('sem linha de bloco, cai na chave em vez de ficar vazio', () => {
    const c = montarDecomposicao(payload([cat('ZZZ', 900)]), payload([cat('ZZZ', 0)]), 8, 'a', 'b')
    expect(c.degraus[0].rotulo).toBe('ZZZ')
  })
})

describe('narrativaVariacao — a categoria que puxou', () => {
  it('aponta a categoria de maior |Δ| do grupo, com sinal', () => {
    const n = narrativaVariacao('RH', [
      { rotulo: 'Salários', delta: -50_000 },
      { rotulo: 'Vale', delta: -120_000 },
    ])
    expect(n).toBe('puxado por Vale (−1.200,00)')
  })

  it('positivo leva `+`', () => {
    expect(narrativaVariacao('RV', [{ rotulo: 'Comissão', delta: 250_000 }]))
      .toBe('puxado por Comissão (+2.500,00)')
  })

  it('distribuição de lucros tem causa, não categoria', () => {
    expect(narrativaVariacao('DL', [{ rotulo: 'Retirada', delta: -900_000 }]))
      .toBe('decisão societária')
  })

  it('grupo sem movimento fica em silêncio em vez de apontar R$ 0,00', () => {
    expect(narrativaVariacao('ADM', [{ rotulo: 'x', delta: 0 }])).toBe('')
    expect(narrativaVariacao('ADM', [])).toBe('')
  })

  it('casa a categoria entre os anos por IDENTIDADE, não por rótulo', () => {
    // Mesma categoria (id 42), renomeada no ano atual: é UMA conta que variou 500,
    // e não duas contas de 1000 e 1500.
    const anterior = payload([cat('RH', 1000, 'Salários', 42)])
    const atual = payload([cat('RH', 1500, 'Salários e encargos', 42)])
    const c = montarDecomposicao(atual, anterior, 1, 'a', 'b')
    expect(c.degraus[0].narrativa).toBe('puxado por Salários e encargos (+500,00)')
  })
})
