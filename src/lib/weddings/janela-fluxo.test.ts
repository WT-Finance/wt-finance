import { describe, it, expect } from 'vitest'
import {
  type MesAcumulado,
  LIMITE_MESES,
  JANELA_LARGA_ATRAS,
  JANELA_LARGA_FRENTE,
  indiceHoje,
  limitesJanela,
  fatiarJanela,
} from './janela-fluxo'

/**
 * Série sintética: `atras` meses passados + o mês corrente + `frente` futuros.
 * Entradas somam 10/mês e saídas 4/mês, então o acumulado é previsível de cabeça
 * e qualquer erro de rebase aparece como um offset inteiro.
 */
function serie(atras: number, frente: number): MesAcumulado[] {
  const out: MesAcumulado[] = []
  const total = atras + 1 + frente
  for (let i = 0; i < total; i++) {
    out.push({
      // Meses ESTRITAMENTE crescentes e únicos: com a chave repetindo a cada 12
      // meses, um `find` por `mes` casaria com o mês errado e mascararia bug.
      mes:          `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`,
      eh_futuro:    i >= atras,
      entrada_acum: (i + 1) * 10,
      saida_acum:   (i + 1) * 4,
    })
  }
  return out
}

describe('indiceHoje', () => {
  it('acha o primeiro mês futuro (o mês corrente)', () => {
    expect(indiceHoje(serie(24, 18))).toBe(24)
  })

  it('devolve −1 quando a série não tem mês corrente/futuro', () => {
    const passado = serie(5, 0).map(m => ({ ...m, eh_futuro: false }))
    expect(indiceHoje(passado)).toBe(-1)
    expect(indiceHoje([])).toBe(-1)
  })
})

describe('limitesJanela', () => {
  it('reserva 1 mês de margem à esquerda', () => {
    // 48 passados → a borda pode ir a 47, nunca ao primeiro mês buscado.
    expect(limitesJanela(serie(48, 36))).toEqual({ maxAtras: 47, maxFrente: 36 })
  })

  it('não devolve limite negativo em série degenerada', () => {
    expect(limitesJanela([]).maxAtras).toBe(0)
    expect(limitesJanela(serie(0, 0))).toEqual({ maxAtras: 0, maxFrente: 0 })
  })

  it('a janela larga produz EXATAMENTE o limite de 36 meses pedido pelo Yan', () => {
    // Decisão de produto: 36 para trás e 36 para frente. O lado do passado busca
    // um mês a mais só para servir de margem do rebase — ele NÃO é alcançável
    // pelo slider. Se alguém mexer nas constantes, é aqui que quebra.
    const s = serie(JANELA_LARGA_ATRAS, JANELA_LARGA_FRENTE)
    expect(limitesJanela(s)).toEqual({ maxAtras: LIMITE_MESES, maxFrente: LIMITE_MESES })
    expect(JANELA_LARGA_ATRAS).toBe(LIMITE_MESES + 1)
  })

  it('o extremo do slider ainda tem mês anterior para rebasear', () => {
    const s = serie(JANELA_LARGA_ATRAS, JANELA_LARGA_FRENTE)
    const j = fatiarJanela(s, LIMITE_MESES, LIMITE_MESES)
    expect(j.pontos).toHaveLength(LIMITE_MESES * 2 + 1)
    expect(j.pontos[0].entrada_acum).toBe(10)  // rebaseado, não 10 × (índice+1)
    expect(j.pontos[0].entrada_mes).toBe(10)   // derivado do mês anterior real
  })
})

describe('fatiarJanela — recorte', () => {
  const s = serie(48, 36)

  it('devolve exatamente atras + 1 + frente meses', () => {
    expect(fatiarJanela(s, 24, 18).pontos).toHaveLength(43)
    expect(fatiarJanela(s, 0, 0).pontos).toHaveLength(1)
    expect(fatiarJanela(s, 6, 6).pontos).toHaveLength(13)
  })

  it('a janela contém o mês corrente e o marca', () => {
    const j = fatiarJanela(s, 12, 12)
    expect(j.mesHoje).toBe(s[48].mes)
    expect(j.pontos.find(p => p.mes === j.mesHoje)?.eh_futuro).toBe(true)
  })

  it('clampa pedidos além dos limites em vez de estourar', () => {
    const j = fatiarJanela(s, 999, 999)
    expect(j.pontos).toHaveLength(47 + 1 + 36)
    expect(j.pontos[0].mes).toBe(s[1].mes) // nunca o índice 0
  })

  it('clampa pedido negativo', () => {
    expect(fatiarJanela(s, -5, -5).pontos).toHaveLength(1)
  })
})

