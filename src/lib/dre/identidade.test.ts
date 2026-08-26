import { describe, it, expect } from 'vitest'
import { chaveDeLinha, chaveDeBandeja } from './identidade'
import type { DreLinha, DreBandejaLinha } from './schemas'

// A identidade de linha é consumida por DUAS pontas que não se falam — a página, que MONTA
// os mapas de comparação (`consolidadoAnos[].porLinha`, `anosSeguintes[].totais`), e a
// tabela, que os CONSULTA. Divergir entre elas não dá erro: a coluna do Consolidado passa a
// exibir o valor de OUTRA linha. Desde a v5.8.0 as duas importam este módulo, e é aqui que
// a convenção fica travada.

const ZEROS = Array.from({ length: 12 }, () => 0)
const linha = (p: Partial<DreLinha> & Pick<DreLinha, 't'>): DreLinha => ({
  rotulo: 'X', estrela: false, meses: ZEROS, venc: 0, total: 0, ...p,
}) as DreLinha
const orfa = (p: Partial<DreBandejaLinha>): DreBandejaLinha => ({
  rotulo: 'X', grupo_monde: 'G', meses: ZEROS, venc: 0, total: 0, ...p,
})

describe('chaveDeLinha', () => {
  it('bloco, sub e totalizador usam a chave da estrutura, com prefixo b:', () => {
    for (const t of ['blocoH', 'sub', 'tot'] as const) {
      expect(chaveDeLinha(linha({ t, chave: 'REX' }))).toBe('b:REX')
    }
  })

  it('folha do CAIXA usa categoria_id (a identidade é do banco)', () => {
    expect(chaveDeLinha(linha({ t: 'cat', categoria_id: 42 }))).toBe('c:42')
  })

  it('folha da COMPETÊNCIA usa a chave de texto (não existe categoria de banco)', () => {
    expect(chaveDeLinha(linha({ t: 'cat', chave: 'RV · Comissão' }))).toBe('c:RV · Comissão')
  })

  it('categoria_id tem precedência quando os dois vêm', () => {
    // Cinto contra convergência futura dos dois modelos: se um dia a competência passar a
    // emitir os dois, a chave não muda de forma no meio de uma comparação entre anos.
    expect(chaveDeLinha(linha({ t: 'cat', categoria_id: 7, chave: 'RV · Comissão' }))).toBe('c:7')
  })

  it('folha sem identificador nenhum devolve null — a coluna cai em AUSÊNCIA', () => {
    expect(chaveDeLinha(linha({ t: 'cat' }))).toBeNull()
  })

  it('bloco sem chave devolve null', () => {
    expect(chaveDeLinha(linha({ t: 'tot' }))).toBeNull()
  })
})

describe('chaveDeBandeja', () => {
  it('usa categoria_id no caixa e a chave de texto na competência', () => {
    expect(chaveDeBandeja(orfa({ categoria_id: 99 }))).toBe('c:99')
    expect(chaveDeBandeja(orfa({ chave: 'Grupo XPTO · PartnerShip' }))).toBe('c:Grupo XPTO · PartnerShip')
  })

  it('NUNCA devolve null: sem identificador, cai no rótulo', () => {
    // A bandeja precisa aparecer de todo jeito — é literalmente o que ela serve para dizer.
    expect(chaveDeBandeja(orfa({ rotulo: 'Sem nome' }))).toBe('c:Sem nome')
  })
})

describe('os dois espaços de nome não colidem', () => {
  it('uma folha nunca produz a mesma chave que um bloco de mesmo nome', () => {
    const bloco = chaveDeLinha(linha({ t: 'sub', chave: 'RV' }))
    const folha = chaveDeLinha(linha({ t: 'cat', chave: 'RV' }))
    expect(bloco).toBe('b:RV')
    expect(folha).toBe('c:RV')
    expect(bloco).not.toBe(folha)
  })

  it('uma folha e uma órfã com a mesma identidade colidem DE PROPÓSITO', () => {
    // Não é descuido: se um par sai da bandeja para o de-para (ou volta), é a MESMA linha
    // economicamente, e a comparação entre anos tem de continuar casando.
    expect(chaveDeLinha(linha({ t: 'cat', chave: 'G · D' }))).toBe(chaveDeBandeja(orfa({ chave: 'G · D' })))
  })
})
