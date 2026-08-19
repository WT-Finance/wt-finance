import { describe, it, expect } from 'vitest'
import { avPercentual, baseAv, fmtAv, linhaBaseAv, CHAVE_BASE_AV } from './av'
import type { DreLinha } from './schemas'

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

describe('baseAv — a ROL só serve de base se for POSITIVA', () => {
  it('aceita ROL positiva', () => {
    expect(baseAv(10_032_946.54)).toBe(10_032_946.54)
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

  it('rejeita zero e negativo — com ROL ≤ 0 a razão INVERTE de sinal e mente', () => {
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
  // Números REAIS de produção (2025, medidos por REST antes da migration).
  const ROL_2025 = baseAv(10_032_946.54)

  it('LOP de 2025 sobre a ROL ≈ 6,9%', () => {
    expect(avPercentual(692_722.91, ROL_2025)).toBeCloseTo(6.90448, 4)
    expect(fmtAv(avPercentual(692_722.91, ROL_2025))).toBe('6,9%')
  })

  it('LOP de 2025 DEPOIS da reestruturação ≈ 7,9% — o efeito do capex abaixo da linha', () => {
    // 692.722,91 + 99.342,56 (IMOB sai das despesas operacionais).
    expect(fmtAv(avPercentual(792_065.47, ROL_2025))).toBe('7,9%')
  })

  it('despesa negativa devolve AV negativa — o sinal NÃO é normalizado', () => {
    expect(avPercentual(-99_342.56, ROL_2025)).toBeCloseTo(-0.9902, 4)
  })

  it('a própria base dá exatamente 100', () => {
    expect(avPercentual(10_032_946.54, ROL_2025)).toBe(100)
  })

  it('linha ACIMA da ROL pode passar de 100% — e isso é informação, não erro', () => {
    // Entrada de Clientes é bruta; a ROL é líquida. Truncar esconderia a escala
    // da intermediação, que é o negócio.
    const av = avPercentual(30_000_000, ROL_2025)
    expect(av).not.toBeNull()
    expect(av as number).toBeGreaterThan(100)
  })

  it('zero devolve 0, não travessão — "não compõe" ≠ "não dá para calcular"', () => {
    expect(avPercentual(0, ROL_2025)).toBe(0)
  })

  it('sem base válida, qualquer valor vira null (a coluna inteira do período)', () => {
    expect(avPercentual(692_722.91, null)).toBeNull()
    expect(avPercentual(692_722.91, baseAv(0))).toBeNull()
    expect(avPercentual(692_722.91, baseAv(-5))).toBeNull()
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('valor %s vira null', (_rotulo, v) => {
    expect(avPercentual(v as number | null | undefined, ROL_2025)).toBeNull()
  })

  it('NUNCA devolve NaN nem Infinity — varredura de combinações de borda', () => {
    const valores = [0, 1, -1, 1e12, -1e12, 0.004, Number.MAX_SAFE_INTEGER]
    const bases = [10_032_946.54, 0.005, 1e12]
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
  const base = baseAv(10_032_946.54) as number

  it('a AV do total é a soma das AVs dos componentes', () => {
    const componentes = [1_200_000.11, -430_500.29, 88_000, -1_000_000.55, 12.34]
    const total = componentes.reduce((s, v) => s + v, 0)

    const somaDasAv = componentes.reduce((s, v) => s + (avPercentual(v, base) as number), 0)
    const avDoTotal = avPercentual(total, base) as number

    expect(avDoTotal).toBeCloseTo(somaDasAv, 10)
  })

  it('vale na cadeia inteira do demonstrativo, até o REX', () => {
    // Réplica da cadeia real: REX = RAIR + DIST_LUCROS, RAIR = LL + INV + IMOB…
    const LL = 1_304_728.64, INV = -211_871.5, IMOB = -99_342.56, DIST = -745_080.04
    const RAIR = LL + INV + IMOB
    const REX = RAIR + DIST

    const av = (v: number) => avPercentual(v, base) as number
    expect(av(RAIR)).toBeCloseTo(av(LL) + av(INV) + av(IMOB), 10)
    expect(av(REX)).toBeCloseTo(av(RAIR) + av(DIST), 10)
  })

  it('a EXIBIÇÃO com 1 casa pode divergir — inerente, e não se maquia', () => {
    // Três componentes que somam exatamente o total, mas cada um arredonda para
    // baixo: 0,3 + 0,3 + 0,3 = 0,9 contra 1,0 do total. A diferença de 0,1 p.p. é
    // o preço de arredondar CADA linha — e arredondar cada linha é o que faz a
    // linha estar certa contra a ROL, que é o que o leitor confere.
    const b = baseAv(1000) as number
    const partes = [3.33, 3.33, 3.34]
    const total = partes.reduce((s, v) => s + v, 0)

    // Pré-arredondamento fecha ao centésimo de p.p.
    expect(avPercentual(total, b) as number)
      .toBeCloseTo(partes.reduce((s, v) => s + (avPercentual(v, b) as number), 0), 10)

    // Exibido, não fecha — e o teste crava isso em vez de esconder.
    expect(partes.map(v => fmtAv(avPercentual(v, b)))).toEqual(['0,3%', '0,3%', '0,3%'])
    expect(fmtAv(avPercentual(total, b))).toBe('1,0%')
  })
})

describe('linhaBaseAv — casa por CHAVE, nunca por rótulo ou posição', () => {
  const payload: DreLinha[] = [
    linha({ chave: 'ENT_H', t: 'blocoH', rotulo: '(+) ENTRADA DE CLIENTES', total: 30_000_000 }),
    linha({ chave: 'ROL', rotulo: '(=) RECEITA OPERACIONAL LÍQUIDA', total: 10_032_946.54 }),
    linha({ chave: 'LOP', rotulo: '(=) LUCRO / PREJUÍZO OPERACIONAL', total: 692_722.91 }),
  ]

  it('acha a ROL', () => {
    expect(linhaBaseAv(payload)?.total).toBe(10_032_946.54)
  })

  it('acha mesmo com o rótulo mudado — o rótulo mudou na PRÓPRIA v5.7.0', () => {
    const renomeado = payload.map(l =>
      l.chave === 'ROL' ? { ...l, rotulo: 'Receita Líquida (novo nome)' } : l)
    expect(linhaBaseAv(renomeado)?.chave).toBe(CHAVE_BASE_AV)
  })

  it('devolve undefined quando a ROL não veio (payload degradado)', () => {
    expect(linhaBaseAv(payload.filter(l => l.chave !== 'ROL'))).toBeUndefined()
  })
})

describe('fmtAv — percentual em gramática contábil', () => {
  it.each<[number | null, string]>([
    [6.905, '6,9%'],
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

  // O pior caso de LARGURA da coluna: linha acima da ROL, negativa e na casa das
  // centenas. É por ele que `W_AV` é dimensionado em `tabela-dre.tsx` — a coluna fixa
  // NÃO pode crescer além da largura declarada, senão o `right` cumulativo das
  // vizinhas desalinha em silêncio.
  it('o pior caso cabe em 8 caracteres', () => {
    expect(fmtAv(-281.5)).toBe('(281,5%)')
    expect(fmtAv(-281.5)).toHaveLength(8)
  })
})
