import { describe, it, expect } from 'vitest'
import { montarAcumulacao, narrativaContribuicao } from './decomposicao-variacao'
import { ROTULO_RESIDUAL } from './cascata'
import type { DreLinha, DreMensalLike } from './schemas'

// A cascata parte do exercício ANTERIOR FECHADO e cada degrau é o que aquele grupo fez no
// período corrente — não a diferença contra o ano anterior. A troca (v5.9.2) foi feita
// porque a subtração entre janelas de tamanhos diferentes invertia o sinal de 8 dos 15
// degraus na base real. O que se trava aqui: a âncora inicial usa 12 meses SEMPRE, e o
// degrau é um VALOR do período, nunca uma comparação.

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

describe('montarAcumulacao — aditividade ao centavo', () => {
  it('REX anterior FECHADO + Σ degraus ≡ acumulado', () => {
    const anterior = payload([cat('RV', 1000), cat('RH', -400)])
    const atual = payload([cat('RV', 1400), cat('RH', -450)])
    const c = montarAcumulacao(atual, anterior, 8, 'fechado', 'hoje')
    expect(c.inicial.valor + soma(c.degraus)).toBe(c.final.valor)
    expect(c.fecha).toBe(true)
  })

  it('a âncora inicial usa 12 MESES, nunca a janela do ano corrente', () => {
    // 100/mês no ano anterior: 12 meses = 1.200,00, e não 800,00 (a janela de 8).
    const anterior = payload([cat('RV', 100)])
    const atual = payload([cat('RV', 0)])
    const c = montarAcumulacao(atual, anterior, 8, 'fechado', 'hoje')
    expect(c.inicial.valor).toBe(100 * 12 * 100)
  })

  it('cada degrau é o VALOR do grupo no período, não a diferença', () => {
    // RH vale -400/mês nos DOIS anos. Na leitura antiga (diferença) o degrau seria ZERO;
    // aqui ele é o que RH consumiu em 8 meses.
    const anterior = payload([cat('RH', -400)])
    const atual = payload([cat('RH', -400)])
    const c = montarAcumulacao(atual, anterior, 8, 'fechado', 'hoje')
    const rh = c.degraus.find(d => !d.residual)!
    expect(rh.delta).toBe(-400 * 8 * 100)
  })

  it('a soma dos degraus É a variação desde o fechamento', () => {
    const anterior = payload([cat('RV', 1000), cat('RH', -400)])
    const atual = payload([cat('RV', 1400), cat('RH', -450)])
    const c = montarAcumulacao(atual, anterior, 8, 'fechado', 'hoje')
    expect(soma(c.degraus)).toBe(c.final.valor - c.inicial.valor)
  })

  it('grupo que só existe no ano corrente entra normalmente', () => {
    const c = montarAcumulacao(
      payload([cat('RV', 1000), cat('MKT', -800)]),
      payload([cat('RV', 1000)]),
      8, 'a', 'b',
    )
    expect(c.degraus.some(d => d.delta === -800 * 8 * 100)).toBe(true)
    expect(c.inicial.valor + soma(c.degraus)).toBe(c.final.valor)
  })

  it('grupo que existia SÓ no ano anterior não vira degrau — ele não fez nada agora', () => {
    // Ele já está dentro da âncora inicial; repeti-lo como degrau contaria duas vezes.
    const c = montarAcumulacao(
      payload([cat('RV', 1000)]),
      payload([cat('RV', 1000), cat('EXTINTO', -500)]),
      8, 'a', 'b',
    )
    expect(c.degraus.every(d => d.rotulo !== 'EXTINTO')).toBe(true)
    expect(c.inicial.valor + soma(c.degraus)).toBe(c.final.valor)
  })
})

