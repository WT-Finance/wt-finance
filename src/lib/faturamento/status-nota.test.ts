import { describe, it, expect } from 'vitest'
import { classificarStatusNota, labelStatusNota, labelClasseNota } from './status-nota'

describe('classificarStatusNota — fail-safe INVERTIDO (desconhecido = falhou, nunca "processando")', () => {
  it('AUTHORIZED → autorizada', () => {
    expect(classificarStatusNota('AUTHORIZED')).toBe('autorizada')
    expect(classificarStatusNota('authorized')).toBe('autorizada')
    expect(classificarStatusNota(' Authorized ')).toBe('autorizada')
  })

  it('estados de andamento CONHECIDOS → processando', () => {
    for (const s of ['SCHEDULED', 'SYNCHRONIZED', 'PENDING', 'PROCESSING', 'IN_PROCESS', 'processing']) {
      expect(classificarStatusNota(s)).toBe('processando')
    }
  })

  it('vazio/null/undefined (sem info ainda, logo após emitir) → processando', () => {
    expect(classificarStatusNota('')).toBe('processando')
    expect(classificarStatusNota(null)).toBe('processando')
    expect(classificarStatusNota(undefined)).toBe('processando')
    expect(classificarStatusNota('   ')).toBe('processando')
  })

  it('cancelamentos → cancelada', () => {
    for (const s of ['CANCELED', 'CANCELLED', 'CANCEL_REQUESTED', 'CANCELLATION_DENIED']) {
      expect(classificarStatusNota(s)).toBe('cancelada')
    }
  })

  it('ERROR e QUALQUER status desconhecido → falhou (o coração do fix: não mascara rejeição)', () => {
    for (const s of ['ERROR', 'error', 'REJECTED', 'DENIED', 'FAILED', 'INVALID', 'algo_que_a_prefeitura_devolveu']) {
      expect(classificarStatusNota(s)).toBe('falhou')
    }
  })
})

describe('rótulos PT-BR', () => {
  it('labelClasseNota mapeia cada classe', () => {
    expect(labelClasseNota('autorizada')).toBe('autorizada')
    expect(labelClasseNota('processando')).toBe('processando')
    expect(labelClasseNota('cancelada')).toBe('cancelada')
    expect(labelClasseNota('falhou')).toBe('falhou')
  })
  it('labelStatusNota nunca devolve status cru em inglês para desconhecido', () => {
    expect(labelStatusNota('REJECTED')).toBe('falhou')
    expect(labelStatusNota('AUTHORIZED')).toBe('autorizada')
    expect(labelStatusNota('PROCESSING')).toBe('processando')
  })
})
