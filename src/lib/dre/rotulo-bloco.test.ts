import { describe, it, expect } from 'vitest'
import { rotuloBloco } from './rotulo-bloco'

describe('rotuloBloco — remove só o prefixo contábil, preserva o resto', () => {
  const casosReais: [string, string][] = [
    ['(+) ENTRADA DE CLIENTES', 'ENTRADA DE CLIENTES'],
    ['(-) PAGAMENTO AO FORNECEDOR', 'PAGAMENTO AO FORNECEDOR'],
    ['(=) SALDO REPASSE', 'SALDO REPASSE'],
    ['(-) IMPOSTOS E DEDUÇÕES DA RECEITA BRUTA', 'IMPOSTOS E DEDUÇÕES DA RECEITA BRUTA'],
    ['= LUCRO BRUTO', 'LUCRO BRUTO'],
    ['Receita de Vendas', 'Receita de Vendas'],
    ['Despesas Operacionais RH', 'Despesas Operacionais RH'],
    ['Despesas Operacionais RH Benefícios', 'Despesas Operacionais RH Benefícios'],
  ]

  it.each(casosReais)('%s → %s', (entrada, esperado) => {
    expect(rotuloBloco(entrada)).toBe(esperado)
  })

  it('string vazia → string vazia', () => {
    expect(rotuloBloco('')).toBe('')
  })

  it('é idempotente — aplicar 2x é igual a aplicar 1x', () => {
    for (const [entrada] of casosReais) {
      const uma = rotuloBloco(entrada)
      expect(rotuloBloco(uma)).toBe(uma)
    }
  })

  it('hífen NO MEIO do texto é preservado — não é prefixo (a âncora ^ protege)', () => {
    expect(rotuloBloco('Movimentação de Caixa - C')).toBe('Movimentação de Caixa - C')
  })
})
