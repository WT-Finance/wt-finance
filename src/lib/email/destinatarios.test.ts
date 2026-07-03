import { describe, it, expect } from 'vitest'
import { emailValido, splitDestinatarios } from './destinatarios'

// Módulo ISOMÓRFICO (sem server-only) — a MESMA regra usada no servidor e na célula editável
// do modal. Trava o comportamento para que os dois lados nunca divirjam.

describe('emailValido — mesma regex de asaas/client', () => {
  it('aceita e-mail simples', () => {
    expect(emailValido('a@x.com')).toBe(true)
    expect(emailValido(' a@x.com ')).toBe(true) // trima
  })
  it('rejeita vazio/null/sem-arroba/sem-domínio', () => {
    expect(emailValido('')).toBe(false)
    expect(emailValido(null)).toBe(false)
    expect(emailValido(undefined)).toBe(false)
    expect(emailValido('naoemail')).toBe(false)
    expect(emailValido('a@b')).toBe(false)     // sem TLD
    expect(emailValido('a b@x.com')).toBe(false) // espaço
  })
})

describe('splitDestinatarios — split ; + trim + validação + dedupe', () => {
  it('separa válidos e ignora vazios', () => {
    expect(splitDestinatarios('a@x.com; b@y.com')).toEqual({ validos: ['a@x.com', 'b@y.com'], invalidos: [] })
  })
  it('inválido no meio → invalidos, mantém os válidos', () => {
    const r = splitDestinatarios('a@x.com; ; naoemail; c@z.com')
    expect(r.validos).toEqual(['a@x.com', 'c@z.com'])
    expect(r.invalidos).toEqual(['naoemail'])
  })
  it('dedupe preservando ordem', () => {
    expect(splitDestinatarios('a@x.com; a@x.com; b@y.com').validos).toEqual(['a@x.com', 'b@y.com'])
  })
  it('vazio/null → nada', () => {
    expect(splitDestinatarios('')).toEqual({ validos: [], invalidos: [] })
    expect(splitDestinatarios(null)).toEqual({ validos: [], invalidos: [] })
  })
})
