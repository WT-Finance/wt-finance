import { describe, it, expect } from 'vitest'
import { normalizeHeader, toIsoDate } from './parse-vendas-produto'

// Casos que JÁ morderam em produção (v4.9 / v4.9.1):
//  - cabeçalho do ERP varia acento/caixa/espaço ("Operação Própria" vs "Operação Propria")
//  - data deve sair do Date NATIVO da célula (sem inverter dia/mês — ADR-0099)

describe('normalizeHeader — tolerante a acento, caixa e espaço', () => {
  it('casa grafias diferentes do mesmo cabeçalho', () => {
    expect(normalizeHeader('Operação Própria')).toBe(normalizeHeader('Operação Propria'))
    expect(normalizeHeader('OPERAÇÃO  PRÓPRIA')).toBe(normalizeHeader('operação própria'))
    expect(normalizeHeader('Mês')).toBe(normalizeHeader('Mes'))
    expect(normalizeHeader('Data de Início')).toBe('data de inicio')
  })
})

describe('toIsoDate — Date nativo e DD/MM/YYYY, sem inverter dia/mês', () => {
  it('Date nativo da célula → ISO local (não desloca)', () => {
    expect(toIsoDate(new Date(2026, 5, 8))).toBe('2026-06-08') // 8 de junho
    expect(toIsoDate(new Date(2026, 0, 31))).toBe('2026-01-31')
  })
  it('string DD/MM/YYYY → YYYY-MM-DD (dia antes do mês)', () => {
    expect(toIsoDate('08/06/2026')).toBe('2026-06-08') // 8/jun, NÃO 6/ago
    expect(toIsoDate('31/12/2025')).toBe('2025-12-31')
  })
  it('string já ISO passa direto; vazio/null → null', () => {
    expect(toIsoDate('2026-06-08')).toBe('2026-06-08')
    expect(toIsoDate('')).toBeNull()
    expect(toIsoDate(null)).toBeNull()
    expect(toIsoDate(undefined)).toBeNull()
  })
})
