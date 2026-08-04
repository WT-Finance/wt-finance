import { describe, it, expect } from 'vitest'
import { sanitizarNomeArquivo } from './nome-arquivo'

// Escritos com escape \uXXXX de propósito: o teste distingue NFC de NFD, então não pode
// depender de editor/git preservarem a forma de normalização do literal no fonte.
const A_TIL = 'ã'     // "a" com til, pré-composto (Windows/Linux)
const COMB_TIL = '̃'  // til COMBINANTE (macOS manda "a" + este)
const C_CED = 'ç'     // "c" cedilha
const TRAVESSAO = '–' // en-dash: autocorreção do Word/Excel no lugar do hífen

/**
 * `isValidKey` do supabase/storage-api (src/storage/limits.ts). Replicado aqui porque é
 * ESTE o contrato que o helper existe para satisfazer — sem isso o teste vira asserção de
 * string e deixa de proteger contra a regressão real (`400 InvalidKey` no upload).
 * Note o `\w` sem a flag `u`: só [A-Za-z0-9_].
 */
const isValidKey = (k: string): boolean =>
  k.length > 0 && /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/.test(k)

describe('sanitizarNomeArquivo — a chave resultante é sempre válida no Storage', () => {
  // O caso vivo que originou o patch v5.4.3: o upload voltava
  // `Invalid key: tmp/<uuid>/Nota Fiscal - Bruna e João.pdf`.
  it(`aceita o nome do bug real (${A_TIL} em "Joao")`, () => {
    const nome = `Nota Fiscal - Bruna e Jo${A_TIL}o.pdf`
    expect(isValidKey(nome)).toBe(false)                       // o nome CRU é rejeitado
    expect(sanitizarNomeArquivo(nome)).toBe('Nota_Fiscal_-_Bruna_e_Joao.pdf')
  })

  it('trata a forma NFD do macOS (a + combinante) igual à NFC', () => {
    const nfd = `Jo${'a'}${COMB_TIL}o.pdf`
    expect(isValidKey(nfd)).toBe(false)
    expect(sanitizarNomeArquivo(nfd)).toBe('Joao.pdf')
    expect(sanitizarNomeArquivo(nfd)).toBe(sanitizarNomeArquivo(`Jo${A_TIL}o.pdf`))
  })

  it.each([
    [`Or${C_CED}amento.pdf`, 'Orcamento.pdf'],
    [`Comiss${A_TIL}o Wedding.pdf`, 'Comissao_Wedding.pdf'],
    ['NF #1234.pdf', 'NF__1234.pdf'],
    ['Recibo 100% pago.pdf', 'Recibo_100__pago.pdf'],
    [`Fatura ${TRAVESSAO} marco.pdf`, 'Fatura___marco.pdf'],
    ['Contrato (assinado).pdf', 'Contrato__assinado_.pdf'],
  ])('sanitiza %j → %j', (entrada, esperado) => {
    expect(sanitizarNomeArquivo(entrada)).toBe(esperado)
  })

  it('não mexe em nome que já é seguro', () => {
    expect(sanitizarNomeArquivo('nota_fiscal-2026.01.pdf')).toBe('nota_fiscal-2026.01.pdf')
  })

  it('nome vazio cai no fallback (chave vazia é inválida no Storage)', () => {
    expect(sanitizarNomeArquivo('')).toBe('arquivo')
    expect(isValidKey('')).toBe(false)
  })

  it('nome sem nenhum caractere latino não vira string vazia', () => {
    const cjk = sanitizarNomeArquivo('发票.pdf')
    expect(cjk).toBe('__.pdf')
    expect(cjk.length).toBeGreaterThan(0)
  })

  it('limita o comprimento a 100', () => {
    expect(sanitizarNomeArquivo('x'.repeat(250))).toHaveLength(100)
  })

  // Invariante central: qualquer nome, por hostil que seja, produz uma chave que o
  // Storage aceita — inclusive montada no formato real usado pelas Server Actions.
  it('qualquer entrada produz chave aceita pelo Storage', () => {
    const hostis = [
      `Nota Fiscal - Bruna e Jo${A_TIL}o.pdf`,
      `Or${C_CED}amento 100% #1 ${TRAVESSAO} v2 [final].xlsx`,
      'a\\b/c:d*e?f"g<h>i|j.pdf',
      '发票 — 2026.pdf',
      '  espacos  nas  pontas  .pdf',
      'emoji 😀 no nome.png',
      '',
      'y'.repeat(300),
    ]
    for (const nome of hostis) {
      const chave = `tmp/2bb4b2c1-0000-4000-8000-000000000000/${sanitizarNomeArquivo(nome)}`
      expect(isValidKey(chave), `chave inválida para ${JSON.stringify(nome)}`).toBe(true)
    }
  })
})