describe('fatiarJanela — o acumulado REINICIA na borda esquerda', () => {
  const s = serie(48, 36)

  it('o primeiro mês visível traz só o próprio valor, não a história anterior', () => {
    const j = fatiarJanela(s, 24, 18)
    // Entradas somam 10/mês: o 1º mês visível acumula 10, não 250.
    expect(j.pontos[0].entrada_acum).toBe(10)
    expect(j.pontos[0].saida_acum).toBe(4)
  })

  it('o reinício vale para QUALQUER largura de janela (não só a default)', () => {
    for (const atras of [0, 1, 5, 24, 47]) {
      const j = fatiarJanela(s, atras, 3)
      expect(j.pontos[0].entrada_acum).toBe(10)
      expect(j.pontos[0].saida_acum).toBe(4)
    }
  })

  it('todos os elementos acumulados reiniciam JUNTOS — nenhum sobra acumulando', () => {
    const j = fatiarJanela(s, 10, 5)
    const n = j.pontos.length
    // Acumulado linear: no k-ésimo mês visível, entradas = 10k e saídas = 4k.
    j.pontos.forEach((p, k) => {
      expect(p.entrada_acum).toBe(10 * (k + 1))
      expect(p.saida_acum).toBe(4 * (k + 1))
    })
    expect(j.pontos[n - 1].entrada_acum).toBe(10 * n)
  })

  it('o acumulado rebaseado nunca começa negativo numa série monotônica', () => {
    const j = fatiarJanela(s, 47, 36)
    expect(j.pontos.every(p => p.entrada_acum >= 0 && p.saida_acum >= 0)).toBe(true)
  })
})

describe('fatiarJanela — valor mensal derivado', () => {
  const s = serie(48, 36)

  it('deriva o valor do mês pela diferença dos acumulados', () => {
    const j = fatiarJanela(s, 24, 18)
    expect(j.pontos.every(p => p.entrada_mes === 10)).toBe(true)
    expect(j.pontos.every(p => p.saida_mes === 4)).toBe(true)
    expect(j.pontos.every(p => p.resultado_mes === 6)).toBe(true)
  })

  it('a PRIMEIRA barra visível não absorve a história anterior (o defeito antigo)', () => {
    // O gráfico mensal antigo usava prev={0,0} no índice 0: a 1ª barra viria 250,
    // não 10. A margem de 1 mês é justamente o que evita isso.
    const j = fatiarJanela(s, 24, 18)
    expect(j.pontos[0].entrada_mes).toBe(10)
    expect(j.pontos[0].entrada_mes).not.toBe(j.pontos[0].entrada_acum * 25)
  })

  it('mês sem movimento dá zero, não buraco', () => {
    const plana = serie(6, 2).map((m, i) =>
      i === 4 ? { ...m, entrada_acum: serie(6, 2)[3].entrada_acum, saida_acum: serie(6, 2)[3].saida_acum } : m,
    )
    const j = fatiarJanela(plana, 3, 1)
    const ponto = j.pontos.find(p => p.mes === plana[4].mes)!
    expect(ponto.entrada_mes).toBe(0)
    expect(ponto.saida_mes).toBe(0)
  })

  it('resultado mensal negativo é preservado (saída maior que entrada)', () => {
    const s2 = serie(6, 2).map((m, i) => ({ ...m, saida_acum: (i + 1) * 25 }))
    const j = fatiarJanela(s2, 3, 1)
    expect(j.pontos.every(p => p.resultado_mes === 10 - 25)).toBe(true)
  })
})

describe('fatiarJanela — referência de saídas recalculada NA JANELA', () => {
  const s = serie(48, 36)

  it('é a soma das saídas da janela, não da série inteira', () => {
    const j = fatiarJanela(s, 24, 18)
    expect(j.totalSaidasJanela).toBe(4 * 43) // 43 meses visíveis × 4
    // A série inteira somaria 4 × 85 = 340 — sair de escala é exatamente o que
    // achataria o gráfico com o acumulado reiniciando.
    expect(j.totalSaidasJanela).not.toBe(4 * 85)
  })

  it('acompanha a janela ao arrastar o slider', () => {
    expect(fatiarJanela(s, 6, 6).totalSaidasJanela).toBe(4 * 13)
    expect(fatiarJanela(s, 0, 0).totalSaidasJanela).toBe(4 * 1)
    expect(fatiarJanela(s, 47, 36).totalSaidasJanela).toBe(4 * 84)
  })

  it('coincide com o acumulado de saídas do último mês visível', () => {
    // O invariante que amarra referência e acumulado: se um for rebaseado sem o
    // outro, esta igualdade quebra.
    for (const [a, f] of [[3, 3], [24, 18], [47, 36], [0, 12]]) {
      const j = fatiarJanela(s, a, f)
      expect(j.totalSaidasJanela).toBe(j.pontos[j.pontos.length - 1].saida_acum)
    }
  })
})

describe('fatiarJanela — degenerados nunca lançam', () => {
  it('série vazia devolve janela vazia', () => {
    const j = fatiarJanela([], 24, 18)
    expect(j.pontos).toEqual([])
    expect(j.totalSaidasJanela).toBe(0)
    expect(j.mesHoje).toBeNull()
  })

  it('série de um mês só devolve janela vazia (sem mês de margem)', () => {
    expect(fatiarJanela(serie(0, 0), 0, 0).pontos).toEqual([])
  })

  it('série sem mês futuro devolve janela vazia', () => {
    const passado = serie(10, 0).map(m => ({ ...m, eh_futuro: false }))
    expect(fatiarJanela(passado, 5, 0).pontos).toEqual([])
  })

  it('NaN nos parâmetros do slider não vira janela quebrada', () => {
    const j = fatiarJanela(serie(48, 36), NaN, NaN)
    expect(j.pontos.length).toBeGreaterThan(0)
    expect(j.pontos.every(p => Number.isFinite(p.entrada_acum))).toBe(true)
  })
})
