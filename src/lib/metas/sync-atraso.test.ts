import { describe, it, expect } from 'vitest'
import { sincronizacaoAtrasada, LIMITE_ATRASO_MS } from './sync-atraso'

// Âncora: "agora" fixo (não usa Date.now → determinístico).
const AGORA = Date.parse('2026-07-15T16:00:00Z')
const min = (n: number) => new Date(AGORA - n * 60_000).toISOString()

describe('sincronizacaoAtrasada', () => {
  it('LIMITE_ATRASO_MS = 45min (3 ticks de 15min)', () => {
    expect(LIMITE_ATRASO_MS).toBe(45 * 60_000)
  })

  const casos: Array<[string, string | null | undefined, boolean]> = [
    ['null → não atrasada (rótulo nem aparece)', null, false],
    ['undefined → não atrasada', undefined, false],
    ['string vazia → não atrasada', '', false],
    ['data inválida → não atrasada', 'não-é-data', false],
    ['sincronizou agora → não atrasada', min(0), false],
    ['há 15min (1 tick) → não atrasada', min(15), false],
    ['há 44min → não atrasada', min(44), false],
    ['exatamente 45min (limite, usa >) → não atrasada', min(45), false],
    ['há 46min → ATRASADA', min(46), true],
    ['há 2h → ATRASADA', min(120), true],
  ]
  it.each(casos)('%s', (_label, iso, esperado) => {
    expect(sincronizacaoAtrasada(iso, AGORA)).toBe(esperado)
  })

  it('timestamptz com offset é comparado como instante (fuso-agnóstico)', () => {
    // Mesmo instante que "há 60min" escrito em -03:00 → atrasada.
    const isoSP = new Date(AGORA - 60 * 60_000).toISOString().replace('Z', '+00:00')
    expect(sincronizacaoAtrasada(isoSP, AGORA)).toBe(true)
  })
})
