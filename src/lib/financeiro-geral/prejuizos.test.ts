import { describe, expect, it } from 'vitest'
import { bandejaDosAnos, resumoDoAno } from './prejuizos'
import { prejuizosSchema, type Prejuizos } from './schemas'
import type { LeituraAno } from './tipos'

const meses = (total: number) => [total, ...Array.from({ length: 11 }, () => 0)]
const serie = (total: number) => ({ meses: meses(total), total })

function prej(ano: number, over: Record<string, unknown> = {}): Prejuizos {
  return prejuizosSchema.parse({
    ano, relacao: ano === 2026 ? 'corrente' : 'fechado', mes_corrente: ano === 2026 ? 10 : null,
    prejuizo: serie(-205629.09), reversao: serie(80119.24), liquido: serie(-125509.85),
    ano_anterior_ytd: { prejuizo: -150000, reversao: 50000, liquido: -100000 },
    bandeja: [],
    atualizado_em: '2026-10-15T10:00:00-03:00',
    ...over,
  })
}
const ok = (ano: number, over?: Record<string, unknown>): LeituraAno<Prejuizos> =>
  ({ ano, leitura: { ok: true, dados: prej(ano, over) } })

describe('resumoDoAno — bruto + reversão + líquido', () => {
  it('traz os três totais no sinal da DRE e o rótulo com "*" no ano parcial', () => {
    const r = resumoDoAno(prej(2026))
    expect(r).toMatchObject({ ano: 2026, rotulo: '2026*', prejuizo: -205629.09, reversao: 80119.24, liquido: -125509.85 })
    expect(resumoDoAno(prej(2025)).rotulo).toBe('2025')
  })

  it('o líquido confere com prejuízo + reversão (caso real de 2026)', () => {
    expect(resumoDoAno(prej(2026)).liquidoConfere).toBe(true)
    expect(resumoDoAno(prej(2026, { liquido: serie(-125000) })).liquidoConfere).toBe(false)
  })

  it('Δ do prejuízo bruto: aumentou o prejuízo (mais negativo) = desfavorável', () => {
    const r = resumoDoAno(prej(2026))
    expect(r.deltaPrejuizo.pct).toBeCloseTo(((-205629.09 + 150000) / 150000) * 100, 6)
    expect(r.deltaPrejuizo.sentido).toBe('desfavoravel')
  })

  it('ano anterior sem prejuízo (zero) ou ausente → sem Δ, nunca Infinity', () => {
    expect(resumoDoAno(prej(2026, { ano_anterior_ytd: { prejuizo: 0, reversao: 0, liquido: 0 } })).deltaPrejuizo.pct).toBeNull()
    expect(resumoDoAno(prej(2026, { ano_anterior_ytd: null })).deltaPrejuizo.pct).toBeNull()
  })

  it('ano sem prejuízo nenhum: zeros, sem quebrar', () => {
    const r = resumoDoAno(prej(2025, { prejuizo: serie(0), reversao: serie(0), liquido: serie(0) }))
    expect(r).toMatchObject({ prejuizo: 0, reversao: 0, liquido: 0, liquidoConfere: true })
  })
})

describe('bandejaDosAnos — categoria de prejuízo/perda fora do mapa é VISÍVEL', () => {
  it('vazia quando o mapa conhece tudo (e quando o array vem NULL do Postgres)', () => {
    expect(bandejaDosAnos([ok(2025), ok(2026)])).toEqual([])
    expect(bandejaDosAnos([ok(2025, { bandeja: null })])).toEqual([])
  })

  it('une a mesma categoria entre anos e soma', () => {
    const b = bandejaDosAnos([
      ok(2026, { bandeja: [{ categoria_id: 9, rotulo: 'Perdas diversas', total: -10.5 }] }),
      ok(2025, { bandeja: [{ categoria_id: 9, rotulo: 'Perdas diversas', total: -4.25 }, { categoria_id: 7, rotulo: 'Prejuízo X', total: -1 }] }),
    ])
    expect(b).toHaveLength(2)
    const perdas = b.find(x => x.categoriaId === 9)!
    expect(perdas.porAno).toEqual([{ ano: 2025, total: -4.25 }, { ano: 2026, total: -10.5 }])
    expect(perdas.total).toBe(-14.75)
  })

  it('ano que falhou não entra (nem derruba os outros)', () => {
    const b = bandejaDosAnos([
      { ano: 2025, leitura: { ok: false } },
      ok(2026, { bandeja: [{ categoria_id: 1, rotulo: 'A', total: -2 }] }),
    ])
    expect(b.map(x => x.categoriaId)).toEqual([1])
  })
})
