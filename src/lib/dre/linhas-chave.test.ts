import { describe, it, expect } from 'vitest'
import { montarLinhasChave, deltaPercentual, CHAVES_LINHAS_CHAVE, type AnoLinhasChave } from './linhas-chave'
import type { DreLinha, DreMensalLike } from './schemas'

function bloco(chave: string, valorMensal: number, t: DreLinha['t'] = 'tot', rotulo?: string): DreLinha {
  const meses = Array.from({ length: 12 }, () => valorMensal)
  return {
    t, rotulo: rotulo ?? `(=) ${chave}`, estrela: false, meses, venc: 0,
    total: valorMensal * 12, chave,
  } as DreLinha
}

function payload(linhas: DreLinha[]): DreMensalLike {
  return {
    ano: 2026, hoje: '2026-08-15', relacao: 'corrente', mes_corrente: 8,
    token_estrutura: null, linhas, bandeja: [],
  }
}

/** Um ano com todas as oito chaves, escaladas por um fator. */
function ano(n: number, fator: number, fechado: boolean): AnoLinhasChave {
  return {
    ano: n,
    fechado,
    payload: payload([
      bloco('RB_H', 1000 * fator, 'blocoH', '(+) RECEITA BRUTA DE VENDAS'),
      bloco('ROL', 900 * fator),
      bloco('LB', 600 * fator),
      bloco('LOP', 300 * fator),
      bloco('LL', 280 * fator),
      bloco('RAIR', 250 * fator),
      bloco('REX', 200 * fator),
      bloco('REXG', 190 * fator),
    ]),
  }
}

describe('montarLinhasChave — as oito linhas de manchete', () => {
  it('devolve as oito chaves na ordem de leitura do demonstrativo', () => {
    const ls = montarLinhasChave([ano(2025, 1, true), ano(2026, 2, false)], 8)
    expect(ls.map(l => l.chave)).toEqual([...CHAVES_LINHAS_CHAVE])
  })

  it('usa o rótulo VIVO do payload, com o prefixo contábil preservado', () => {
    const ls = montarLinhasChave([ano(2026, 1, false)], 8)
    expect(ls[0].rotulo).toBe('(+) RECEITA BRUTA DE VENDAS')
    expect(ls.find(l => l.chave === 'REXG')!.rotulo).toBe('(=) REXG')
  })

  it('ano cheio só de ano FECHADO — 2026 até agosto sob o rótulo "2026" seria mentira', () => {
    const ls = montarLinhasChave([ano(2025, 1, true), ano(2026, 2, false)], 8)
    expect(ls[0].cheios.map(c => c.ano)).toEqual([2025])
  })

  it('YTD corta na janela, não no total do ano', () => {
    const ls = montarLinhasChave([ano(2026, 1, false)], 8)
    const rb = ls.find(l => l.chave === 'RB_H')!
    expect(rb.ytd[0].valor).toBe(1000 * 8)
    expect(rb.cheios).toEqual([])
  })

  it('chave ausente do payload vira coluna vazia, não quebra a tabela', () => {
    const semRexg: AnoLinhasChave = {
      ano: 2026, fechado: false,
      payload: payload([bloco('RB_H', 1000), bloco('REX', 200)]),
    }
    const ls = montarLinhasChave([semRexg], 8)
    expect(ls.find(l => l.chave === 'REXG')!.ytd[0].valor).toBeNull()
  })

  it('destaque vem do tipo do payload, não de lista fixa', () => {
    const ls = montarLinhasChave([ano(2026, 1, false)], 8)
    expect(ls.find(l => l.chave === 'RB_H')!.destaque).toBe(false)   // blocoH
    expect(ls.find(l => l.chave === 'REX')!.destaque).toBe(true)     // tot
  })
})

describe('AV — base da casa, denominador do MESMO recorte', () => {
  it('a base mostra 100%', () => {
    const ls = montarLinhasChave([ano(2026, 1, false)], 8)
    expect(ls.find(l => l.chave === 'RB_H')!.ytd[0].av).toBeCloseTo(100, 6)
  })

  it('cada ano usa a SUA Receita Bruta — composição é leitura interna ao período', () => {
    // 2026 tem o dobro de tudo: as AVs têm de ser idênticas às de 2025.
    const ls = montarLinhasChave([ano(2025, 1, true), ano(2026, 2, false)], 8)
    const rol = ls.find(l => l.chave === 'ROL')!
    expect(rol.ytd[0].av).toBeCloseTo(rol.ytd[1].av!, 6)
    expect(rol.ytd[0].av).toBeCloseTo(90, 6)
  })

  it('base ≤ 0 apaga a AV do período inteiro (a razão inverteria de sinal)', () => {
    const negativo: AnoLinhasChave = {
      ano: 2026, fechado: false,
      payload: payload([bloco('RB_H', -100, 'blocoH'), bloco('REX', -50)]),
    }
    const ls = montarLinhasChave([negativo], 8)
    expect(ls.find(l => l.chave === 'REX')!.ytd[0].av).toBeNull()
  })

  it('preserva o sinal algébrico: despesa dá AV negativa', () => {
    const p: AnoLinhasChave = {
      ano: 2026, fechado: false,
      payload: payload([bloco('RB_H', 1000, 'blocoH'), bloco('REX', -200)]),
    }
    const ls = montarLinhasChave([p], 8)
    expect(ls.find(l => l.chave === 'REX')!.ytd[0].av).toBeCloseTo(-20, 6)
  })
})

describe('deltaPercentual — bordas', () => {
  it('variação simples', () => {
    expect(deltaPercentual(100_00, 150_00)).toBeCloseTo(50, 6)
  })

  it('base ZERO vira travessão — "∞%" contra base inexistente não informa nada', () => {
    expect(deltaPercentual(0, 150_00)).toBeNull()
  })

  it('base negativa devolve a razão algébrica crua, sem maquiar o sinal', () => {
    // −100 → −50 é melhora de 50%, mas a razão é −0,5. Quem exibe decide como ler;
    // esconder isso aqui apagaria o fato de a base ter mudado de lado.
    expect(deltaPercentual(-100_00, -50_00)).toBeCloseTo(-50, 6)
  })

  it('um ano só não produz Δ', () => {
    const ls = montarLinhasChave([ano(2026, 1, false)], 8)
    expect(ls[0].deltaPct).toBeNull()
  })

  it('Δ compara o primeiro YTD com o último', () => {
    const ls = montarLinhasChave([ano(2025, 1, true), ano(2026, 2, false)], 8)
    expect(ls.find(l => l.chave === 'REX')!.deltaPct).toBeCloseTo(100, 6)
  })
})
