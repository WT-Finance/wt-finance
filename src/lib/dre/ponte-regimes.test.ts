import { describe, it, expect } from 'vitest'
import { montarPonte, narrativaDegrau, PAREAMENTO_PONTE, type ParPonte } from './ponte-regimes'
import { ROTULO_RESIDUAL, THRESHOLD_AGRUPAMENTO } from './cascata'
import type { DreLinha, DreMensalLike } from './schemas'

// A ponte é a única figura da plataforma que afirma uma IDENTIDADE entre duas bases
// independentes. Se ela não fechar ao centavo, não é um card com um número errado — é
// um card que desautoriza os dois demonstrativos que ele concilia. Daí o peso destes
// testes na aditividade e, sobretudo, na TOTALIDADE: a identidade fecha por construção
// *desde que* cada folha entre em exatamente um balde, e é isso que se trava aqui.

let seq = 1

/** Linha de categoria: `g` é a folha a que ela pertence. */
function cat(g: string, valorMensal: number, rotulo = `${g} cat`): DreLinha {
  const meses = Array.from({ length: 12 }, () => valorMensal)
  return {
    t: 'cat', rotulo, estrela: false, meses, venc: 0,
    total: valorMensal * 12, g, categoria_id: seq++,
  } as DreLinha
}

function payload(linhas: DreLinha[], bandeja: DreMensalLike['bandeja'] = []): DreMensalLike {
  return {
    ano: 2026, hoje: '2026-08-15', relacao: 'corrente', mes_corrente: 8,
    token_estrutura: null, linhas, bandeja,
  }
}

/** Um par de payloads com todas as folhas vivas das duas árvores, valores distintos. */
function cenario() {
  const comp = payload([
    cat('RV', 1000), cat('REEMB', -50), cat('IMP_H', -80), cat('CUSTO', -300),
    cat('ADM', -40), cat('COM', -60), cat('MKT', -30), cat('ESTR', -20),
    cat('RH', -200), cat('RHB', -45), cat('FIN', -15), cat('RNOP', 10),
    cat('DNOP', -5), cat('INV', -25), cat('DL', -70),
  ])
  const caixa = payload([
    cat('ENT_H', 5000), cat('PAG_H', -4500), cat('RV', 1200), cat('IMP_H', -400),
    cat('CUSTO', -350), cat('ADM', -38), cat('COM', -65), cat('MKT', -28),
    cat('ESTR', -22), cat('RH', -210), cat('RHB', -43), cat('FIN', -12),
    cat('RNOP', 12), cat('DNOP', -4), cat('INV', -30), cat('IMOB', -8),
    cat('DIST_LUCROS', -90),
  ])
  return { comp, caixa }
}

const soma = (ds: { delta: number }[]) => ds.reduce((s, d) => s + d.delta, 0)

describe('PAREAMENTO_PONTE — a partição', () => {
  it('nenhuma folha aparece em DOIS baldes (a premissa da identidade)', () => {
    for (const lado of ['comp', 'caixa'] as const) {
      const vistas = new Set<string>()
      for (const par of PAREAMENTO_PONTE) {
        for (const k of par[lado]) {
          expect(vistas.has(k), `${k} pareada duas vezes no lado ${lado}`).toBe(false)
          vistas.add(k)
        }
      }
    }
  })

  it('cobre as folhas vivas das duas árvores (0205+0251+0254 e 0256)', () => {
    const comp = new Set(PAREAMENTO_PONTE.flatMap(p => p.comp))
    const caixa = new Set(PAREAMENTO_PONTE.flatMap(p => p.caixa))
    for (const k of ['RV', 'REEMB', 'IMP_H', 'CUSTO', 'ADM', 'COM', 'MKT', 'ESTR',
      'RH', 'RHB', 'FIN', 'RNOP', 'DNOP', 'INV', 'DL']) {
      expect(comp.has(k), `folha de competência ${k} sem balde`).toBe(true)
    }
    for (const k of ['ENT_H', 'PAG_H', 'RV', 'IMP_H', 'CUSTO', 'ADM', 'COM', 'MKT',
      'ESTR', 'RH', 'RHB', 'FIN', 'RNOP', 'DNOP', 'INV', 'IMOB', 'DIST_LUCROS']) {
      expect(caixa.has(k), `folha de caixa ${k} sem balde`).toBe(true)
    }
  })
})

