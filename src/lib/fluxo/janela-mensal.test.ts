import { describe, it, expect } from 'vitest'
import {
  LIMITE_MESES_FLUXO,
  indiceMesHoje,
  limitesJanelaMensal,
  fatiarJanelaMensal,
} from './janela-mensal'

/** Série de meses consecutivos a partir de `inicio` ('YYYY-MM'), com um valor por mês. */
function serie(inicio: string, n: number) {
  const [y0, m0] = inicio.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const y = y0 + Math.floor((m0 - 1 + i) / 12)
    const m = ((m0 - 1 + i) % 12) + 1
    return { mes: `${y}-${String(m).padStart(2, '0')}`, valor: i }
  })
}

/** A janela que a migration 0229 busca: 36 atrás + mês atual + 36 à frente. */
const JANELA_LARGA = serie('2023-08', 73)
const HOJE = '2026-08' // o mês central da série acima

describe('indiceMesHoje', () => {
  it('acha o mês exato', () => {
    expect(indiceMesHoje(JANELA_LARGA, HOJE)).toBe(36)
    expect(indiceMesHoje(JANELA_LARGA, '2023-08')).toBe(0)
    expect(indiceMesHoje(JANELA_LARGA, '2029-08')).toBe(72)
  })

  it('faltando o mês exato, cai no último mês ANTERIOR a ele', () => {
    const comLacuna = [{ mes: '2026-06' }, { mes: '2026-07' }, { mes: '2026-09' }]
    expect(indiceMesHoje(comLacuna, '2026-08')).toBe(1) // 2026-07
  })

  it('série que começa depois do mês corrente devolve 0, não −1', () => {
    expect(indiceMesHoje(serie('2027-01', 5), '2026-08')).toBe(0)
  })

  it('série vazia devolve −1 sem lançar', () => {
    expect(indiceMesHoje([], HOJE)).toBe(-1)
  })

  it('a comparação lexicográfica de YYYY-MM respeita a virada de ano', () => {
    const s = [{ mes: '2025-11' }, { mes: '2025-12' }, { mes: '2026-01' }, { mes: '2026-02' }]
    expect(indiceMesHoje(s, '2026-01')).toBe(2)
    expect(indiceMesHoje(s, '2025-12')).toBe(1)
  })
})

describe('limitesJanelaMensal', () => {
  it('a janela larga da 0229 rende exatamente 36 para cada lado', () => {
    expect(limitesJanelaMensal(JANELA_LARGA, HOJE)).toEqual({ maxAtras: 36, maxFrente: 36 })
    expect(LIMITE_MESES_FLUXO).toBe(36)
  })

  it('série curta limita pelo que existe, não pelo teto', () => {
    // 'hoje' no índice 5 de uma série de 10 → 5 atrás, 4 à frente.
    expect(limitesJanelaMensal(serie('2026-03', 10), HOJE)).toEqual({ maxAtras: 5, maxFrente: 4 })
  })

  it('o teto de 36 vale mesmo se a série for maior', () => {
    const enorme = serie('2016-08', 241) // 'hoje' no meio, 120 de cada lado
    expect(limitesJanelaMensal(enorme, HOJE)).toEqual({ maxAtras: 36, maxFrente: 36 })
  })

  it('série vazia não devolve limite negativo', () => {
    expect(limitesJanelaMensal([], HOJE)).toEqual({ maxAtras: 0, maxFrente: 0 })
  })
})

describe('fatiarJanelaMensal', () => {
  it('devolve atras + 1 + frente meses e marca o hoje', () => {
    const j = fatiarJanelaMensal(JANELA_LARGA, HOJE, 24, 18)
    expect(j.pontos).toHaveLength(43)
    expect(j.pontos[0].mes).toBe('2024-08')
    expect(j.pontos[j.pontos.length - 1].mes).toBe('2028-02')
    expect(j.mesHoje).toBe(HOJE)
  })

  it('o extremo 36+36 devolve a série inteira que a 0229 busca', () => {
    const j = fatiarJanelaMensal(JANELA_LARGA, HOJE, 36, 36)
    expect(j.pontos).toHaveLength(73)
    expect(j.pontos[0].mes).toBe('2023-08')
    expect(j.pontos[72].mes).toBe('2029-08')
  })

  it('janela mínima mostra só o mês corrente', () => {
    const j = fatiarJanelaMensal(JANELA_LARGA, HOJE, 0, 0)
    expect(j.pontos).toHaveLength(1)
    expect(j.pontos[0].mes).toBe(HOJE)
  })

  it('NÃO altera nenhum valor — recortar é só recortar (nada rebaseia)', () => {
    // O contraste com Weddings: lá o acumulado é rebaseado na borda; aqui o valor
    // de cada mês é do próprio mês e tem de sobreviver idêntico a qualquer recorte.
    for (const [a, f] of [[36, 36], [24, 18], [6, 6], [0, 0]]) {
      const j = fatiarJanelaMensal(JANELA_LARGA, HOJE, a, f)
      for (const p of j.pontos) {
        expect(p.valor).toBe(JANELA_LARGA.find(o => o.mes === p.mes)!.valor)
      }
    }
  })

  it('clampa pedido além dos limites em vez de estourar', () => {
    const j = fatiarJanelaMensal(JANELA_LARGA, HOJE, 999, 999)
    expect(j.pontos).toHaveLength(73)
  })

  it('clampa pedido negativo e NaN', () => {
    expect(fatiarJanelaMensal(JANELA_LARGA, HOJE, -5, -5).pontos).toHaveLength(1)
    const j = fatiarJanelaMensal(JANELA_LARGA, HOJE, NaN, NaN)
    expect(j.pontos.length).toBeGreaterThan(0)
    expect(j.pontos.every(p => typeof p.mes === 'string')).toBe(true)
  })

  it('série vazia devolve janela vazia sem lançar', () => {
    const j = fatiarJanelaMensal([], HOJE, 24, 18)
    expect(j.pontos).toEqual([])
    expect(j.mesHoje).toBeNull()
  })

  it('mesHoje fica null quando o mês corrente sai da janela recortada', () => {
    // Série que termina antes do mês corrente: o "hoje" cai no último índice, então
    // ele está sempre visível — mas com a série começando depois, idx=0 e frente=0
    // ainda mostra o primeiro mês.
    const passado = serie('2024-01', 6) // termina em 2024-06, antes de HOJE
    const j = fatiarJanelaMensal(passado, HOJE, 2, 0)
    expect(j.pontos[j.pontos.length - 1].mes).toBe('2024-06')
    expect(j.mesHoje).toBe('2024-06') // o índice-âncora é o último mês anterior a hoje
  })
})
