import { describe, it, expect } from 'vitest'
import { montarProporcaoGrupos, GRUPOS_PROPORCAO, type AnoProporcao } from './proporcao-grupos'
import type { DreLinha, DreMensalLike } from './schemas'

// A grade responde "o grupo cresceu mais rápido que a receita?". O que se trava aqui é que
// o denominador é o do PRÓPRIO ano, que ano sem base não vira zero, e que o sinal algébrico
// da tabela é preservado.

let seq = 1

function cat(g: string, valorMensal: number): DreLinha {
  const meses = Array.from({ length: 12 }, () => valorMensal)
  return {
    t: 'cat', rotulo: `${g} cat`, estrela: false, meses, venc: 0,
    total: valorMensal * 12, g, categoria_id: seq++,
  } as DreLinha
}

function bloco(chave: string, valorMensal: number, rotulo?: string): DreLinha {
  const meses = Array.from({ length: 12 }, () => valorMensal)
  return {
    t: 'blocoH', rotulo: rotulo ?? chave, estrela: false, meses, venc: 0,
    total: valorMensal * 12, chave,
  } as DreLinha
}

function payload(linhas: DreLinha[]): DreMensalLike {
  return {
    ano: 2026, hoje: '2026-08-15', relacao: 'corrente', mes_corrente: 8,
    token_estrutura: null, linhas, bandeja: [],
  }
}

/** Um ano com Receita Bruta e os sete grupos, escaláveis. */
function ano(n: number, meses: number, rb: number, grupos: Partial<Record<string, number>>): AnoProporcao {
  return {
    ano: n,
    meses,
    payload: payload([
      bloco('RB_H', rb, '(+) RECEITA BRUTA DE VENDAS'),
      ...Object.entries(grupos).map(([g, v]) => cat(g, v as number)),
    ]),
  }
}

describe('montarProporcaoGrupos — os sete grupos, na ordem da árvore', () => {
  it('devolve as sete séries, com CUSTO primeiro (ele é exibido isolado)', () => {
    const s = montarProporcaoGrupos([ano(2025, 12, 1000, { CUSTO: -100 })])
    expect(s.map(x => x.chave)).toEqual([...GRUPOS_PROPORCAO])
    expect(s[0].chave).toBe('CUSTO')
  })

  it('um ponto por ano, na ORDEM recebida — quem exibe não reordena', () => {
    const s = montarProporcaoGrupos([
      ano(2024, 12, 1000, { RH: -300 }),
      ano(2025, 12, 1000, { RH: -350 }),
      ano(2026, 8, 1000, { RH: -400 }),
    ])
    expect(s.find(x => x.chave === 'RH')!.pontos.map(p => p.ano)).toEqual([2024, 2025, 2026])
  })

  it('usa o rótulo VIVO do payload, sem prefixo e sem caixa alta', () => {
    const p = payload([
      bloco('RB_H', 1000, '(+) RECEITA BRUTA DE VENDAS'),
      bloco('CUSTO', -100, '(-) CUSTO DOS SERVIÇOS PRESTADOS'),
      cat('CUSTO', -100),
    ])
    const s = montarProporcaoGrupos([{ ano: 2025, meses: 12, payload: p }])
    expect(s[0].rotulo).toBe('Custo dos Serviços Prestados')
  })

  it('sem linha de bloco, cai na chave em vez de ficar vazio', () => {
    const s = montarProporcaoGrupos([ano(2025, 12, 1000, { CUSTO: -100 })])
    expect(s[0].rotulo).toBe('CUSTO')
  })
})

describe('a AV é sobre a Receita Bruta do PRÓPRIO ano', () => {
  it('dois anos com tudo dobrado têm a MESMA proporção', () => {
    const s = montarProporcaoGrupos([
      ano(2024, 12, 1000, { RH: -300 }),
      ano(2025, 12, 2000, { RH: -600 }),
    ])
    const rh = s.find(x => x.chave === 'RH')!
    expect(rh.pontos[0].av).toBeCloseTo(-30, 6)
    expect(rh.pontos[1].av).toBeCloseTo(-30, 6)
  })

  it('grupo que cresce MAIS que a receita piora a proporção', () => {
    const s = montarProporcaoGrupos([
      ano(2024, 12, 1000, { RH: -300 }),   // -30%
      ano(2025, 12, 2000, { RH: -800 }),   // -40%
    ])
    const rh = s.find(x => x.chave === 'RH')!
    expect(rh.pontos[0].av!).toBeGreaterThan(rh.pontos[1].av!) // -30 > -40
  })

  it('preserva o SINAL algébrico da tabela — despesa dá AV negativa', () => {
    const s = montarProporcaoGrupos([ano(2025, 12, 1000, { CUSTO: -50 })])
    expect(s[0].pontos[0].av).toBeCloseTo(-5, 6)
  })
})

describe('bordas — ano sem base nunca vira zero', () => {
  it('Receita Bruta AUSENTE → av null (o ponto não é plotado)', () => {
    const semRb: AnoProporcao = {
      ano: 2025, meses: 12,
      payload: payload([cat('RH', -300)]),
    }
    expect(montarProporcaoGrupos([semRb]).find(x => x.chave === 'RH')!.pontos[0].av).toBeNull()
  })

  it('Receita Bruta ZERO ou NEGATIVA → av null (a razão inverteria de sinal)', () => {
    for (const rb of [0, -1000]) {
      const s = montarProporcaoGrupos([ano(2025, 12, rb, { RH: -300 })])
      expect(s.find(x => x.chave === 'RH')!.pontos[0].av, `rb=${rb}`).toBeNull()
    }
  })

  it('grupo AUSENTE no payload vale 0% — a conta existe e não consumiu nada', () => {
    // Diferente de "não dá para calcular": aqui a base é válida e o grupo é zero.
    const s = montarProporcaoGrupos([ano(2025, 12, 1000, { RH: -300 })])
    expect(s.find(x => x.chave === 'MKT')!.pontos[0].av).toBeCloseTo(0, 6)
  })
})

describe('ano PARCIAL é sinalizado, não escondido', () => {
  it('marca `parcial` e diz quantos meses entraram', () => {
    const s = montarProporcaoGrupos([
      ano(2025, 12, 1000, { RH: -300 }),
      ano(2026, 8, 1000, { RH: -300 }),
    ])
    const rh = s.find(x => x.chave === 'RH')!
    expect(rh.pontos[0]).toMatchObject({ parcial: false, mesesCobertos: 12 })
    expect(rh.pontos[1]).toMatchObject({ parcial: true, mesesCobertos: 8 })
  })

  it('a janela corta NUMERADOR e DENOMINADOR juntos — a proporção não se distorce', () => {
    // Mesmo ritmo mensal em 8 e em 12 meses ⇒ mesma proporção. É o que torna o ponto
    // parcial comparável com os anos cheios.
    const s = montarProporcaoGrupos([
      ano(2025, 12, 1000, { RH: -300 }),
      ano(2026, 8, 1000, { RH: -300 }),
    ])
    const rh = s.find(x => x.chave === 'RH')!
    expect(rh.pontos[1].av).toBeCloseTo(rh.pontos[0].av!, 6)
  })
})
