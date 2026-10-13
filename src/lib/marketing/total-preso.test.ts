import { describe, it, expect } from 'vitest'
import { totalPreso, type GrupoAno } from './total-preso'

// Layout de referência (largura de bloco genérica de 132): Categoria 224 · cada ano expandido =
// 12 meses × 116 + bloco 132 = 1524.
//   2025: [224, 1748]   (bloco natural em [1616, 1748])
//   2026: [1748, 3272]  (bloco natural em [3140, 3272])
// O bloco real é "Total" 132 + "%" 84 = 216 — coberto no `describe` do fim do arquivo.
const CAT = 224
const G25: GrupoAno = { ano: 2025, inicio: 224, fim: 1748, larguraTotal: 132 }
const G26: GrupoAno = { ano: 2026, inicio: 1748, fim: 3272, larguraTotal: 132 }
const VIS = 1000

const preso = (scrollLeft: number, grupos: GrupoAno[], larguraVisivel = VIS, larguraEsquerda = CAT) =>
  totalPreso({ scrollLeft, larguraVisivel, larguraEsquerda, grupos })

describe('totalPreso', () => {
  it('nenhum grupo expandido → nada preso', () => {
    expect(preso(0, [])).toBeNull()
    expect(preso(500, [])).toBeNull()
  })

  it('borda direita dentro do grupo → prende; o total encosta na borda direita visível', () => {
    // R = 0 + 1000 = 1000, dentro de 2025. Total natural em [1616,1748] → presa em [868,1000].
    expect(preso(0, [G25])).toEqual({ ano: 2025, deslocamento: 868 - 1616 })
    // R = 1300: presa em [1168,1300] → desloca −448.
    expect(preso(300, [G25])).toEqual({ ano: 2025, deslocamento: 1168 - 1616 })
  })

  it('o total preso termina exatamente na borda direita (esquerda + largura = R)', () => {
    const r = preso(300, [G25])!
    expect(1616 + r.deslocamento + 132).toBe(300 + VIS)
  })

  it('solta no fim do grupo: em R = fim o deslocamento é nulo; depois, nada preso', () => {
    // R = 1748 → scrollLeft = 748. Posição natural: sem salto.
    expect(preso(748, [G25])).toBeNull()
    expect(preso(900, [G25])).toBeNull()
    // Um pixel antes: deslocamento −1 (contínuo).
    expect(preso(747, [G25])).toEqual({ ano: 2025, deslocamento: -1 })
  })

  it('grupo inteiro à direita da área visível (R ≤ início) não prende', () => {
    // R = 1000 e o grupo começa em 1748.
    expect(preso(0, [G26])).toBeNull()
    // R = início exato do grupo: ainda nada.
    expect(preso(748, [G26])).toBeNull()
  })

  it('grupo inteiro à esquerda (R ≥ fim) não prende', () => {
    expect(preso(2500, [G25])).toBeNull()
  })

  it('dois grupos: a troca é exata no fim do grupo e só UM prende por vez', () => {
    const g = [G25, G26]
    // Dentro de 2025.
    expect(preso(300, g)?.ano).toBe(2025)
    // R = 1748 (fim de 2025 = início de 2026): nenhum dos dois prende.
    expect(preso(748, g)).toBeNull()
    // R = 1749: prende 2026 — e fica TODO fora da área visível, à direita de R
    // (esquerda presa = início do grupo = 1748, não R − 132 = 1617, que cobriria o total de 2025).
    const r = preso(749, g)!
    expect(r.ano).toBe(2026)
    expect(3140 + r.deslocamento).toBe(1748)
    // O total de 2026 só encosta de fato na borda quando cabe dentro do próprio grupo (R ≥ 1748+132).
    const r2 = preso(1000, g)! // R = 2000
    expect(r2).toEqual({ ano: 2026, deslocamento: 1868 - 3140 })
    expect(3140 + r2.deslocamento + 132).toBe(2000)
  })

  it('varrendo toda a rolagem nunca há mais de um grupo preso e o deslocamento é contínuo', () => {
    const g = [G25, G26]
    let anterior: Record<number, number> = { 2025: 0, 2026: 0 }
    for (let sl = 0; sl <= 2300; sl++) {
      const r = preso(sl, g)
      const atual: Record<number, number> = { 2025: 0, 2026: 0 }
      if (r) atual[r.ano] = r.deslocamento
      // continuidade: a posição esquerda de cada total não se move mais que 1px por 1px de rolagem
      // na rolagem natural, exceto na entrada do grupo (onde a coluna presa está fora da área visível).
      for (const ano of [2025, 2026]) {
        if (anterior[ano] !== 0 && atual[ano] !== 0) expect(Math.abs(atual[ano] - anterior[ano])).toBeLessThanOrEqual(1)
      }
      anterior = atual
    }
  })

  it('anos intercalados com recolhido: só os expandidos entram na lista; o recolhido é ignorado', () => {
    // 2025 recolhido (1 coluna de 132) entre 2024 e 2026 expandidos. Lista só com os expandidos.
    const g24: GrupoAno = { ano: 2024, inicio: 224, fim: 1748, larguraTotal: 132 }
    const g26: GrupoAno = { ano: 2026, inicio: 1880, fim: 3404, larguraTotal: 132 }
    // R = 1800: dentro do recolhido [1748,1880] → nada preso.
    expect(preso(800, [g24, g26])).toBeNull()
  })

  it('área visível estreita: sem espaço além da Categoria não prende; com pouco espaço prende (a esquerda vence por z-index)', () => {
    expect(preso(0, [G25], CAT)).toBeNull()
    expect(preso(0, [G25], 100)).toBeNull()
    // Área útil de 50px: o total (132) é mais largo que ela — ainda desloca até a borda; a cobertura
    // pela "Categoria" é do z-index, não da matemática.
    expect(preso(500, [G25], CAT + 50)).toEqual({ ano: 2025, deslocamento: (500 + CAT + 50 - 132) - 1616 })
  })
})

