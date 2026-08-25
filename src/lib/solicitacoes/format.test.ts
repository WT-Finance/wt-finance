import { describe, it, expect, afterEach, vi } from 'vitest'
import { fmtValor, vencida, fmtDataBR, hojeSP, casaBuscaSolicitacao, maisRecentePrimeiro } from './format'
import type { Solicitacao } from './schemas'

// Cobre a coerção/limite de Solicitações (v4.17.0 / Balde 2). fmtValor agora usa o
// toNum canônico; vencida é date-only em fuso de São Paulo.

type Resposta = Parameters<typeof fmtValor>[0]
const r = (tipo_campo: string, valor: string | null): Resposta =>
  ({ campo_id: 1, rotulo: 'X', tipo_campo, valor } as unknown as Resposta)

describe('fmtValor — moeda via toNum canônico', () => {
  it('BR milhar+decimal e milhar puro', () => {
    expect(fmtValor(r('moeda', '8.840,00'))).toBe('R$ 8.840,00')
    expect(fmtValor(r('moeda', '1.234,56'))).toBe('R$ 1.234,56')
    expect(fmtValor(r('moeda', '12.345'))).toBe('R$ 12.345,00') // milhar puro → 12345
  })
  it('decimal US e fallback', () => {
    expect(fmtValor(r('moeda', '12.34'))).toBe('R$ 12,34')
    expect(fmtValor(r('moeda', 'abc'))).toBe('abc') // não-numérico → cru
    expect(fmtValor(r('moeda', null))).toBe('—')
  })
  it('data e texto', () => {
    expect(fmtValor(r('data', '2026-06-08'))).toBe('08/06/2026')
    expect(fmtValor(r('texto_curto', 'oi'))).toBe('oi')
  })
})

describe('fmtDataBR — sem deslocar o dia', () => {
  it('ISO e timestamptz → DD/MM/AAAA', () => {
    expect(fmtDataBR('2026-06-08')).toBe('08/06/2026')
    expect(fmtDataBR('2026-06-08T23:30:00+00:00')).toBe('08/06/2026') // date-only (slice 10)
    expect(fmtDataBR(null)).toBe('—')
  })
})

describe('vencida — date-only, fuso de São Paulo, cruzando o limite', () => {
  afterEach(() => vi.useRealTimers())

  it('hoje (SP) é a data local de SP, não a UTC', () => {
    // 2026-06-13T02:00Z = 2026-06-12 23:00 em São Paulo (UTC-3) → hoje = dia 12
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-13T02:00:00Z'))
    expect(hojeSP()).toBe('2026-06-12')
    // limite no dia 12 NÃO está vencido ainda (ainda é dia 12 em SP)
    expect(vencida('2026-06-12', 'aberta')).toBe(false)
    expect(vencida('2026-06-11', 'aberta')).toBe(true)
  })

  it('limite cruza para vencido quando a data-limite < hoje (SP)', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-13T12:00:00Z')) // SP = dia 13, 09:00
    expect(hojeSP()).toBe('2026-06-13')
    expect(vencida('2026-06-12', 'aberta')).toBe(true)  // ontem → vencida
    expect(vencida('2026-06-13', 'aberta')).toBe(false) // vence hoje → ainda não
    expect(vencida('2026-06-14', 'aberta')).toBe(false) // futuro
  })

  it('só conta como vencida se ABERTA', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    expect(vencida('2026-06-01', 'concluida')).toBe(false)
    expect(vencida('2026-06-01', 'cancelada')).toBe(false)
    expect(vencida('2026-06-01', 'rejeitada')).toBe(false)
  })
})

// ── Busca e ordem das listas (v5.7.2) ─────────────────────────────────────────
function sol(over: Partial<Solicitacao>): Solicitacao {
  return { id: 1, solicitante_email: 'a@x.com', criado_em: '2026-08-01T10:00:00Z', ...over } as Solicitacao
}

describe('casaBuscaSolicitacao — por número OU e-mail do solicitante', () => {
  const s = sol({ id: 1068, solicitante_email: 'kissia@welcometrips.com.br' })

  it('termo vazio ou só espaços não filtra nada', () => {
    expect(casaBuscaSolicitacao(s, '')).toBe(true)
    expect(casaBuscaSolicitacao(s, '   ')).toBe(true)
  })

  it('acha pelo número, com e sem "#", inclusive parcial', () => {
    expect(casaBuscaSolicitacao(s, '1068')).toBe(true)
    expect(casaBuscaSolicitacao(s, '#1068')).toBe(true)
    expect(casaBuscaSolicitacao(s, '106')).toBe(true)   // parcial
    expect(casaBuscaSolicitacao(s, '068')).toBe(true)   // parcial no meio
    expect(casaBuscaSolicitacao(s, '2222')).toBe(false)
  })

  it('acha pelo e-mail, sem diferenciar maiúsculas', () => {
    expect(casaBuscaSolicitacao(s, 'kissia')).toBe(true)
    expect(casaBuscaSolicitacao(s, 'KISSIA')).toBe(true)
    expect(casaBuscaSolicitacao(s, 'welcometrips')).toBe(true)
    expect(casaBuscaSolicitacao(s, 'outro@')).toBe(false)
  })

  // ⚠️ REGRESSÃO: a primeira versão extraía os dígitos de QUALQUER termo
  // (`termo.replace(/\D+/g,'')`), então buscar um e-mail que contém números também casava
  // por id — "ana2024@x.com" trazia de brinde a solicitação #2024. A busca por número só
  // acontece quando o termo INTEIRO é uma referência numérica.
  it('e-mail com dígitos NÃO vira busca por número', () => {
    const outra = sol({ id: 2024, solicitante_email: 'zzz@x.com' })
    expect(casaBuscaSolicitacao(outra, 'ana2024@x.com')).toBe(false)
    expect(casaBuscaSolicitacao(outra, '2024')).toBe(true)      // aí sim
  })

  it('e-mail nulo não quebra', () => {
    expect(casaBuscaSolicitacao(sol({ id: 7, solicitante_email: null }), 'qualquer')).toBe(false)
    expect(casaBuscaSolicitacao(sol({ id: 7, solicitante_email: null }), '7')).toBe(true)
  })
})

describe('maisRecentePrimeiro — data de CRIAÇÃO, decrescente', () => {
  it('ordena do mais recente para o mais antigo', () => {
    const lista = [
      sol({ id: 1, criado_em: '2026-08-01T10:00:00Z' }),
      sol({ id: 2, criado_em: '2026-08-24T09:00:00Z' }),
      sol({ id: 3, criado_em: '2026-08-10T23:59:00Z' }),
    ]
    expect([...lista].sort(maisRecentePrimeiro).map(s => s.id)).toEqual([2, 3, 1])
  })

  it('desempata de forma estável quando o instante é idêntico', () => {
    const lista = [
      sol({ id: 1, criado_em: '2026-08-01T10:00:00Z' }),
      sol({ id: 2, criado_em: '2026-08-01T10:00:00Z' }),
    ]
    expect([...lista].sort(maisRecentePrimeiro).map(s => s.id)).toEqual([1, 2])
  })
})
