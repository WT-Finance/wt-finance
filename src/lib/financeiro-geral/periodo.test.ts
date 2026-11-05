import { describe, expect, it } from 'vitest'
import {
  PRIMEIRO_ANO, anosDasPillsGeral, anosDeAntecipacoes, anosDosPrejuizos, mesesRealizados, recorteDaLeitura,
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

describe('anosDosPrejuizos — ?prejuizos= (com ?anos= como valor inicial); Antecipações não lê URL', () => {
  it('lê o próprio parâmetro: desordem, repetição, formato repetido, ano fora das pills ou futuro', () => {
    expect(anosDosPrejuizos({ prejuizos: '2025,2026' }, 2026)).toEqual([2025, 2026])
    expect(anosDosPrejuizos({ prejuizos: '2026,2025,2025' }, 2026)).toEqual([2025, 2026])
    expect(anosDosPrejuizos({ prejuizos: ['2024', '2026'] }, 2026)).toEqual([2024, 2026])
    expect(anosDosPrejuizos({ prejuizos: '2019,2025' }, 2026)).toEqual([2025])
    expect(anosDosPrejuizos({ prejuizos: '2019' }, 2026)).toEqual([2026])
    expect(anosDosPrejuizos({ prejuizos: '2027,2026' }, 2026)).toEqual([2026])
  })
  it('o antigo ?anos= (e ?ano=) é o valor inicial', () => {
    expect(anosDosPrejuizos({ anos: '2025,2026' }, 2026)).toEqual([2025, 2026])
    expect(anosDosPrejuizos({ ano: '2025' }, 2026)).toEqual([2025])
  })
  it('o parâmetro próprio vence o antigo', () => {
    expect(anosDosPrejuizos({ anos: '2024', prejuizos: '2026' }, 2026)).toEqual([2026])
  })
  it('parâmetro próprio sem ano válido (lixo, vazio) cai no antigo e, sem ele, no default; o próprio igual ao corrente vale', () => {
    expect(anosDosPrejuizos({ prejuizos: 'abc', anos: '2025' }, 2026)).toEqual([2025])
    expect(anosDosPrejuizos({ prejuizos: '', ano: '2025' }, 2026)).toEqual([2025])
    expect(anosDosPrejuizos({ prejuizos: 'abc' }, 2026)).toEqual([2024, 2025, 2026])
    expect(anosDosPrejuizos({ prejuizos: '2026', anos: '2024' }, 2026)).toEqual([2026])
    expect(anosDosPrejuizos({}, 2026)).toEqual([2024, 2025, 2026])
  })
  it('um `?antecipacoes=` antigo (link salvo) não influencia nada', () => {
    const comLixo = (x: Record<string, string>) => x as unknown as Parameters<typeof anosDosPrejuizos>[0]
    expect(anosDosPrejuizos(comLixo({ prejuizos: '2025', antecipacoes: '2024' }), 2026)).toEqual([2025])
    expect(anosDosPrejuizos(comLixo({ antecipacoes: '2024' }), 2026)).toEqual([2024, 2025, 2026])
  })
})

describe('anosDeAntecipacoes — recorte FIXO: o ano corrente e os dois anteriores', () => {
  it('crescente, sem depender de URL', () => {
    expect(anosDeAntecipacoes(2026)).toEqual([2024, 2025, 2026])
    expect(anosDeAntecipacoes(2027)).toEqual([2025, 2026, 2027])
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
