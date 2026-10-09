import { describe, it, expect } from 'vitest'
import { coresDosAnos } from './cores'
import {
  barrasProporcao, escalaProporcao, type LeituraProporcao,
} from './proporcao'

const ok = (ano: number, pct: number | null, extra: Partial<{ parcial: boolean; mesesCobertos: number }> = {}): LeituraProporcao => ({
  ano,
  proporcao: {
    ok: true,
    dados: {
      ano,
      mesesCobertos: extra.mesesCobertos ?? (pct === null ? 0 : 12),
      parcial: extra.parcial ?? false,
      coberturaAte: '2026-10-31',
      pct,
    },
  },
})
const falha = (ano: number): LeituraProporcao => ({ ano, proporcao: { ok: false } })

// Os valores medidos em produção (09/10): 2024 −6,22 · 2025 −5,00 · 2026 −6,76 (10 meses, parcial).
const REAIS = [
  ok(2024, -6.22),
  ok(2025, -5.0),
  ok(2026, -6.76, { parcial: true, mesesCobertos: 10 }),
]

describe('barrasProporcao — ordem, cor e rótulo', () => {
  it('uma barra por ano, em ordem crescente (o mais antigo à esquerda), mesmo com a entrada embaralhada', () => {
    const { barras, anosFalha } = barrasProporcao([2026, 2024, 2025], [REAIS[2], REAIS[0], REAIS[1]])
    expect(barras.map(b => b.ano)).toEqual([2024, 2025, 2026])
    expect(anosFalha).toEqual([])
  })

  it('as cores são as do gráfico "Despesas mensais" (coresDosAnos): o ano mais recente na principal', () => {
    const { barras } = barrasProporcao([2024, 2025, 2026], REAIS)
    expect(barras.map(b => b.cor)).toEqual(coresDosAnos([2024, 2025, 2026]))
    expect(barras[2].cor).toBe('var(--action-primary)')
  })

  it('o valor é o da RPC, sem refazer a conta: o sinal da DRE (negativo) atravessa intacto', () => {
    const { barras } = barrasProporcao([2024, 2025, 2026], REAIS)
    expect(barras.map(b => b.pct)).toEqual([-6.22, -5.0, -6.76])
  })

  it('o rótulo do % segue o formato da DRE: 1 casa, negativo entre parênteses, vírgula', () => {
    const { barras } = barrasProporcao([2024, 2025, 2026], REAIS)
    expect(barras.map(b => b.rotuloPct)).toEqual(['(6,2%)', '(5,0%)', '(6,8%)'])
  })

  it('ano fechado: rótulo só com o número do ano', () => {
    const { barras } = barrasProporcao([2025], [REAIS[1]])
    expect(barras[0]).toMatchObject({ rotuloEixo: '2025', rotuloTooltip: '2025', parcial: false })
  })

  it('ano parcial: o eixo é só "2026*" (sem "· 10 meses"); o tooltip mantém os meses, sem asterisco', () => {
    const { barras } = barrasProporcao([2026], [REAIS[2]])
    expect(barras[0]).toMatchObject({
      rotuloEixo: '2026*',
      rotuloTooltip: '2026 · 10 meses',
      parcial: true,
      mesesCobertos: 10,
    })
  })

  it('um mês só: singular no tooltip; o eixo segue "2026*"', () => {
    const { barras } = barrasProporcao([2026], [ok(2026, -3.1, { parcial: true, mesesCobertos: 1 })])
    expect(barras[0].rotuloEixo).toBe('2026*')
    expect(barras[0].rotuloTooltip).toBe('2026 · 1 mês')
  })
})

