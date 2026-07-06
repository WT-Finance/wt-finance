import { describe, it, expect, vi } from 'vitest'
// customers.ts importa './client' (server-only) — neutralizado no vitest (padrão do projeto).
vi.mock('server-only', () => ({}))
import { escolherEmailFiscal } from './customers'

describe('escolherEmailFiscal — cadeia raw.pessoas → fallback do Cadastro', () => {
  it('pessoas válido → usa o de pessoas (fallback ignorado)', () => {
    expect(escolherEmailFiscal('a@x.com', 'b@y.com')).toBe('a@x.com')
  })
  it('pessoas ausente/vazio → cai para o fallback do cadastro', () => {
    expect(escolherEmailFiscal(null, 'b@y.com')).toBe('b@y.com')
    expect(escolherEmailFiscal('', 'b@y.com')).toBe('b@y.com')
    expect(escolherEmailFiscal(undefined, 'b@y.com')).toBe('b@y.com')
  })
  it("pessoas com ';' (multi-e-mail) é INVÁLIDO → cai para o fallback", () => {
    expect(escolherEmailFiscal('a@x.com; b@y.com', 'c@z.com')).toBe('c@z.com')
  })
  it('nenhum válido → null (segue sem e-mail; o Asaas valida, como hoje)', () => {
    expect(escolherEmailFiscal(null, null)).toBeNull()
    expect(escolherEmailFiscal('naoemail', 'tambemnao')).toBeNull()
    expect(escolherEmailFiscal('a@x; b@y', null)).toBeNull() // pessoas inválido + sem fallback
  })
  it('trima o e-mail escolhido', () => {
    expect(escolherEmailFiscal('  a@x.com  ', null)).toBe('a@x.com')
    expect(escolherEmailFiscal(null, '  b@y.com  ')).toBe('b@y.com')
  })
})