describe('montarAcumulacao — ordenação e agrupamento', () => {
  it('ordena por |valor| decrescente: o que mais pesou vem primeiro', () => {
    const c = montarAcumulacao(
      payload([cat('RV', 100), cat('RH', -900), cat('ADM', 300)]),
      payload([cat('RV', 0)]),
      8, 'a', 'b',
    )
    const mags = c.degraus.filter(d => !d.residual).map(d => Math.abs(d.delta))
    expect(mags).toEqual([...mags].sort((x, y) => y - x))
    expect(c.degraus[0].delta).toBe(-900 * 8 * 100)
  })

  it('degraus sub-piso caem no residual sem perder valor', () => {
    const c = montarAcumulacao(
      payload([cat('RV', 1000), cat('ADM', -1)]),
      payload([cat('RV', 1000)]),
      8, 'a', 'b',
    )
    expect(c.degraus.find(d => d.residual)?.delta).toBe(-8 * 100)
    expect(c.inicial.valor + soma(c.degraus)).toBe(c.final.valor)
  })

  it('residual sempre por último', () => {
    const c = montarAcumulacao(
      payload([cat('RV', 1000), cat('ADM', -1)]),
      payload([cat('RV', 1000)]),
      8, 'a', 'b',
    )
    expect(c.degraus.at(-1)!.rotulo).toBe(ROTULO_RESIDUAL)
  })
})

describe('rótulos — vivos do payload, sem prefixo e sem caixa alta', () => {
  it('usa o rótulo do bloco e retira o `(-)`', () => {
    const c = montarAcumulacao(
      payload([cat('RH', -900), bloco('RH', '(-) Despesas Operacionais de RH')]),
      payload([cat('RH', -400)]),
      8, 'a', 'b',
    )
    expect(c.degraus[0].rotulo).toBe('Despesas Operacionais de RH')
  })

  it('normaliza a CAIXA ALTA preservando sigla', () => {
    const c = montarAcumulacao(
      payload([cat('IMP_H', -900), bloco('IMP_H', '(-) IMPOSTOS E DEDUÇÕES DA RECEITA BRUTA')]),
      payload([cat('IMP_H', -400)]),
      8, 'a', 'b',
    )
    expect(c.degraus[0].rotulo).toBe('Impostos e Deduções da Receita Bruta')
  })

  it('sem linha de bloco, cai na chave em vez de ficar vazio', () => {
    const c = montarAcumulacao(payload([cat('ZZZ', 900)]), payload([cat('ZZZ', 0)]), 8, 'a', 'b')
    expect(c.degraus[0].rotulo).toBe('ZZZ')
  })
})

describe('narrativaContribuicao — a maior conta do grupo', () => {
  it('aponta a categoria de maior peso, com sinal', () => {
    expect(narrativaContribuicao('RH', [
      { rotulo: 'Salários', valor: -50_000 },
      { rotulo: 'Vale', valor: -120_000 },
    ])).toBe('maior conta: Vale (−1.200,00)')
  })

  it('positivo leva `+`', () => {
    expect(narrativaContribuicao('RV', [{ rotulo: 'Comissão', valor: 250_000 }]))
      .toBe('maior conta: Comissão (+2.500,00)')
  })

  it('distribuição de lucros tem causa, não conta', () => {
    expect(narrativaContribuicao('DL', [{ rotulo: 'Retirada', valor: -900_000 }]))
      .toBe('decisão societária')
  })

  it('grupo sem movimento fica em silêncio em vez de apontar R$ 0,00', () => {
    expect(narrativaContribuicao('ADM', [{ rotulo: 'x', valor: 0 }])).toBe('')
    expect(narrativaContribuicao('ADM', [])).toBe('')
  })

  it('casa a categoria por IDENTIDADE, não por rótulo — conta renomeada é a mesma conta', () => {
    const c = montarAcumulacao(
      payload([cat('RH', 1500, 'Salários e encargos', 42)]),
      payload([cat('RH', 1000, 'Salários', 42)]),
      1, 'a', 'b',
    )
    expect(c.degraus[0].narrativa).toBe('maior conta: Salários e encargos (+1.500,00)')
  })
})
