import { describe, it, expect } from 'vitest'
import { canonizarConta, normalizarChaveConta, ROTULO_OUTRAS } from './normalizar-conta'

// v4.22 / M6 — cobre o mapeamento das 108 linhas reais (re-verificado em produção 2026-06-17):
// Banco Itau(42)→Itaú, ASAAS(33)→Asaas, Blimboo(13)→Blimboo, NULL(18)+Caixa Economica(1)+
// USD 4.680(1)→Outras. Contas reais = Itaú/Asaas/Blimboo/Clara. Garante a normalização tolerante.
const CONTAS = ['Itaú', 'Asaas', 'Blimboo', 'Clara']

describe('normalizarChaveConta', () => {
  it('minúsculo + sem acento + trim + espaços colapsados', () => {
    expect(normalizarChaveConta('  Banco   Itaú ')).toBe('banco itau')
    expect(normalizarChaveConta('ASAAS')).toBe('asaas')
    expect(normalizarChaveConta(null)).toBe('')
    expect(normalizarChaveConta('')).toBe('')
  })
})

describe('canonizarConta — mapeia conta_previsao cru → conta real ou "Outras"', () => {
  it('alias "Banco Itau" (e variações de caixa/acento) → Itaú', () => {
    expect(canonizarConta('Banco Itau', CONTAS)).toBe('Itaú')
    expect(canonizarConta('banco itaú', CONTAS)).toBe('Itaú')
    expect(canonizarConta('  Banco  Itau ', CONTAS)).toBe('Itaú')
  })
  it('normalização de caixa: ASAAS → Asaas', () => {
    expect(canonizarConta('ASAAS', CONTAS)).toBe('Asaas')
    expect(canonizarConta('asaas', CONTAS)).toBe('Asaas')
  })
  it('match direto (com acento): Itaú/itau e Blimboo', () => {
    expect(canonizarConta('Itaú', CONTAS)).toBe('Itaú')
    expect(canonizarConta('itau', CONTAS)).toBe('Itaú')
    expect(canonizarConta('Blimboo', CONTAS)).toBe('Blimboo')
  })
  it('nulos/vazios/órfãos reais (2026-06-17) → "Outras"', () => {
    expect(canonizarConta(null, CONTAS)).toBe(ROTULO_OUTRAS)
    expect(canonizarConta('', CONTAS)).toBe(ROTULO_OUTRAS)
    expect(canonizarConta('   ', CONTAS)).toBe(ROTULO_OUTRAS)
    expect(canonizarConta('Caixa Economica', CONTAS)).toBe(ROTULO_OUTRAS)
    expect(canonizarConta('USD 4.680', CONTAS)).toBe(ROTULO_OUTRAS)
  })
  it('devolve o nome EXATO da conta real (não o alias)', () => {
    // mesmo que o input venha sem acento, devolve "Itaú" como está em gerencial_saldos
    expect(canonizarConta('ITAU', CONTAS)).toBe('Itaú')
  })
})