describe('montarPonte — aditividade ao centavo', () => {
  it('âncora inicial + Σ degraus ≡ âncora final', () => {
    const { comp, caixa } = cenario()
    const p = montarPonte(comp, caixa, 8)
    expect(p.inicial.valor + soma(p.degraus)).toBe(p.final.valor)
    expect(p.fecha).toBe(true)
  })

  it('vale em QUALQUER janela — inclusive a de um mês e a do ano inteiro', () => {
    const { comp, caixa } = cenario()
    for (const m of [1, 3, 8, 12]) {
      const p = montarPonte(comp, caixa, m)
      expect(p.inicial.valor + soma(p.degraus), `janela ${m}`).toBe(p.final.valor)
    }
  })

  it('a BANDEJA não entra — ela não compõe o REX, e somá-la quebraria a identidade', () => {
    const { comp, caixa } = cenario()
    const comBandeja = payload(comp.linhas, [{
      rotulo: 'órfã', grupo_monde: 'X', chave: 'g · d',
      meses: Array.from({ length: 12 }, () => 999), venc: 0, total: 11_988,
    }])
    const p = montarPonte(comBandeja, caixa, 8)
    expect(p.inicial.valor + soma(p.degraus)).toBe(p.final.valor)
    // e o valor da bandeja não vazou para nenhum degrau
    expect(p.degraus.some(d => d.delta === -999 * 8 * 100)).toBe(false)
  })
})

describe('montarPonte — TOTALIDADE (o teste que importa)', () => {
  it('folha nova SEM par cai no residual e a identidade se mantém', () => {
    // Cenário MÍNIMO de propósito: um par acima do piso mais uma folha órfã de cada
    // lado. Sem degraus sub-piso na mistura, o residual contém só o descasamento
    // estrutural — que é o que este teste quer medir. (O caso em que ele acumula as
    // duas origens tem teste próprio abaixo.)
    const comp = payload([cat('RV', 1000), cat('NOVO_COMP', -700)])
    const caixa = payload([cat('RV', 1200), cat('NOVO_CAIXA', -250)])

    const p = montarPonte(comp, caixa, 8)

    expect(p.inicial.valor + soma(p.degraus)).toBe(p.final.valor)
    expect(p.fecha).toBe(true)
    expect(p.naoPareadas.competencia).toEqual(['NOVO_COMP'])
    expect(p.naoPareadas.caixa).toEqual(['NOVO_CAIXA'])

    const residual = p.degraus.find(d => d.residual)
    expect(residual).toBeDefined()
    // caixa − competência: (−250 · 8 meses) − (−700 · 8 meses) = +3.600,00
    expect(residual!.delta).toBe((-250 * 8 - -700 * 8) * 100)
  })

  it('o residual acumula as DUAS origens — órfãs e degraus sub-piso — no mesmo balde', () => {
    // `cenario()` tem vários pares com diferença de poucos reais na janela, todos
    // abaixo do piso. Com uma órfã por cima, o residual é a soma das duas coisas —
    // e continua fechando a identidade, que é o ponto.
    const { comp, caixa } = cenario()
    const p = montarPonte(payload([...comp.linhas, cat('ORFA', -100)]), caixa, 8)

    const residual = p.degraus.find(d => d.residual)!
    const semResidual = montarPonte(comp, caixa, 8).degraus.find(d => d.residual)!
    expect(residual.delta).toBe(semResidual.delta + 100 * 8 * 100)
    expect(p.inicial.valor + soma(p.degraus)).toBe(p.final.valor)
  })

  it('sem órfã e sem degrau sub-piso, o residual não é desenhado (um "resto" de R$ 0 mente)', () => {
    const comp = payload([cat('RV', 1000)])
    const caixa = payload([cat('RV', 1200)])
    const p = montarPonte(comp, caixa, 8)
    expect(p.naoPareadas.competencia).toEqual([])
    expect(p.naoPareadas.caixa).toEqual([])
    expect(p.degraus.some(d => d.rotulo === ROTULO_RESIDUAL)).toBe(false)
  })

  it('o residual fica SEMPRE por último, mesmo sendo grande', () => {
    const { comp, caixa } = cenario()
    const p = montarPonte(payload([...comp.linhas, cat('ORFA', -99_999)]), caixa, 8)
    expect(p.degraus.at(-1)!.residual).toBe(true)
  })
})

