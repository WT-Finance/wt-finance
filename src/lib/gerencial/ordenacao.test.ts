import { describe, it, expect } from 'vitest'
import { DIR_PADRAO_COL, comparadorLancamentos, type LinhaOrdenavel } from './ordenacao'

// v5.9.3 (M7) — a Base de Dados do Fluxo de Caixa Gerencial passa a abrir ordenada por
// Vencimento do MAIS ANTIGO para o MAIS NOVO (asc); e essa é a direção padrão ao
// (re)selecionar a coluna Vencimento.

function linha(overrides: Partial<LinhaOrdenavel>): LinhaOrdenavel {
  return {
    tipo: 'pagar',
    pessoa: 'Fulano',
    valor_final: 100,
    descricao: null,
    conta_previsao: null,
    vencimento: '2026-01-01',
    originador_nome: null,
    ...overrides,
  }
}

describe('ordenação da Base de Dados (Fluxo de Caixa Gerencial)', () => {
  it('a direção padrão de Vencimento é asc (mais antigo primeiro)', () => {
    expect(DIR_PADRAO_COL.vencimento).toBe('asc')
  })

  it('valor continua desc por padrão', () => {
    expect(DIR_PADRAO_COL.valor).toBe('desc')
  })

  it('vencimento asc ordena do mais antigo para o mais novo', () => {
    const linhas = [
      linha({ vencimento: '2024-01-05' }),
      linha({ vencimento: '2026-12-01' }),
      linha({ vencimento: '2025-06-10' }),
    ]
    const ordenado = [...linhas].sort(comparadorLancamentos('vencimento', 'asc', []))
    expect(ordenado.map(l => l.vencimento)).toEqual(['2024-01-05', '2025-06-10', '2026-12-01'])
  })

  it('vencimento desc ordena do mais novo para o mais antigo', () => {
    const linhas = [
      linha({ vencimento: '2024-01-05' }),
      linha({ vencimento: '2026-12-01' }),
      linha({ vencimento: '2025-06-10' }),
    ]
    const ordenado = [...linhas].sort(comparadorLancamentos('vencimento', 'desc', []))
    expect(ordenado.map(l => l.vencimento)).toEqual(['2026-12-01', '2025-06-10', '2024-01-05'])
  })

  it('valor ordena numericamente (desc), não lexicograficamente', () => {
    const linhas = [
      linha({ valor_final: 9 }),
      linha({ valor_final: 100 }),
      linha({ valor_final: 20 }),
    ]
    const ordenado = [...linhas].sort(comparadorLancamentos('valor', 'desc', []))
    expect(ordenado.map(l => l.valor_final)).toEqual([100, 20, 9])
  })
})
