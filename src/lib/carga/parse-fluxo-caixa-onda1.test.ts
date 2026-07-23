import { describe, it, expect } from 'vitest'
import { normalizeHeader } from './vendas-parser'
import {
  parseLancamentosMovimentacaoRows,
  LANCAMENTOS_MOVIMENTACAO_COLUNAS,
} from './parse-lancamentos-movimentacao'
import {
  parseTitulosEmAbertoRows,
  TITULOS_EM_ABERTO_COLUNAS,
} from './parse-titulos-em-aberto'

// Fluxo de Caixa, Onda 1 (v5.2.0) — dois exports do Monde, mesma família de colunas:
//  • "Lançamentos por movimentação"          → REALIZADO, eixo = data_movimentacao
//  • "Lançamentos por vencimento em aberto"  → PREVISTO,  eixo = vencimento (SEM
//    data_movimentacao — o título ainda não foi liquidado)
//
// Casamento de cabeçalho por normalizeHeader (vendas-parser) nos dois parsers. O
// caractere 'º' de "Venda Nº" (U+00BA) NÃO é removido pela normalização NFD — como
// os DOIS lados (COL_MAP e o header do arquivo) passam pela MESMA função, casam
// naturalmente sem tratamento especial.

describe('normalizeHeader — "Venda Nº" tolera caixa/acento/espaço (o `º` casa nos dois lados)', () => {
  it('casa "Venda Nº" com "venda nº" (mesmo º, só caixa)', () => {
    expect(normalizeHeader('Venda Nº')).toBe(normalizeHeader('venda nº'))
  })

  it('tolera espaço duplicado e maiúsculas', () => {
    expect(normalizeHeader('VENDA   Nº')).toBe(normalizeHeader('venda nº'))
  })

  it('tolera acento (Descrição/Descricao, Liquidação/Liquidacao)', () => {
    expect(normalizeHeader('Descrição Categoria')).toBe(normalizeHeader('Descricao Categoria'))
    expect(normalizeHeader('Liquidação')).toBe(normalizeHeader('Liquidacao'))
  })
})

const HEADERS_MOVIMENTACAO = [
  'Grupo de Categoria', 'Categoria', 'Numero', 'Venda Nº', 'Emissao', 'Vencimento',
  'Liquidacao', 'Movimentação', 'Pessoa', 'Descricao', 'Descricao_Categoria', 'Valor', 'Conta',
]

describe('parseLancamentosMovimentacaoRows — o REALIZADO (13 colunas)', () => {
  it('parseia data_movimentacao/valor/venda_no; sinal do valor preservado (negativo continua negativo)', () => {
    const linha = [
      'Despesas Operacionais', 'Aluguel', '123', '456', new Date(2026, 5, 1), new Date(2026, 5, 5),
      new Date(2026, 5, 5), new Date(2026, 5, 5), 'Fornecedor X', 'Pagamento aluguel',
      'Aluguel Sede', '-1.234,56', 'Conta Corrente',
    ]
    const res = parseLancamentosMovimentacaoRows([HEADERS_MOVIMENTACAO, linha], 'lm.xlsx')

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res).toHaveLength(1)
    expect(res[0].data_movimentacao).toBe('2026-06-05')
    expect(res[0].valor).toBe(-1234.56)           // saída — sinal preservado, NÃO vira positivo
    expect(res[0].venda_no).toBe(456)
    expect(res[0].numero).toBe('123')
    expect(res[0].grupo_categoria).toBe('Despesas Operacionais')
    expect(res[0].conta).toBe('Conta Corrente')
  })

  it('valor positivo (entrada) permanece positivo', () => {
    const linha = HEADERS_MOVIMENTACAO.map((h) => {
      if (h === 'Valor') return '2.500,00'
      if (h === 'Movimentação') return new Date(2026, 6, 10)
      return 'x'
    })
    const res = parseLancamentosMovimentacaoRows([HEADERS_MOVIMENTACAO, linha], 'f')
    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res[0].valor).toBe(2500)
  })

  it('cabeçalho em grafia diferente ("venda nº" minúsculo) ainda casa a mesma coluna', () => {
    const headersVariante = HEADERS_MOVIMENTACAO.map(h => h === 'Venda Nº' ? 'venda nº' : h)
    const linha = headersVariante.map((h) => {
      if (h === 'venda nº') return '999'
      if (h === 'Valor') return '10'
      if (h === 'Movimentação') return new Date(2026, 6, 1)
      return 'x'
    })
    const res = parseLancamentosMovimentacaoRows([headersVariante, linha], 'f')
    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res[0].venda_no).toBe(999)
  })

  it('falta a coluna obrigatória (Movimentação) → erro claro, não processa', () => {
    const semMovimentacao = HEADERS_MOVIMENTACAO.filter(h => h !== 'Movimentação')
    const linha = semMovimentacao.map(() => 'x')
    const res = parseLancamentosMovimentacaoRows([semMovimentacao, linha], 'f')

    expect(Array.isArray(res)).toBe(false)
    if (Array.isArray(res)) return
    expect(res.error).toContain('precisa conter')
    expect(res.error).toContain('Movimentação')
  })

  it('falta a coluna obrigatória (Valor) → erro claro, não processa', () => {
    const semValor = HEADERS_MOVIMENTACAO.filter(h => h !== 'Valor')
    const linha = semValor.map(() => 'x')
    const res = parseLancamentosMovimentacaoRows([semValor, linha], 'f')

    expect(Array.isArray(res)).toBe(false)
    if (Array.isArray(res)) return
    expect(res.error).toContain('Valor')
  })
})

describe('parseTitulosEmAbertoRows — o PREVISTO (12 colunas, SEM data_movimentacao)', () => {
  const HEADERS_ABERTO = HEADERS_MOVIMENTACAO.filter(h => h !== 'Movimentação')

  it('parseia normalmente sem a coluna Movimentação; eixo é vencimento; liquidacao vazia', () => {
    const linha = [
      'Receitas', 'Vendas', '789', '111', new Date(2026, 6, 1), new Date(2026, 7, 10),
      '', 'Cliente Y', 'Recebimento futuro', 'Venda Pacote', '2500', 'Conta Corrente',
    ]
    const res = parseTitulosEmAbertoRows([HEADERS_ABERTO, linha], 'ta.xlsx')

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res).toHaveLength(1)
    expect(res[0].vencimento).toBe('2026-08-10')
    expect(res[0].valor).toBe(2500)
    expect(res[0].liquidacao).toBeNull()           // sempre vazia nesta base (título em aberto)
    expect('data_movimentacao' in res[0]).toBe(false)
  })

  it('falta a coluna obrigatória (Vencimento) → erro claro, não processa', () => {
    const semVencimento = HEADERS_ABERTO.filter(h => h !== 'Vencimento')
    const linha = semVencimento.map(() => 'x')
    const res = parseTitulosEmAbertoRows([semVencimento, linha], 'f')

    expect(Array.isArray(res)).toBe(false)
    if (Array.isArray(res)) return
    expect(res.error).toContain('Vencimento')
  })
})

describe('colunas obrigatórias exibidas na UI', () => {
  it('LANCAMENTOS_MOVIMENTACAO_COLUNAS = Movimentação + Valor', () => {
    expect(LANCAMENTOS_MOVIMENTACAO_COLUNAS).toEqual(['Movimentação', 'Valor'])
  })
  it('TITULOS_EM_ABERTO_COLUNAS = Vencimento + Valor', () => {
    expect(TITULOS_EM_ABERTO_COLUNAS).toEqual(['Vencimento', 'Valor'])
  })
})
