import { describe, it, expect } from 'vitest'
import {
  DIAS_POR_MES,
  DURACAO_CURTA_MESES,
  duracaoDias,
  duracaoMeses,
  duracaoMesesExibida,
  margemAnualizada,
  ehDuracaoCurta,
  fmtPct1,
} from './margem-anualizada'

/** Dias correspondentes a N meses exatos, para exercitar a fórmula sem ruído de calendário. */
const diasDe = (meses: number) => meses * DIAS_POR_MES

describe('duracaoDias', () => {
  it('conta os dias entre a assinatura do contrato e o evento', () => {
    expect(duracaoDias('2024-01-01', '2024-12-31')).toBe(365)
    expect(duracaoDias('2025-03-10', '2025-03-10')).toBe(0)
  })

  it('não depende do fuso do runtime (aritmética em UTC)', () => {
    // A borda que morde com `new Date('YYYY-MM-DD')` interpretado como local.
    expect(duracaoDias('2024-03-01', '2024-04-01')).toBe(31)
    expect(duracaoDias('2024-10-20', '2024-11-20')).toBe(31)
  })

  it('devolve null quando falta uma das datas', () => {
    expect(duracaoDias(null, '2025-01-01')).toBeNull()
    expect(duracaoDias('2025-01-01', null)).toBeNull()
    expect(duracaoDias(undefined, undefined)).toBeNull()
    expect(duracaoDias('', '2025-01-01')).toBeNull()
  })

  it('devolve null para duração negativa (evento antes do contrato = dado inconsistente)', () => {
    expect(duracaoDias('2025-06-01', '2025-01-01')).toBeNull()
  })

  it('devolve null para data malformada em vez de NaN', () => {
    expect(duracaoDias('nao-e-data', '2025-01-01')).toBeNull()
    expect(duracaoDias('2025-01-01', '2025-13')).toBeNull()
  })
})

describe('duracaoMeses / duracaoMesesExibida', () => {
  it('converte por 30,44 dias/mês', () => {
    expect(duracaoMeses(diasDe(12))).toBeCloseTo(12, 10)
    expect(duracaoMeses(365)).toBeCloseTo(365 / 30.44, 10)
  })

  it('a versão exibida arredonda para 1 casa', () => {
    expect(duracaoMesesExibida(925)).toBe(30.4) // 925 / 30,44 = 30,387…
    expect(duracaoMesesExibida(0)).toBe(0)
  })

  it('propaga null', () => {
    expect(duracaoMeses(null)).toBeNull()
    expect(duracaoMesesExibida(null)).toBeNull()
  })
})

describe('margemAnualizada — anualização LINEAR', () => {
  it('duração de exatamente 12 meses devolve a própria margem', () => {
    // A identidade que define "linear": margem × 12 / 12 = margem.
    expect(margemAnualizada(17.5, diasDe(12))).toBeCloseTo(17.5, 6)
  })

  it('dobra quando a operação ocupa metade do tempo', () => {
    expect(margemAnualizada(17.5, diasDe(6))).toBeCloseTo(35, 6)
  })

  it('reduz quando a operação ocupa mais de um ano', () => {
    // O caso do briefing: 17,5% em 30,4 meses vale 6,9% a.a., não 17,5%.
    expect(margemAnualizada(17.5, 925)).toBeCloseTo(6.9107, 3)
  })

  it('NÃO é composta', () => {
    // Composta daria (1,175)² − 1 = 38,06% para 6 meses; a linear dá 35%.
    const linear = margemAnualizada(17.5, diasDe(6))!
    const composta = ((1 + 0.175) ** 2 - 1) * 100
    expect(linear).toBeCloseTo(35, 6)
    expect(Math.abs(linear - composta)).toBeGreaterThan(3)
  })

  it('preserva o sinal da margem negativa', () => {
    expect(margemAnualizada(-10, diasDe(24))).toBeCloseTo(-5, 6)
    expect(margemAnualizada(-32.5, diasDe(3.9))).toBeCloseTo(-100, 4)
  })

  it('margem zero anualiza para zero, não para null', () => {
    expect(margemAnualizada(0, diasDe(10))).toBe(0)
  })

  it('exibe o ciclo curto CRU, sem cap (3,9 meses a 32,5% ⇒ 100% a.a.)', () => {
    expect(margemAnualizada(32.5, diasDe(3.9))).toBeCloseTo(100, 4)
  })

  // ── Fronteiras: nunca Infinity, nunca NaN ─────────────────────────────────
  it('duração zero devolve null (não Infinity)', () => {
    expect(margemAnualizada(17.5, 0)).toBeNull()
  })

  it('duração nula devolve null', () => {
    expect(margemAnualizada(17.5, null)).toBeNull()
  })

  it('margem ausente devolve null', () => {
    expect(margemAnualizada(null, diasDe(12))).toBeNull()
    expect(margemAnualizada(undefined, diasDe(12))).toBeNull()
  })

  it('entrada não-finita devolve null', () => {
    expect(margemAnualizada(NaN, diasDe(12))).toBeNull()
    expect(margemAnualizada(Infinity, diasDe(12))).toBeNull()
  })

  it('nenhuma combinação de fronteira produz Infinity ou NaN', () => {
    const margens = [null, undefined, NaN, Infinity, -Infinity, 0, 17.5, -17.5, 1e9]
    const duracoes = [null, 0, 1, 925, 1e9]
    for (const m of margens) {
      for (const d of duracoes) {
        const r = margemAnualizada(m as number | null, d)
        if (r !== null) {
          expect(Number.isFinite(r)).toBe(true)
        }
      }
    }
  })
})

describe('ehDuracaoCurta', () => {
  it(`sinaliza abaixo de ${DURACAO_CURTA_MESES} meses`, () => {
    expect(ehDuracaoCurta(diasDe(3.9))).toBe(true)
    expect(ehDuracaoCurta(diasDe(5.9))).toBe(true)
  })

  it('não sinaliza no limiar nem acima', () => {
    expect(ehDuracaoCurta(diasDe(6))).toBe(false)
    expect(ehDuracaoCurta(diasDe(30))).toBe(false)
  })

  it('não sinaliza o que não tem duração anualizável', () => {
    expect(ehDuracaoCurta(null)).toBe(false)
    expect(ehDuracaoCurta(0)).toBe(false)
  })
})

describe('fmtPct1', () => {
  it('formata em pt-BR com vírgula e 1 casa', () => {
    expect(fmtPct1(6.9)).toBe('6,9%')
    expect(fmtPct1(100)).toBe('100,0%')
    expect(fmtPct1(-12.44)).toBe('-12,4%')
  })
})
