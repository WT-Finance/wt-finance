import { describe, it, expect } from 'vitest'
import { calcularRateio } from './calcular'
import type { LinhaFatura, SetorLogico } from './tipos'

// Mapa de exemplo (espelha o que a RPC cruzar_vendas_setor devolveria):
// setores REAIS da base (incl. 'Lazer', NUNCA 'Trips' — a tela que converte).
const MAPA: Record<string, SetorLogico> = {
  '71408': 'Corporativo',
  '72012': 'Corporativo',
  '71971': 'Lazer',
  '90001': 'Weddings',
}

describe('calcularRateio — invariantes da Calculadora de Rateio', () => {
  it('FECHAMENTO: soma dos 4 baldes == total (nenhum valor some)', () => {
    const linhas: LinhaFatura[] = [
      { linha: 2, venda_numero: '71408', valor: -1000 },
      { linha: 3, venda_numero: '71971', valor: -500 },
      { linha: 4, venda_numero: '90001', valor: -250 },
      { linha: 5, venda_numero: '99999', valor: -123.45 }, // não casa → Não identificado
    ]
    const r = calcularRateio(linhas, MAPA)
    const soma = r.baldes.reduce((s, b) => s + b.valor, 0)
    expect(soma).toBeCloseTo(r.total, 10)
    expect(r.total).toBeCloseTo(-1873.45, 10)
    expect(r.fecha).toBe(true)
  })

  it("INVARIANTE 'Lazer': venda de lazer cai em 'Lazer', NUNCA em 'Não identificado'", () => {
    const linhas: LinhaFatura[] = [{ linha: 2, venda_numero: '71971', valor: -800 }]
    const r = calcularRateio(linhas, MAPA)
    const lazer = r.baldes.find(b => b.setor === 'Lazer')!
    const naoId = r.baldes.find(b => b.setor === 'Não identificado')!
    expect(lazer.valor).toBe(-800)
    expect(lazer.linhas).toBe(1)
    expect(naoId.valor).toBe(0)
    expect(naoId.linhas).toBe(0)
  })

  it("'Não identificado' EXPLÍCITO: venda nula ou ausente do mapa soma no balde", () => {
    const linhas: LinhaFatura[] = [
      { linha: 2, venda_numero: '99999', valor: -100 }, // ausente do mapa
      { linha: 3, venda_numero: null,    valor: -50 },  // sem número
    ]
    const r = calcularRateio(linhas, MAPA)
    const naoId = r.baldes.find(b => b.setor === 'Não identificado')!
    expect(naoId.valor).toBe(-150)
    expect(naoId.linhas).toBe(2)
  })

  it('MULTI-LINHA da mesma venda: ambas no mesmo setor, somadas', () => {
    const linhas: LinhaFatura[] = [
      { linha: 2, venda_numero: '72012', valor: -300 },
      { linha: 3, venda_numero: '72012', valor: -200 },
    ]
    const r = calcularRateio(linhas, MAPA)
    const corp = r.baldes.find(b => b.setor === 'Corporativo')!
    expect(corp.valor).toBe(-500)
    expect(corp.linhas).toBe(2)
  })

  it('IGNORADAS: linha sem valor não entra no rateio (não afeta total)', () => {
    const linhas: LinhaFatura[] = [
      { linha: 2, venda_numero: '71408', valor: -1000 },
      { linha: 3, venda_numero: '71408', valor: null }, // sem valor → ignorada
    ]
    const r = calcularRateio(linhas, MAPA)
    expect(r.ignoradas).toBe(1)
    expect(r.total).toBe(-1000)
    expect(r.resolvidas).toHaveLength(1)
  })

  it('PCT: fração do total, com sinal negativo dá proporção positiva; total 0 → 0 (sem NaN)', () => {
    const linhas: LinhaFatura[] = [
      { linha: 2, venda_numero: '71408', valor: -750 },  // Corporativo 75%
      { linha: 3, venda_numero: '71971', valor: -250 },  // Lazer 25%
    ]
    const r = calcularRateio(linhas, MAPA)
    expect(r.baldes.find(b => b.setor === 'Corporativo')!.pct).toBeCloseTo(0.75, 10)
    expect(r.baldes.find(b => b.setor === 'Lazer')!.pct).toBeCloseTo(0.25, 10)

    const zero = calcularRateio([{ linha: 2, venda_numero: '71408', valor: 0 }], MAPA)
    expect(zero.baldes.every(b => Number.isFinite(b.pct))).toBe(true)
    expect(zero.baldes.find(b => b.setor === 'Corporativo')!.pct).toBe(0)
  })

  it('sempre devolve os 4 baldes na ordem fixa (Não identificado por último)', () => {
    const r = calcularRateio([], MAPA)
    expect(r.baldes.map(b => b.setor)).toEqual(['Corporativo', 'Lazer', 'Weddings', 'Não identificado'])
    expect(r.total).toBe(0)
    expect(r.fecha).toBe(true)
  })
})
