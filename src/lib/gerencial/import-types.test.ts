import { describe, it, expect } from 'vitest'
import { computeDiffPorFatia, type LancamentoPlanilha, type LinhaFatia } from './import-types'

// v4.23.0 — guarda da sincronização por fatia (ADR-0126). Cada caso espelha um critério
// verificável do briefing: contagem, normalização, manter/atualizar, toggle, isolamento.

const base = { tipo: 'A pagar' as const, pessoa: 'Fornecedor X', valor_final: 1000, descricao: 'desc', conta_previsao: 'Itaú', vencimento: '2026-07-01' }
const p  = (o: Partial<LancamentoPlanilha> = {}): LancamentoPlanilha => ({ ...base, ...o })
const f  = (id: number, o: Partial<LinhaFatia> = {}): LinhaFatia => ({ id, ...base, ...o })

describe('computeDiffPorFatia — adicionar/manter/atualizar/remover básicos', () => {
  it('fatia vazia: tudo adiciona', () => {
    const d = computeDiffPorFatia([p({ pessoa: 'A' }), p({ pessoa: 'B' })], [], false)
    expect(d.aAdicionar).toHaveLength(2)
    expect(d.aRemover).toHaveLength(0); expect(d.aAtualizar).toHaveLength(0); expect(d.aManter).toHaveLength(0)
  })
  it('linha idêntica (6 campos) → manter', () => {
    const d = computeDiffPorFatia([p()], [f(1)], false)
    expect(d.aManter).toHaveLength(1)
    expect(d.aManter[0].id).toBe(1)
    expect(d.aAdicionar).toHaveLength(0); expect(d.aRemover).toHaveLength(0); expect(d.aAtualizar).toHaveLength(0)
  })
  it('descrição muda (mesma chave lógica) → atualizar, preserva id', () => {
    const d = computeDiffPorFatia([p({ descricao: 'novo' })], [f(1, { descricao: 'velho' })], false)
    expect(d.aAtualizar).toHaveLength(1)
    expect(d.aAtualizar[0].id).toBe(1)
    expect(d.aAtualizar[0].camposDivergentes).toContain('descricao')
    expect(d.aManter).toHaveLength(0); expect(d.aRemover).toHaveLength(0); expect(d.aAdicionar).toHaveLength(0)
  })
  it('conta muda → atualizar (conta_previsao)', () => {
    const d = computeDiffPorFatia([p({ conta_previsao: 'Asaas' })], [f(1, { conta_previsao: 'Itaú' })], false)
    expect(d.aAtualizar).toHaveLength(1)
    expect(d.aAtualizar[0].camposDivergentes).toEqual(['conta_previsao'])
  })
  it('linha sumiu da planilha (própria fatia) → remover', () => {
    const d = computeDiffPorFatia([p({ pessoa: 'A' })], [f(1, { pessoa: 'A' }), f(2, { pessoa: 'B' })], false)
    expect(d.aManter.map(r => r.id)).toEqual([1])
    expect(d.aRemover.map(r => r.id)).toEqual([2])
  })
  it('auto-correção de VALOR = remove a antiga + adiciona a nova (valor é identidade)', () => {
    const d = computeDiffPorFatia([p({ valor_final: 1100 })], [f(1, { valor_final: 1000 })], false)
    expect(d.aRemover.map(r => r.id)).toEqual([1])
    expect(d.aAdicionar).toHaveLength(1)
    expect(d.aAtualizar).toHaveLength(0)
  })
})

describe('computeDiffPorFatia — normalização (dedup não é teatro)', () => {
  it('"BestBuy Hotel" e "BestBuy Hotel " (espaço/caixa) são idênticos → manter', () => {
    const d = computeDiffPorFatia([p({ pessoa: 'BestBuy Hotel ' })], [f(1, { pessoa: 'bestbuy  hotel' })], false)
    expect(d.aManter).toHaveLength(1)
    expect(d.aRemover).toHaveLength(0); expect(d.aAdicionar).toHaveLength(0); expect(d.aAtualizar).toHaveLength(0)
  })
  it('tipo com caixa/espaço diferente é a MESMA linha lógica (não remove+adiciona)', () => {
    const d = computeDiffPorFatia([p({ tipo: 'A pagar ' as 'A pagar' })], [f(1, { tipo: 'a pagar' })], false)
    expect(d.aManter).toHaveLength(1)
    expect(d.aRemover).toHaveLength(0); expect(d.aAdicionar).toHaveLength(0)
  })
  it('valor monetário: 1234.5 e 1234.50 são o mesmo dinheiro → manter (chave de centavos consistente)', () => {
    const d = computeDiffPorFatia([p({ valor_final: 1234.5 })], [f(1, { valor_final: 1234.50 })], false)
    expect(d.aManter).toHaveLength(1)
    expect(d.aRemover).toHaveLength(0); expect(d.aAdicionar).toHaveLength(0)
  })
  it('valor monetário: 100,00 ≠ 100,01 são linhas distintas → remove+adiciona', () => {
    const d = computeDiffPorFatia([p({ valor_final: 100.01 })], [f(1, { valor_final: 100.00 })], false)
    expect(d.aRemover.map(r => r.id)).toEqual([1])
    expect(d.aAdicionar).toHaveLength(1)
    expect(d.aManter).toHaveLength(0)
  })
})

describe('computeDiffPorFatia — sincronização POR CONTAGEM (toggle ON = duplicatas reais)', () => {
  it('2 na planilha + 2 na fatia → mantém 2', () => {
    const d = computeDiffPorFatia([p(), p()], [f(1), f(2)], true)
    expect(d.aManter).toHaveLength(2)
    expect(d.aRemover).toHaveLength(0); expect(d.aAdicionar).toHaveLength(0)
  })
  it('planilha caiu para 1 → remove 1', () => {
    const d = computeDiffPorFatia([p()], [f(1), f(2)], true)
    expect(d.aManter).toHaveLength(1)
    expect(d.aRemover).toHaveLength(1)
  })
  it('planilha subiu para 3 → adiciona 1', () => {
    const d = computeDiffPorFatia([p(), p(), p()], [f(1), f(2)], true)
    expect(d.aManter).toHaveLength(2)
    expect(d.aAdicionar).toHaveLength(1)
    expect(d.aRemover).toHaveLength(0)
  })
})

describe('computeDiffPorFatia — toggle "manter duplicadas" (dentro da planilha)', () => {
  it('desligado (padrão) colapsa idênticas da planilha em uma', () => {
    const d = computeDiffPorFatia([p(), p()], [], false)
    expect(d.aAdicionar).toHaveLength(1)
  })
  it('ligado mantém as duas', () => {
    const d = computeDiffPorFatia([p(), p()], [], true)
    expect(d.aAdicionar).toHaveLength(2)
  })
})

describe('computeDiffPorFatia — isolamento (escopo da fatia)', () => {
  it('aRemover só contém ids vindos da fatia recebida (nunca inventa)', () => {
    const fatia = [f(10), f(20, { pessoa: 'Y' })]
    const d = computeDiffPorFatia([], fatia, false)
    const idsFatia = new Set(fatia.map(r => r.id))
    expect(d.aRemover.every(r => idsFatia.has(r.id))).toBe(true)
    expect(d.aRemover.map(r => r.id).sort()).toEqual([10, 20])
  })
})
