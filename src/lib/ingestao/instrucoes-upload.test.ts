import { describe, it, expect } from 'vitest'
import { INSTRUCOES_UPLOAD, type BaseUpload } from './instrucoes-upload'
import { mapearColunas, camposFaltando } from './parsers/comum'
import * as vendas from './parsers/vendas-produto'
import * as operacao from './parsers/lancamentos-operacao'
import * as categoria from './parsers/lancamentos-categoria'
import { CAMPOS_CANONICOS } from './parsers/demonstrativo-competencia'
import { PESSOAS_COLUNAS } from '@/lib/carga/parse-pessoas'
import { normalizeHeader } from '@/lib/carga/vendas-parser'

// Sonda de deriva (v6.1.3): as colunas que o painel "Ver instruções" e a linha curta do card
// mostram têm de ser EXATAMENTE as que o parser do servidor confere. A deriva já aconteceu uma vez
// — de v6.0.0 a v6.1.2 o card exibia as colunas dos parsers antigos do navegador (ex.: "Vencimento,
// Valor" onde o servidor exige 12). O teste passa os rótulos exibidos como se fossem o cabeçalho de
// um arquivo, pelo MESMO `mapearColunas`/`camposFaltando` que o parse usa: rótulo que o servidor não
// reconhece, campo exigido que o painel omite ou campo listado duas vezes, tudo reprova aqui.

function conferir<C extends string>(
  base: BaseUpload,
  mapa: Readonly<Record<string, C>>,
  obrigatorios: readonly C[],
) {
  const rotulos = INSTRUCOES_UPLOAD[base].colunas.itens
  const { indices, naoMapeados } = mapearColunas<C>(rotulos, mapa)
  expect(naoMapeados, `rótulos que o servidor não reconhece em "${base}"`).toEqual([])
  expect(camposFaltando(indices, obrigatorios), `campos exigidos ausentes do painel de "${base}"`).toEqual([])
  // Um rótulo por campo exigido — nem campo opcional na lista, nem dois rótulos do mesmo campo.
  expect(rotulos).toHaveLength(obrigatorios.length)
}

describe('instruções de upload × parser do servidor', () => {
  it('Vendas por Produto lista exatamente as colunas exigidas', () => {
    conferir('vendas', vendas.COL_MAP, vendas.OBRIGATORIOS)
  })

  it('Lançamentos por Operação lista exatamente as colunas exigidas', () => {
    conferir('lancamentos', operacao.COL_MAP, operacao.OBRIGATORIOS)
  })

  it('Movimentação e Em aberto listam exatamente as colunas exigidas (parser único)', () => {
    conferir('lancamentos_movimentacao', categoria.COL_MAP, categoria.OBRIGATORIOS)
    conferir('titulos_em_aberto', categoria.COL_MAP, categoria.OBRIGATORIOS)
  })

  it('Demonstrativo lista os cinco campos do pivot', () => {
    const rotulos = INSTRUCOES_UPLOAD.demonstrativo_competencia.colunas.itens.map(normalizeHeader)
    expect([...rotulos].sort()).toEqual([...CAMPOS_CANONICOS].sort())
  })

  it('Pessoas usa a lista do próprio parser', () => {
    expect(INSTRUCOES_UPLOAD.pessoas.colunas.itens).toEqual(PESSOAS_COLUNAS)
  })

  it('o painel "Ver instruções" nunca nasce vazio', () => {
    for (const [base, inst] of Object.entries(INSTRUCOES_UPLOAD)) {
      expect(inst.origem, base).not.toBe('')
      expect(inst.atencao.length, base).toBeGreaterThan(0)
      expect(inst.passos.length, base).toBeGreaterThan(0)
    }
  })
})
