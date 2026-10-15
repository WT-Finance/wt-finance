import { describe, expect, it } from 'vitest'
import {
  PRIMEIRO_ANO, anosDasPillsGeral, anosSelecionados, mesesRealizados, recorteDaLeitura,
  recorteTexto, rotuloDoAno, rotuloReferencia,
} from './periodo'

describe('anosDasPillsGeral — janela fixa (as RPCs não devolvem anosDisponiveis)', () => {
  it('do primeiro ano com dado até o corrente', () => {
    expect(PRIMEIRO_ANO).toBe(2024)
    expect(anosDasPillsGeral(2026)).toEqual([2024, 2025, 2026])
    expect(anosDasPillsGeral(2027)).toEqual([2024, 2025, 2026, 2027])
  })
  it('nunca vazia, mesmo com relógio absurdo', () => {
    expect(anosDasPillsGeral(2020)).toEqual([2024])
  })
})

describe('anosSelecionados — ?anos= reaproveitando lib/marketing/anos', () => {
  it('sem parâmetro: os 3 últimos anos até o corrente', () => {
    expect(anosSelecionados({}, 2026)).toEqual([2024, 2025, 2026])
  })
  it('?anos=2025,2026 e o antigo ?ano=2026', () => {
    expect(anosSelecionados({ anos: '2026,2025' }, 2026)).toEqual([2025, 2026])
    expect(anosSelecionados({ ano: '2025' }, 2026)).toEqual([2025])
  })
  it('ano sem pill (anterior ao primeiro) é ignorado; lixo cai no default sem estourar', () => {
    expect(anosSelecionados({ anos: '2019,2025' }, 2026)).toEqual([2025])
    expect(anosSelecionados({ anos: 'abc' }, 2026)).toEqual([2024, 2025, 2026])
    expect(anosSelecionados({ anos: '2019' }, 2026)).toEqual([2026])
  })
  it('ano futuro é descartado', () => {
    expect(anosSelecionados({ anos: '2027,2026' }, 2026)).toEqual([2026])
  })
})

describe('recorte do ano pela PRÓPRIA RPC (relacao + mes_corrente)', () => {
  it('fechado = jan–dez; corrente = jan até o mês corrente; futuro = só jan', () => {
    expect(recorteDaLeitura({ relacao: 'fechado', mes_corrente: null })).toEqual({ mesIni: 1, mesFim: 12 })
    expect(recorteDaLeitura({ relacao: 'corrente', mes_corrente: 10 })).toEqual({ mesIni: 1, mesFim: 10 })
    expect(recorteDaLeitura({ relacao: 'futuro', mes_corrente: null })).toEqual({ mesIni: 1, mesFim: 1 })
  })
  it('corrente sem mes_corrente não inventa: ano inteiro; mês fora de 1..12 é preso', () => {
    expect(recorteDaLeitura({ relacao: 'corrente', mes_corrente: null }).mesFim).toBe(12)
    expect(recorteDaLeitura({ relacao: 'corrente', mes_corrente: 13 }).mesFim).toBe(12)
    expect(recorteDaLeitura({ relacao: 'corrente', mes_corrente: 0 }).mesFim).toBe(1)
  })
  it('ano parcial leva "*" e o recorte em texto; ano inteiro não', () => {
    expect(rotuloDoAno(2026, { relacao: 'corrente', mes_corrente: 10 })).toBe('2026*')
    expect(rotuloDoAno(2025, { relacao: 'fechado', mes_corrente: null })).toBe('2025')
    expect(recorteTexto({ relacao: 'corrente', mes_corrente: 10 })).toBe('jan–out')
    expect(recorteTexto({ relacao: 'fechado', mes_corrente: null })).toBeNull()
    // corrente em dezembro é um ano inteiro
    expect(rotuloDoAno(2026, { relacao: 'corrente', mes_corrente: 12 })).toBe('2026')
  })
  it('referência do Δ: o ano anterior NO MESMO recorte', () => {
    expect(rotuloReferencia(2025, { relacao: 'corrente', mes_corrente: 10 })).toBe('2025 (jan–out)')
    expect(rotuloReferencia(2024, { relacao: 'fechado', mes_corrente: null })).toBe('2024')
  })
  it('meses realizados', () => {
    expect(mesesRealizados({ relacao: 'corrente', mes_corrente: 3 })).toBe(3)
    expect(mesesRealizados({ relacao: 'fechado', mes_corrente: null })).toBe(12)
  })
})
