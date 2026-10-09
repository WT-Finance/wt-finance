import { describe, it, expect } from 'vitest'
import { totalDoPeriodo } from './agregacao'
import { fatiasDeFornecedores, fatiasDeResumo, ultimaCargaDe } from './fatias'
import { montarDadosFixture } from './fixture'

const HOJE = '2026-10-08'

describe('fatiasDeResumo / fatiasDeFornecedores — cada ano no SEU recorte; a falha é acusada', () => {
  it('tudo carregou: uma fatia por ano, com o recorte de cada um, e nenhum ano em falha', () => {
    const d = montarDadosFixture({ anos: [2025, 2026], hoje: HOJE, estado: null })
    const { fatias, anosFalha } = fatiasDeResumo(d.porAno, HOJE)
    expect(anosFalha).toEqual([])
    expect(fatias.map(f => [f.ano, f.recorte])).toEqual([
      [2025, { mesIni: 1, mesFim: 12 }],
      [2026, { mesIni: 1, mesFim: 10 }],
    ])
    expect(fatiasDeFornecedores(d.porAno, HOJE).fatias.map(f => f.ano)).toEqual([2025, 2026])
  })

  it('o resumo de UM ano falhou: ele sai das fatias e entra em `anosFalha` (quem soma tem de acusar)', () => {
    const d = montarDadosFixture({ anos: [2024, 2025, 2026], hoje: HOJE, estado: 'erro-resumo-ano', anoComFalha: 2025 })
    const { fatias, anosFalha } = fatiasDeResumo(d.porAno, HOJE)
    expect(anosFalha).toEqual([2025])
    expect(fatias.map(f => f.ano)).toEqual([2024, 2026])
    // O ranking por fornecedor daquele ano segue de pé: as duas leituras falham sozinhas.
    expect(fatiasDeFornecedores(d.porAno, HOJE).anosFalha).toEqual([])
  })

  it('o total dos anos que chegaram NÃO é o total do período: por isso a falha é reportada à parte', () => {
    const completo = montarDadosFixture({ anos: [2025, 2026], hoje: HOJE, estado: null })
    const parcial = montarDadosFixture({ anos: [2025, 2026], hoje: HOJE, estado: 'erro-resumo-ano', anoComFalha: 2025 })
    const totalCompleto = totalDoPeriodo(fatiasDeResumo(completo.porAno, HOJE).fatias).valor
    const totalParcial = totalDoPeriodo(fatiasDeResumo(parcial.porAno, HOJE).fatias).valor
    expect(totalParcial).not.toBe(totalCompleto)
    expect(fatiasDeResumo(parcial.porAno, HOJE).anosFalha).toEqual([2025])
  })

  it('o ranking falhou em todos os anos: nenhuma fatia, todos em `anosFalha`', () => {
    const d = montarDadosFixture({ anos: [2025, 2026], hoje: HOJE, estado: 'erro' })
    const { fatias, anosFalha } = fatiasDeFornecedores(d.porAno, HOJE)
    expect(fatias).toEqual([])
    expect(anosFalha).toEqual([2025, 2026])
  })
})

describe('ultimaCargaDe — carimbo global, do resumo mais recente que carregou', () => {
  it('vale o do ano mais recente; se ele falhou, o do anterior; sem nenhum, null', () => {
    const ok = montarDadosFixture({ anos: [2025, 2026], hoje: HOJE, estado: null })
    expect(ultimaCargaDe(ok.porAno)).toBe(`${HOJE}T14:42:00Z`)

    const falhou2026 = montarDadosFixture({ anos: [2025, 2026], hoje: HOJE, estado: 'erro-resumo-ano', anoComFalha: 2026 })
    expect(ultimaCargaDe(falhou2026.porAno)).toBe(`${HOJE}T14:42:00Z`)

    const so2026Falhou = montarDadosFixture({ anos: [2026], hoje: HOJE, estado: 'erro-resumo-ano', anoComFalha: 2026 })
    expect(ultimaCargaDe(so2026Falhou.porAno)).toBeNull()
  })
})