describe('montarPonte — agrupamento de degraus pequenos', () => {
  it('degrau abaixo do piso vai ao residual SEM perder valor', () => {
    // Um único par com diferença de R$ 1,00 no mês (R$ 8,00 na janela) — bem abaixo
    // do piso de R$ 500 — e todo o resto idêntico dos dois lados.
    const comp = payload([cat('RV', 100), cat('ADM', -50)])
    const caixa = payload([cat('RV', 100), cat('ADM', -51)])
    const p = montarPonte(comp, caixa, 8)

    expect(p.degraus.every(d => d.rotulo !== 'Desp. Administrativas')).toBe(true)
    const residual = p.degraus.find(d => d.residual)!
    expect(residual.delta).toBe(-8 * 100)
    expect(p.inicial.valor + soma(p.degraus)).toBe(p.final.valor)
  })

  it('degrau ACIMA do piso permanece nomeado', () => {
    const comp = payload([cat('ADM', -1000)])
    const caixa = payload([cat('ADM', -1100)])
    const p = montarPonte(comp, caixa, 8)
    const adm = p.degraus.find(d => d.rotulo === 'Desp. Administrativas')
    expect(adm).toBeDefined()
    expect(Math.abs(adm!.delta)).toBeGreaterThanOrEqual(THRESHOLD_AGRUPAMENTO)
  })
})

describe('narrativaDegrau — gerada por (natureza, sinal), nunca fixa por linha', () => {
  const receita: ParPonte = { rotulo: 'r', comp: ['X'], caixa: ['X'], natureza: 'receita' }
  const despesa: ParPonte = { rotulo: 'd', comp: ['Y'], caixa: ['Y'], natureza: 'despesa' }
  const rv: ParPonte = { rotulo: 'rv', comp: ['RV'], caixa: ['RV'], natureza: 'receita' }

  it('despesa: Δ<0 é pagamento adiantado; Δ>0 é incorrido a pagar', () => {
    expect(narrativaDegrau(despesa, -100)).toBe('pago além do incorrido no período')
    expect(narrativaDegrau(despesa, 100)).toBe('incorrido ainda não pago')
  })

  it('receita: Δ>0 é recebimento adiantado; Δ<0 é reconhecido a receber', () => {
    expect(narrativaDegrau(receita, 100)).toBe('recebido além do reconhecido')
    expect(narrativaDegrau(receita, -100)).toBe('reconhecido ainda não recebido')
  })

  it('RV positiva ganha o nome do fenômeno, não a frase genérica', () => {
    expect(narrativaDegrau(rv, 100)).toBe('recebido > emitido: conversão de backlog')
    expect(narrativaDegrau(rv, -100)).toBe('reconhecido ainda não recebido')
  })

  it('linha especial usa a nota fixa — não há par a descasar', () => {
    const repasse = PAREAMENTO_PONTE.find(p => p.rotulo === 'Repasse')!
    expect(narrativaDegrau(repasse, 999)).toContain('float da intermediação')
    expect(narrativaDegrau(repasse, -999)).toContain('float da intermediação')
  })

  it('Δ zero não inventa descasamento', () => {
    expect(narrativaDegrau(despesa, 0)).toBe('sem descasamento no período')
  })
})

describe('montarPonte — a anotação do capital de giro', () => {
  it('traz o sinal e o valor da diferença entre as âncoras', () => {
    const { comp, caixa } = cenario()
    const p = montarPonte(comp, caixa, 8)
    const esperado = p.final.valor - p.inicial.valor
    expect(p.final.nota).toContain(esperado >= 0 ? '+' : '−')
    expect(p.final.nota).toContain(
      Math.abs(esperado / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    )
  })
})
