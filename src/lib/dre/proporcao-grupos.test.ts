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

// ── Escala COMPARÁVEL (v5.9.2) ────────────────────────────────────────────────
// O ajuste inteiro existe porque, com eixo auto-escalado, RH (10,16 p.p. de amplitude) e
// Despesas Comerciais (0,36 p.p.) desenhavam a MESMA inclinação — uma razão de 28× sumia
// da tela. A invariante que garante a correção é uma só: TODAS as janelas têm a mesma
// altura em pontos percentuais.

describe('escala comum — a invariante do ajuste', () => {
  /** Sete grupos com amplitudes deliberadamente MUITO diferentes. */
  const cenario = () => montarProporcaoGrupos([
    ano(2024, 12, 1000, { RH: -300, COM: -168, CUSTO: -36, ADM: -51, MKT: -62, ESTR: -35, RHB: -109 }),
    ano(2025, 12, 1000, { RH: -354, COM: -168, CUSTO: -37, ADM: -37, MKT: -50, ESTR: -30, RHB: -66 }),
    ano(2026, 12, 1000, { RH: -422, COM: -165, CUSTO: -54, ADM: -33, MKT: -70, ESTR: -43, RHB: -93 }),
  ])

  it('TODAS as séries têm janelas de MESMA altura', () => {
    const alturas = cenario().map(s => Number((s.dominio[1] - s.dominio[0]).toFixed(6)))
    expect(new Set(alturas).size, `alturas diferentes: ${alturas.join(', ')}`).toBe(1)
  })

  it('a janela cobre a série inteira — nenhum ponto fica fora do eixo', () => {
    for (const s of cenario()) {
      for (const p of s.pontos) {
        if (p.av === null) continue
        expect(p.av, `${s.chave} abaixo do eixo`).toBeGreaterThanOrEqual(s.dominio[0] - 1e-9)
        expect(p.av, `${s.chave} acima do eixo`).toBeLessThanOrEqual(s.dominio[1] + 1e-9)
      }
    }
  })

  it('o topo NUNCA passa de zero — são despesas, e ali não há série possível', () => {
    for (const s of cenario()) expect(s.dominio[1], s.chave).toBeLessThanOrEqual(0)
  })

  it('os ticks ficam DENTRO do domínio, igualmente espaçados', () => {
    // Eles não vão de ponta a ponta de propósito: encaixar as PONTAS na grade do passo
    // empurrava a janela para fora da série (ver a nota em `janela`). O domínio é exato;
    // os ticks é que caem em múltiplos redondos dentro dele.
    for (const s of cenario()) {
      expect(s.ticks.length, s.chave).toBeGreaterThanOrEqual(2)
      for (const t of s.ticks) {
        expect(t, `${s.chave}: tick fora do domínio`).toBeGreaterThanOrEqual(s.dominio[0] - 1e-9)
        expect(t, `${s.chave}: tick fora do domínio`).toBeLessThanOrEqual(s.dominio[1] + 1e-9)
      }
      const passos = s.ticks.slice(1).map((t, i) => Number((t - s.ticks[i]).toFixed(6)))
      expect(new Set(passos).size, `${s.chave}: passos irregulares`).toBe(1)
    }
  })

  it('a série cabe no eixo mesmo quando o encaixe dos ticks não é exato', () => {
    // Regressão do caso REAL que só o contrato contra a base viva pegou: RH ia de −32,06%
    // a −42,2% e, com as pontas alinhadas à grade, o ponto de cima saía do eixo — sumindo
    // do gráfico sem erro nenhum.
    const s = montarProporcaoGrupos([
      ano(2024, 12, 1000, { RH: -3206 }),
      ano(2025, 12, 1000, { RH: -3540 }),
      ano(2026, 12, 1000, { RH: -4220 }),
    ])
    const rh = s.find(x => x.chave === 'RH')!
    for (const p of rh.pontos) {
      expect(p.av!, 'ponto fora do eixo').toBeGreaterThanOrEqual(rh.dominio[0] - 1e-9)
      expect(p.av!, 'ponto fora do eixo').toBeLessThanOrEqual(rh.dominio[1] + 1e-9)
    }
  })

  it('a série de MAIOR amplitude usa quase toda a janela, e a menor quase nada', () => {
    // É a leitura visual que se quer: quem variou 28× mais ocupa muito mais altura.
    const s = cenario()
    const uso = (chave: string) => {
      const x = s.find(y => y.chave === chave)!
      const vs = x.pontos.map(p => p.av!).filter(v => v !== null)
      return (Math.max(...vs) - Math.min(...vs)) / (x.dominio[1] - x.dominio[0])
    }
    expect(uso('RH')).toBeGreaterThan(0.5)
    expect(uso('COM')).toBeLessThan(0.1)
  })

  it('série constante não colapsa o eixo', () => {
    const s = montarProporcaoGrupos([
      ano(2024, 12, 1000, { RH: -300 }),
      ano(2025, 12, 1000, { RH: -300 }),
    ])
    for (const x of s) expect(x.dominio[1] - x.dominio[0]).toBeGreaterThan(0)
  })
})

describe('deltaPp — a variação anotada no card', () => {
  it('é último menos primeiro, em p.p.', () => {
    const s = montarProporcaoGrupos([
      ano(2024, 12, 1000, { RH: -300 }),   // -30%
      ano(2025, 12, 1000, { RH: -354 }),   // -35,4%
      ano(2026, 12, 1000, { RH: -422 }),   // -42,2%
    ])
    expect(s.find(x => x.chave === 'RH')!.deltaPp).toBeCloseTo(-12.2, 6)
  })

  it('positivo quando o grupo passou a consumir MENOS receita', () => {
    const s = montarProporcaoGrupos([
      ano(2024, 12, 1000, { ADM: -51 }),
      ano(2025, 12, 1000, { ADM: -33 }),
    ])
    expect(s.find(x => x.chave === 'ADM')!.deltaPp).toBeCloseTo(1.8, 6)
  })

  it('null com menos de dois pontos calculáveis — nunca 0, que afirmaria estabilidade', () => {
    const s = montarProporcaoGrupos([ano(2025, 12, 1000, { RH: -300 })])
    expect(s.find(x => x.chave === 'RH')!.deltaPp).toBeNull()
  })

  it('ignora ano sem base ao calcular o Δ', () => {
    const s = montarProporcaoGrupos([
      ano(2024, 12, 1000, { RH: -300 }),
      ano(2025, 12, 0, { RH: -400 }),     // sem base ⇒ ponto null
      ano(2026, 12, 1000, { RH: -350 }),
    ])
    expect(s.find(x => x.chave === 'RH')!.deltaPp).toBeCloseTo(-5, 6)
  })
})
