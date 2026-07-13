import { describe, it, expect } from 'vitest'
import { resolverPeriodoMetas, isPresetMetas, type PresetMetas } from './periodo-metas'

// Períodos calendário-fixos do Acompanhamento de Metas: o corte é o mês/trimestre/
// semestre/ano-calendário CORRENTE (que contém hoje), nunca janela móvel.

describe('resolverPeriodoMetas — cortes calendário', () => {
  const casos: Array<[PresetMetas, string, string, string, string]> = [
    // [preset, hoje, from, to, label]
    ['mensal',     '2026-07-10', '2026-07-01', '2026-07-31', 'Julho de 2026'],
    ['mensal',     '2026-02-05', '2026-02-01', '2026-02-28', 'Fevereiro de 2026'],
    ['mensal',     '2028-02-10', '2028-02-01', '2028-02-29', 'Fevereiro de 2028'], // bissexto
    ['trimestral', '2026-07-10', '2026-07-01', '2026-09-30', '3º trimestre de 2026'],
    ['trimestral', '2026-01-01', '2026-01-01', '2026-03-31', '1º trimestre de 2026'],
    ['trimestral', '2026-12-31', '2026-10-01', '2026-12-31', '4º trimestre de 2026'],
    ['semestral',  '2026-07-10', '2026-07-01', '2026-12-31', '2º semestre de 2026'],
    ['semestral',  '2026-06-30', '2026-01-01', '2026-06-30', '1º semestre de 2026'],
    ['anual',      '2026-07-10', '2026-01-01', '2026-12-31', '2026'],
  ]

  it.each(casos)('%s @ %s → %s..%s (%s)', (preset, hoje, from, to, label) => {
    const [y, m, d] = hoje.split('-').map(Number)
    const r = resolverPeriodoMetas(preset, new Date(y, m - 1, d))
    expect(r.from).toBe(from)
    expect(r.to).toBe(to)
    expect(r.label).toBe(label)
  })

  it('isPresetMetas valida a união (URL não confiável)', () => {
    expect(isPresetMetas('mensal')).toBe(true)
    expect(isPresetMetas('anual')).toBe(true)
    expect(isPresetMetas('este-ano')).toBe(false)
    expect(isPresetMetas(null)).toBe(false)
    expect(isPresetMetas('')).toBe(false)
  })
})
