import { describe, it, expect } from 'vitest'
import { normalizarSituacaoCliente, situacaoEnviavel, normalizarContrato, diasFaturamento, faturaNoDia } from './situacao-cliente'

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

describe('diasFaturamento / faturaNoDia (v6.5.2 — filtro "Faturar em")', () => {
  it('grafias diferentes da mesma lista dão os mesmos dias', () => {
    expect(diasFaturamento('01 / 10 / 20')).toEqual(['01', '10', '20'])
    expect(diasFaturamento('01/ 10 / 20')).toEqual(['01', '10', '20'])
    expect(diasFaturamento('01 / 10 ou 20')).toEqual(['01', '10', '20'])
    expect(diasFaturamento('1 / 15')).toEqual(['01', '15'])
  })

  it('vazio → nenhum dia; filtro por dia casa só quem cita o dia', () => {
    expect(diasFaturamento(null)).toEqual([])
    expect(diasFaturamento('')).toEqual([])
    expect(faturaNoDia('01 / 10 / 20', '10')).toBe(true)
    expect(faturaNoDia('01 / 15', '10')).toBe(false)
    expect(faturaNoDia('10', '01')).toBe(false)
    expect(faturaNoDia(null, '01')).toBe(false)
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