describe('totalPreso — bloco "Total + %" (largura = Total 132 + % 84 = 216)', () => {
  const BLOCO = 132 + 84
  // 12 meses × 116 = 1392 + bloco 216 = 1608.  2025: [224, 1832] · 2026: [1832, 3440].
  const B25: GrupoAno = { ano: 2025, inicio: 224, fim: 224 + 1392 + BLOCO, larguraTotal: BLOCO }
  const B26: GrupoAno = { ano: 2026, inicio: B25.fim, fim: B25.fim + 1392 + BLOCO, larguraTotal: BLOCO }

  it('o bloco inteiro (Total + %) termina exatamente na borda direita visível', () => {
    const r = preso(300, [B25])! // R = 1300
    const esquerdaNatural = B25.fim - BLOCO
    expect(esquerdaNatural).toBe(1616)
    expect(esquerdaNatural + r.deslocamento + BLOCO).toBe(300 + VIS)
  })

  it('a "%" (última coluna do bloco) acompanha o "Total": mesmo deslocamento, a "%" fica na borda', () => {
    const r = preso(300, [B25])!
    // Total natural [1616, 1748], "%" natural [1748, 1832]; ambos recebem o MESMO deslocamento.
    expect(1748 + r.deslocamento + 84).toBe(300 + VIS)
    expect(1616 + r.deslocamento + 132).toBe(1748 + r.deslocamento) // continuam colados
  })

  it('solta exatamente no fim do grupo (R = 1832): sem salto, nada preso depois', () => {
    expect(preso(1832 - VIS, [B25])).toBeNull()
    expect(preso(1832 - VIS - 1, [B25])).toEqual({ ano: 2025, deslocamento: -1 })
    expect(preso(1100, [B25])).toBeNull()
  })

  it('troca de ano: o bloco de 2026 entra fora da área visível (esquerda presa = início do grupo)', () => {
    const r = preso(1832 - VIS + 1, [B25, B26])! // R = 1833
    expect(r.ano).toBe(2026)
    expect(B26.fim - BLOCO + r.deslocamento).toBe(B26.inicio)
    // Já com folga dentro do próprio grupo, o bloco encosta na borda direita.
    const r2 = preso(1200, [B25, B26])! // R = 2200 ≥ 1832 + 216 = 2048
    expect(r2.ano).toBe(2026)
    expect(B26.fim - BLOCO + r2.deslocamento + BLOCO).toBe(2200)
  })
})
