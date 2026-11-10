import { describe, it, expect } from 'vitest'
import { normalizarSituacaoCliente, situacaoEnviavel, normalizarContrato } from './situacao-cliente'

describe('normalizarSituacaoCliente (v6.5.2)', () => {
  it('reconhece os três estados da planilha, em qualquer caixa/acento', () => {
    expect(normalizarSituacaoCliente('ATIVO')).toBe('ativo')
    expect(normalizarSituacaoCliente(' Ativo ')).toBe('ativo')
    expect(normalizarSituacaoCliente('INATIVO')).toBe('inativo')
    expect(normalizarSituacaoCliente('EVENTUAL')).toBe('eventual')
    expect(normalizarSituacaoCliente('Eventual')).toBe('eventual')
  })

  it('"inativo" não vira "ativo" (contém "ativ")', () => {
    expect(normalizarSituacaoCliente('Inativo')).toBe('inativo')
  })

  it('vazio ou desconhecido → null', () => {
    expect(normalizarSituacaoCliente(null)).toBeNull()
    expect(normalizarSituacaoCliente('')).toBeNull()
    expect(normalizarSituacaoCliente('suspenso')).toBeNull()
  })

  it('FAIL-CLOSED: texto que só CONTÉM "ativ" não vira ativo (receberia e-mail de fatura)', () => {
    expect(normalizarSituacaoCliente('desativado')).toBeNull()
    expect(normalizarSituacaoCliente('não ativo')).toBeNull()
    expect(normalizarSituacaoCliente('ativo (suspenso)')).toBeNull()
  })
})

describe('normalizarContrato (v6.5.2)', () => {
  it('Sim/Não em qualquer caixa/acento, e as abreviações S/N', () => {
    expect(normalizarContrato('Sim')).toBe('sim')
    expect(normalizarContrato(' SIM ')).toBe('sim')
    expect(normalizarContrato('S')).toBe('sim')
    expect(normalizarContrato('Não')).toBe('nao')
    expect(normalizarContrato('NAO')).toBe('nao')
    expect(normalizarContrato('n')).toBe('nao')
  })

  it('vazio ou desconhecido → null (nunca valor fora do CHECK da 0307)', () => {
    expect(normalizarContrato(null)).toBeNull()
    expect(normalizarContrato('')).toBeNull()
    expect(normalizarContrato('talvez')).toBeNull()
  })
})

describe('situacaoEnviavel (v6.5.2)', () => {
  it('ativo e eventual recebem a fatura por e-mail', () => {
    expect(situacaoEnviavel('ativo')).toBe(true)
    expect(situacaoEnviavel('eventual')).toBe(true)
    expect(situacaoEnviavel(' Eventual ')).toBe(true)
  })

  it('inativo, vazio e desconhecido não recebem', () => {
    expect(situacaoEnviavel('inativo')).toBe(false)
    expect(situacaoEnviavel(null)).toBe(false)
    expect(situacaoEnviavel('')).toBe(false)
    expect(situacaoEnviavel('suspenso')).toBe(false)
  })
})
