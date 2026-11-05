import { describe, it, expect } from 'vitest'
import {
  COL_PADRAO_REGISTRO, DIR_PADRAO_COL_REGISTRO, DIR_PADRAO_REGISTRO, ordenarRegistros, type LinhaRegistro,
} from './ordenacao-antecipacoes'

function reg(o: Partial<LinhaRegistro> & { id: number }): LinhaRegistro {
  return { conta: 'Asaas', data: '2026-01-10', valor_antecipado: 1000, valor_liquido: 970, desconto: 30, ...o }
}

const ids = (l: LinhaRegistro[]) => l.map(r => r.id)

describe('ordenação dos registros de antecipação', () => {
  it('o padrão é Data, do mais recente para o mais antigo', () => {
    expect(COL_PADRAO_REGISTRO).toBe('data')
    expect(DIR_PADRAO_REGISTRO).toBe('desc')
    const l = [reg({ id: 1, data: '2025-12-31' }), reg({ id: 2, data: '2026-03-01' }), reg({ id: 3, data: '2026-01-15' })]
    expect(ids(ordenarRegistros(l, COL_PADRAO_REGISTRO, DIR_PADRAO_REGISTRO))).toEqual([2, 3, 1])
  })

  it('data asc inverte', () => {
    const l = [reg({ id: 1, data: '2026-02-01' }), reg({ id: 2, data: '2025-02-01' })]
    expect(ids(ordenarRegistros(l, 'data', 'asc'))).toEqual([2, 1])
  })

  it('valores comparam como número (não como texto)', () => {
    const l = [reg({ id: 1, valor_antecipado: 9 }), reg({ id: 2, valor_antecipado: 100 }), reg({ id: 3, valor_antecipado: 20 })]
    expect(ids(ordenarRegistros(l, 'antecipado', 'asc'))).toEqual([1, 3, 2])
    expect(ids(ordenarRegistros(l, 'antecipado', 'desc'))).toEqual([2, 3, 1])
  })

  it('líquido e desconto ordenam pelas próprias colunas', () => {
    const l = [reg({ id: 1, valor_liquido: 50, desconto: 5 }), reg({ id: 2, valor_liquido: 70, desconto: 1 })]
    expect(ids(ordenarRegistros(l, 'liquido', 'desc'))).toEqual([2, 1])
    expect(ids(ordenarRegistros(l, 'desconto', 'desc'))).toEqual([1, 2])
  })

  it('conta ordena em pt-BR, sem distinguir caixa nem acento', () => {
    const l = [reg({ id: 1, conta: 'Zeta' }), reg({ id: 2, conta: 'álamo' }), reg({ id: 3, conta: 'Blimboo' })]
    expect(ids(ordenarRegistros(l, 'conta', 'asc'))).toEqual([2, 3, 1])
    expect(ids(ordenarRegistros(l, 'conta', 'desc'))).toEqual([1, 3, 2])
  })

  it('empate na coluna desempata por data desc e depois por id desc, em qualquer direção', () => {
    const l = [
      reg({ id: 1, conta: 'Asaas', data: '2026-01-01' }),
      reg({ id: 2, conta: 'Asaas', data: '2026-02-01' }),
      reg({ id: 3, conta: 'Asaas', data: '2026-02-01' }),
    ]
    expect(ids(ordenarRegistros(l, 'conta', 'asc'))).toEqual([3, 2, 1])
    expect(ids(ordenarRegistros(l, 'conta', 'desc'))).toEqual([3, 2, 1])
  })

  it('não muta a entrada e mantém o conjunto', () => {
    const l = [reg({ id: 1, data: '2026-01-01' }), reg({ id: 2, data: '2026-05-01' })]
    const copia = [...l]
    const r = ordenarRegistros(l, 'data', 'desc')
    expect(l).toEqual(copia)
    expect(r).toHaveLength(2)
  })

  it('direção ao trocar de coluna: texto asc, resto desc', () => {
    expect(DIR_PADRAO_COL_REGISTRO.conta).toBe('asc')
    expect(DIR_PADRAO_COL_REGISTRO.data).toBe('desc')
    expect(DIR_PADRAO_COL_REGISTRO.antecipado).toBe('desc')
  })
})
