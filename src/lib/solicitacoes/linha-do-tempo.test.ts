import { describe, it, expect } from 'vitest'
import { linhaDoTempo } from './linha-do-tempo'

// Fixture ilustrativa — módulo puro.
const base = {
  criado_em: '2026-11-16T12:00:00Z', solicitante_email: 'ana@x.com',
  aprovado_em: null, aprovado_por_email: null,
  status: 'aberta' as const, decidido_em: null, decidido_por_email: null, justificativa: null,
  notas: [] as { id: number; autor_email: string | null; texto: string; criado_em: string }[],
}

describe('linhaDoTempo — movimentações + comentários (v6.5.3)', () => {
  it('aberta sem nada: só a abertura', () => {
    expect(linhaDoTempo(base).map(e => [e.tipo, e.ator])).toEqual([['abertura', 'ana@x.com']])
  })

  it('intercala por instante: abertura, nota, aprovação, nota, desfecho com justificativa', () => {
    const r = linhaDoTempo({
      ...base,
      aprovado_em: '2026-11-16T19:42:00Z', aprovado_por_email: 'yan@x.com',
      status: 'rejeitada', decidido_em: '2026-11-18T10:00:00Z', decidido_por_email: 'yan@x.com', justificativa: 'falta a NF',
      notas: [
        { id: 2, autor_email: 'ana@x.com', texto: 'segue o valor', criado_em: '2026-11-17T09:00:00Z' },
        { id: 1, autor_email: 'yan@x.com', texto: 'qual o valor?', criado_em: '2026-11-16T13:00:00Z' },
      ],
    })
    expect(r.map(e => e.tipo)).toEqual(['abertura', 'nota', 'aprovacao', 'nota', 'rejeicao'])
    expect(r[4]).toMatchObject({ ator: 'yan@x.com', texto: 'falta a NF' })
    expect(r[1].texto).toBe('qual o valor?')
  })

  it('a aprovação sobrevive ao desfecho (não é derivada do status)', () => {
    const r = linhaDoTempo({ ...base, aprovado_em: '2026-11-17T00:00:00Z', aprovado_por_email: 'g@x.com',
      status: 'concluida', decidido_em: '2026-11-18T00:00:00Z', decidido_por_email: 'g@x.com' })
    expect(r.map(e => e.tipo)).toEqual(['abertura', 'aprovacao', 'conclusao'])
  })

  it('aprovada não é desfecho; só conclusão/rejeição/cancelamento entram como tal', () => {
    const r = linhaDoTempo({ ...base, status: 'aprovada', aprovado_em: '2026-11-17T00:00:00Z', aprovado_por_email: 'g@x.com' })
    expect(r.map(e => e.tipo)).toEqual(['abertura', 'aprovacao'])
  })

  it('justificativa só acompanha a rejeição', () => {
    const r = linhaDoTempo({ ...base, status: 'cancelada', decidido_em: '2026-11-18T00:00:00Z', decidido_por_email: 'ana@x.com', justificativa: 'resto antigo' })
    expect(r.at(-1)).toMatchObject({ tipo: 'cancelamento', texto: null })
  })

  it('nota depois de encerrada vai para o fim; desfecho sem instante (dado antigo) vai por último', () => {
    const encerrada = linhaDoTempo({ ...base, status: 'concluida', decidido_em: '2026-11-18T00:00:00Z', decidido_por_email: 'g@x.com',
      notas: [{ id: 9, autor_email: 'ana@x.com', texto: 'obrigada', criado_em: '2026-11-19T00:00:00Z' }] })
    expect(encerrada.map(e => e.tipo)).toEqual(['abertura', 'conclusao', 'nota'])
    const semInstante = linhaDoTempo({ ...base, status: 'cancelada', decidido_por_email: 'ana@x.com',
      notas: [{ id: 9, autor_email: null, texto: 'x', criado_em: '2026-11-19T00:00:00Z' }] })
    expect(semInstante.map(e => [e.tipo, e.ator])).toEqual([['abertura', 'ana@x.com'], ['nota', '—'], ['cancelamento', 'ana@x.com']])
  })

  it('instante empatado segue o ciclo de vida: a nota antes do desfecho', () => {
    const t = '2026-11-18T00:00:00Z'
    const r = linhaDoTempo({ ...base, status: 'concluida', decidido_em: t, decidido_por_email: 'g@x.com',
      notas: [{ id: 1, autor_email: 'g@x.com', texto: 'pago', criado_em: t }] })
    expect(r.map(e => e.tipo)).toEqual(['abertura', 'nota', 'conclusao'])
  })
})
