import { describe, it, expect } from 'vitest'
import { rotuloBloco, semCaixaAlta } from './rotulo-bloco'

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

// ── v5.7.0: o prefixo DUPLO `(+/-)` ───────────────────────────────────────────
// Regressão real: a classe antiga aceitava UM caractere de sinal entre parênteses,
// então nem `(+/-)` (a forma nova, padronizada) nem `(+ / -)` (a forma que estava
// gravada no ONOP_H desde o seed) eram removidos — o prefixo vazava inteiro para os
// rótulos da Decomposição. Depois da v5.7.0 são três os blocos `(+/-)`: FIN (o novo
// Resultado Financeiro), INV_H e ONOP_H.
describe('rotuloBloco — prefixo duplo (+/-) e os rótulos padronizados da v5.7.0', () => {
  const casosV570: [string, string][] = [
    // Forma NOVA, padronizada pela migration da v5.7.0.
    ['(+/-) Resultado Financeiro', 'Resultado Financeiro'],
    ['(+/-) INVESTIMENTOS, IMOBILIZADO E EMPRÉSTIMOS', 'INVESTIMENTOS, IMOBILIZADO E EMPRÉSTIMOS'],
    ['(+/-) OUTRAS RECEITAS E DESPESAS NÃO OPERACIONAIS', 'OUTRAS RECEITAS E DESPESAS NÃO OPERACIONAIS'],
    // Forma HISTÓRICA (com espaços em volta da barra) — o que o ONOP_H tinha gravado
    // antes da normalização. Segue aceita: a função limpa o histórico, não só o futuro.
    ['(+ / -) OUTRAS RECEITAS E DESPESAS NÃO OPERACIONAIS', 'OUTRAS RECEITAS E DESPESAS NÃO OPERACIONAIS'],
    // Totalizadores que saíram do `=` solto para a fôrma `(=)`.
    ['(=) LUCRO BRUTO', 'LUCRO BRUTO'],
    ['(=) RESULTADO DO EXERCÍCIO', 'RESULTADO DO EXERCÍCIO'],
    // Subgrupos que ganharam operador.
    ['(-) Custo dos Serviços Prestados', 'Custo dos Serviços Prestados'],
    ['(+) Receita de Vendas', 'Receita de Vendas'],
    ['(-) Distribuição de Lucros', 'Distribuição de Lucros'],
  ]

  it.each(casosV570)('%s → %s', (entrada, esperado) => {
    expect(rotuloBloco(entrada)).toBe(esperado)
  })

  it('continua idempotente com o prefixo duplo', () => {
    for (const [entrada] of casosV570) {
      const uma = rotuloBloco(entrada)
      expect(rotuloBloco(uma)).toBe(uma)
    }
  })

  // A barra passou a fazer parte do prefixo — então vale cravar que uma barra NO MEIO
  // do rótulo continua intocada. Este é um rótulo real do de-para (override do MKT).
  it('barra NO MEIO do texto é preservada — a âncora ^ protege', () => {
    expect(rotuloBloco('Agência de Marketing / Terceiros de Mkt'))
      .toBe('Agência de Marketing / Terceiros de Mkt')
  })

  // Só o prefixo sai: um `(+/-)` que apareça adiante no texto não é prefixo.
  it('remove APENAS o prefixo, nunca uma ocorrência posterior', () => {
    expect(rotuloBloco('(+/-) Resultado (+/-) Financeiro')).toBe('Resultado (+/-) Financeiro')
  })
})

// ── semCaixaAlta (v5.8.1) ─────────────────────────────────────────────────────
// A conversão só é segura porque preserva SIGLAS e só age em strings inteiramente
// maiúsculas. Os dois riscos que os testes travam: mangular sigla ("RH" → "Rh") e
// "corrigir" um rótulo que já estava certo.

describe('semCaixaAlta — caixa alta vira capitalização de leitura', () => {
  it('converte o caso que motivou a função', () => {
    expect(semCaixaAlta('IMPOSTOS E DEDUÇÕES DA RECEITA BRUTA'))
      .toBe('Impostos e Deduções da Receita Bruta')
  })

  it('PRESERVA sigla — o risco real do title-case cego', () => {
    expect(semCaixaAlta('DESPESAS OPERACIONAIS DE RH')).toBe('Despesas Operacionais de RH')
    // "antes" é ADVÉRBIO, não preposição: fica capitalizado, como o title-case do resto
    // da árvore ("Custo dos Serviços Prestados"). Só `do` e `e` descem.
    expect(semCaixaAlta('RESULTADO ANTES DO IR E CSLL')).toBe('Resultado Antes do IR e CSLL')
  })

  it('preposição no MEIO fica minúscula; na PRIMEIRA posição, não', () => {
    expect(semCaixaAlta('DESPESAS COM INVESTIMENTOS E EMPRÉSTIMOS'))
      .toBe('Despesas com Investimentos e Empréstimos')
    expect(semCaixaAlta('DA RECEITA')).toBe('Da Receita')
  })

  it('rótulo que JÁ tem minúscula passa intocado — a função não "corrige" o certo', () => {
    for (const r of [
      'Despesas Marketing',
      'Custo dos Serviços Prestados',
      'Agência de Marketing / Terceiros de Mkt',
      'Distribuição de Lucros',
    ]) {
      expect(semCaixaAlta(r)).toBe(r)
    }
  })

  it('é idempotente', () => {
    const uma = semCaixaAlta('IMPOSTOS E DEDUÇÕES DA RECEITA BRUTA')
    expect(semCaixaAlta(uma)).toBe(uma)
  })

  it('não quebra em string vazia nem em texto sem letra', () => {
    expect(semCaixaAlta('')).toBe('')
    expect(semCaixaAlta('123 / 456')).toBe('123 / 456')
  })

  it('acento é rebaixado corretamente em pt-BR', () => {
    expect(semCaixaAlta('DEDUÇÕES')).toBe('Deduções')
  })
})