describe('barrasProporcao — sem ponto e falha', () => {
  it('pct null: sem valor de barra e "—" (travessão cheio, não o en-dash do fmtAv)', () => {
    const { barras } = barrasProporcao([2024, 2025], [ok(2024, null), REAIS[1]])
    expect(barras[0].pct).toBeNull()
    expect(barras[0].rotuloPct).toBe('—')
    expect(barras[0].rotuloEixo).toBe('2024 · —')
    expect(barras[1].pct).toBe(-5)
  })

  it('zero é valor real: NÃO vira "—"', () => {
    const { barras } = barrasProporcao([2025], [ok(2025, 0)])
    expect(barras[0].pct).toBe(0)
    expect(barras[0].rotuloPct).toBe('0,0%')
  })

  it('leitura que falhou sai das barras e vai para anosFalha; os outros anos seguem', () => {
    const { barras, anosFalha } = barrasProporcao([2024, 2025, 2026], [REAIS[0], falha(2025), REAIS[2]])
    expect(barras.map(b => b.ano)).toEqual([2024, 2026])
    expect(anosFalha).toEqual([2025])
  })

  it('a cor de um ano não muda por causa da falha de outro (posição entre TODOS os selecionados)', () => {
    const todos = barrasProporcao([2024, 2025, 2026], REAIS).barras
    const comFalha = barrasProporcao([2024, 2025, 2026], [REAIS[0], falha(2025), REAIS[2]]).barras
    expect(comFalha.find(b => b.ano === 2026)?.cor).toBe(todos.find(b => b.ano === 2026)?.cor)
    expect(comFalha.find(b => b.ano === 2024)?.cor).toBe(todos.find(b => b.ano === 2024)?.cor)
  })

  it('ano selecionado sem leitura nenhuma conta como falha; todas falhando = nenhuma barra', () => {
    const r = barrasProporcao([2025, 2026], [])
    expect(r.barras).toEqual([])
    expect(r.anosFalha).toEqual([2025, 2026])
  })
})

describe('escalaProporcao — eixo percentual com o zero e os valores', () => {
  it('valores medidos: domínio de −8 a 0, ticks redondos com o zero, sem casas decimais', () => {
    const e = escalaProporcao([-6.22, -5.0, -6.76])
    expect(e.domain).toEqual([-8, 0])
    expect(e.ticks).toEqual([-8, -6, -4, -2, 0])
    expect(e.casas).toBe(0)
  })

  it('o domínio CONTÉM o zero e todos os valores; os ticks cobrem o domínio inteiro', () => {
    for (const s of [[-6.76], [-0.3, -0.1], [-12.5, -3], [-5, 2], [2.4, 1]]) {
      const e = escalaProporcao(s)
      expect(e.ticks).toContain(0)
      expect(e.ticks[0]).toBe(e.domain[0])
      expect(e.ticks[e.ticks.length - 1]).toBe(e.domain[1])
      expect(e.domain[0]).toBeLessThanOrEqual(Math.min(0, ...s))
      expect(e.domain[1]).toBeGreaterThanOrEqual(Math.max(0, ...s))
    }
  })

  it('valor em cima da borda: ganha um passo de folga para o rótulo não sair do gráfico', () => {
    const e = escalaProporcao([-8])
    expect(e.domain).toEqual([-10, 0])
    expect(e.ticks).toEqual([-10, -8, -6, -4, -2, 0])
  })

  it('passos fracionários pedem casas decimais nos ticks', () => {
    expect(escalaProporcao([-0.4, -0.2]).casas).toBeGreaterThanOrEqual(1)
  })

  it('sem nenhum ponto, ou tudo zero, devolve um eixo mínimo legível (nunca o monetário)', () => {
    for (const s of [[], [null, null], [0, 0]]) {
      const e = escalaProporcao(s)
      expect(e.ticks).toContain(0)
      expect(e.ticks.every(Number.isFinite)).toBe(true)
      expect(Math.abs(e.domain[0])).toBeLessThan(10)
    }
  })

  it('ignora null no meio da série (ano sem ponto não distorce a escala)', () => {
    expect(escalaProporcao([null, -6.22, -5.0, -6.76]).domain).toEqual([-8, 0])
  })
})
