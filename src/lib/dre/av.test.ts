import { describe, it, expect } from 'vitest'
import { avPercentual, baseAv, fmtAv, linhaBaseAv, indiceBaseAv, CHAVE_BASE_AV } from './av'
import type { DreLinha } from './schemas'

// ⚠️ Os números aqui são ILUSTRATIVOS, não "os valores de produção". A estrutura da DRE é
// DADO editável pela interface: uma categoria re-parenteada muda Receita Bruta, ROL e Lucro
// Bruto de um dia para o outro (aconteceu entre a v5.7.0 e a v5.7.2). Teste de módulo puro
// não deve depender do dado vivo — quem confronta o vivo é o caso de contrato em
// `rpc-contrato.test.ts`. O único valor datado abaixo está rotulado como tal.

/** Linha mínima do payload — só o que a AV toca. */
function linha(over: Partial<DreLinha> & { total: number }): DreLinha {
  return {
    t: 'tot',
    rotulo: 'x',
    estrela: false,
    meses: Array.from({ length: 12 }, () => 0),
    venc: 0,
    ...over,
  } as DreLinha
}

describe('baseAv — a base só serve se for POSITIVA', () => {
  it('aceita base positiva', () => {
    expect(baseAv(12_500_000)).toBe(12_500_000)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('rejeita %s', (_rotulo, v) => {
    expect(baseAv(v as number | null | undefined)).toBeNull()
  })

  it('rejeita zero e negativo — com base ≤ 0 a razão INVERTE de sinal e mente', () => {
    expect(baseAv(0)).toBeNull()
    expect(baseAv(-1)).toBeNull()
    expect(baseAv(-8_445_067.04)).toBeNull()
  })

  it('rejeita resíduo de float abaixo de meio centavo (não é receita, é ruído)', () => {
    expect(baseAv(0.004)).toBeNull()
    expect(baseAv(0.005)).toBe(0.005)
  })
})

describe('avPercentual — percentual com sinal algébrico preservado', () => {
  const BASE = baseAv(10_000_000)

  it('metade da base dá 50%', () => {
    expect(avPercentual(5_000_000, BASE)).toBe(50)
  })

  it('a própria base dá exatamente 100', () => {
    expect(avPercentual(10_000_000, BASE)).toBe(100)
  })

  it('despesa negativa devolve AV negativa — o sinal NÃO é normalizado', () => {
    expect(avPercentual(-2_500_000, BASE)).toBe(-25)
  })

  it('medição datada: LOP/Receita Bruta de 2025 em 24/08/2026 ≈ 6,5%', () => {
    // Rotulado como MEDIÇÃO, e não como invariante: se a estrutura mudar, este número
    // muda — e é o caso de contrato que vigia o dado vivo, não este teste.
    expect(fmtAv(avPercentual(816_672.95, baseAv(12_553_238.24)))).toBe('6,5%')
  })

  it('zero devolve 0, não travessão — "não compõe" ≠ "não dá para calcular"', () => {
    expect(avPercentual(0, BASE)).toBe(0)
  })

  it('sem base válida, qualquer valor vira null (a coluna inteira do período)', () => {
    expect(avPercentual(5_000_000, null)).toBeNull()
    expect(avPercentual(5_000_000, baseAv(0))).toBeNull()
    expect(avPercentual(5_000_000, baseAv(-5))).toBeNull()
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('valor %s vira null', (_rotulo, v) => {
    expect(avPercentual(v as number | null | undefined, BASE)).toBeNull()
  })

  it('NUNCA devolve NaN nem Infinity — varredura de combinações de borda', () => {
    const valores = [0, 1, -1, 1e12, -1e12, 0.004, Number.MAX_SAFE_INTEGER]
    const bases = [10_000_000, 0.005, 1e12]
    for (const b of bases) {
      for (const v of valores) {
        const r = avPercentual(v, baseAv(b))
        expect(r).not.toBeNull()
        expect(Number.isFinite(r as number), `v=${v} base=${b} → ${r}`).toBe(true)
      }
    }
  })
})

describe('aditividade — exata ANTES do arredondamento', () => {
  // A AV é uma divisão pela MESMA base, então ela herda a aditividade dos valores.
  // Isto é o que garante que a coluna AV conte a mesma história que a coluna de R$.
  const base = baseAv(10_000_000) as number

  it('a AV do total é a soma das AVs dos componentes', () => {
    const componentes = [1_200_000.11, -430_500.29, 88_000, -1_000_000.55, 12.34]
    const total = componentes.reduce((s, v) => s + v, 0)

    const somaDasAv = componentes.reduce((s, v) => s + (avPercentual(v, base) as number), 0)
    const avDoTotal = avPercentual(total, base) as number

    expect(avDoTotal).toBeCloseTo(somaDasAv, 10)
  })

  it('vale na cadeia inteira do demonstrativo, até o REX', () => {
    // Réplica da forma da cadeia real: REX = RAIR + DIST_LUCROS, RAIR = LL + INV + IMOB…
    const LL = 1_304_728.64, INV = -211_871.5, IMOB = -99_342.56, DIST = -745_080.04
    const RAIR = LL + INV + IMOB
    const REX = RAIR + DIST

    const av = (v: number) => avPercentual(v, base) as number
    expect(av(RAIR)).toBeCloseTo(av(LL) + av(INV) + av(IMOB), 10)
    expect(av(REX)).toBeCloseTo(av(RAIR) + av(DIST), 10)
  })

  it('a EXIBIÇÃO com 1 casa pode divergir — inerente, e não se maquia', () => {
    // Três componentes que somam exatamente o total, mas cada um arredonda para baixo:
    // 0,3 + 0,3 + 0,3 = 0,9 contra 1,0 do total. A diferença de 0,1 p.p. é o preço de
    // arredondar CADA linha — e arredondar cada linha é o que faz a linha estar certa
    // contra a base, que é o que o leitor confere.
    const b = baseAv(1000) as number
    const partes = [3.33, 3.33, 3.34]
    const total = partes.reduce((s, v) => s + v, 0)

    expect(avPercentual(total, b) as number)
      .toBeCloseTo(partes.reduce((s, v) => s + (avPercentual(v, b) as number), 0), 10)

    expect(partes.map(v => fmtAv(avPercentual(v, b)))).toEqual(['0,3%', '0,3%', '0,3%'])
    expect(fmtAv(avPercentual(total, b))).toBe('1,0%')
  })
})

// ── A BASE É A RECEITA BRUTA DE VENDAS, e ela é POSICIONAL no demonstrativo (v5.7.2) ──
describe('linhaBaseAv / indiceBaseAv — a base é a Receita Bruta, casada por CHAVE', () => {
  const payload: DreLinha[] = [
    linha({ chave: 'ENT_H', t: 'blocoH', rotulo: '(+) ENTRADA DE CLIENTES', total: 30_000_000 }),
    linha({ chave: 'PAG_H', t: 'blocoH', rotulo: '(-) PAGAMENTO AO FORNECEDOR', total: -26_000_000 }),
    linha({ chave: 'REPASSE', rotulo: '(=) SALDO REPASSE', total: 4_000_000 }),
    linha({ chave: 'RV', t: 'sub', rotulo: '(+) Receita de Vendas', total: 8_500_000 }),
    linha({ chave: 'RB_H', rotulo: '(=) RECEITA BRUTA DE VENDAS', total: 12_500_000 }),
    linha({ chave: 'IMP_H', t: 'blocoH', rotulo: '(-) IMPOSTOS', total: -2_500_000 }),
    linha({ chave: 'ROL', rotulo: '(=) RECEITA OPERACIONAL LÍQUIDA', total: 10_000_000 }),
  ]

  it('a chave da base é RB_H (mudou de ROL na v5.7.2)', () => {
    expect(CHAVE_BASE_AV).toBe('RB_H')
  })

  it('acha a linha da Receita Bruta', () => {
    expect(linhaBaseAv(payload)?.total).toBe(12_500_000)
  })

  it('acha mesmo com o rótulo mudado — o rótulo dela mudou na PRÓPRIA v5.7.1', () => {
    const renomeado = payload.map(l =>
      l.chave === 'RB_H' ? { ...l, rotulo: 'Receita Bruta (outro nome)' } : l)
    expect(linhaBaseAv(renomeado)?.chave).toBe(CHAVE_BASE_AV)
  })

  it('devolve undefined quando a base não veio (payload degradado)', () => {
    expect(linhaBaseAv(payload.filter(l => l.chave !== 'RB_H'))).toBeUndefined()
  })

  it('o ÍNDICE separa quem tem AV de quem não tem', () => {
    const i = indiceBaseAv(payload)
    expect(i).toBe(4)
    // Acima da base: Entrada de Clientes, Pagamento ao Fornecedor, Saldo Repasse,
    // Receita de Vendas — são as parcelas que FORMAM a base, não parte dela.
    expect(payload.slice(0, i).map(l => l.chave))
      .toEqual(['ENT_H', 'PAG_H', 'REPASSE', 'RV'])
    // A base e tudo abaixo dela têm AV.
    expect(payload.slice(i).map(l => l.chave)).toEqual(['RB_H', 'IMP_H', 'ROL'])
  })

  it('sem a base no payload devolve -1 — e aí NINGUÉM tem AV (fail-safe)', () => {
    expect(indiceBaseAv(payload.filter(l => l.chave !== 'RB_H'))).toBe(-1)
  })
})

describe('fmtAv — percentual em gramática contábil', () => {
  it.each<[number | null, string]>([
    [6.505, '6,5%'],
    [0, '0,0%'],
    [100, '100,0%'],
    [-0.9902, '(1,0%)'],
    [-21.0, '(21,0%)'],
    [-0.04, '(0,0%)'],
    [1234.56, '1.234,6%'],
    [null, '–'],
  ])('%s → %s', (pct, esperado) => {
    expect(fmtAv(pct)).toBe(esperado)
  })

  it('negativo NUNCA sai com sinal de menos — a convenção da tabela é parêntese', () => {
    expect(fmtAv(-12.3)).not.toContain('-')
    expect(fmtAv(-12.3)).not.toContain('−')
  })

  // O pior caso de LARGURA da coluna. Com a base na Receita Bruta as linhas exibidas ficam
  // quase todas abaixo de 100% (as que passavam disso eram justamente as de cima, que hoje
  // não têm AV) — mas o pior caso continua tendo de caber, porque um período ruim ainda
  // produz "(281,5%)". É por ele que `W_AV` é dimensionado em `tabela-dre.tsx`: coluna fixa
  // que não cabe CRESCE e desalinha o `right` cumulativo das vizinhas em silêncio.
  it('o pior caso cabe em 8 caracteres', () => {
    expect(fmtAv(-281.5)).toBe('(281,5%)')
    expect(fmtAv(-281.5)).toHaveLength(8)
  })
})
