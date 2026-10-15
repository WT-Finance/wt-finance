import { describe, expect, it } from 'vitest'
import {
  contasDosAnos, diasEntre, diasSemAntecipar, indicadoresDoAno, pausaAtualEhMaior, rotuloDias,
} from './antecipacoes'
import { antecipacoesSchema, type Antecipacoes } from './schemas'

const mes = (volume = 0, desconto = 0, n = 0) => ({ volume, liquido: volume - desconto, desconto, n })

function leitura(over: Partial<Antecipacoes> = {}): Antecipacoes {
  return antecipacoesSchema.parse({
    ano: 2026,
    relacao: 'corrente',
    mes_corrente: 10,
    meses: [mes(500000, 10000, 3), ...Array.from({ length: 11 }, () => mes())],
    total: { volume: 1343423.51, liquido: 1300000, desconto: 43423.51, n: 14, desconto_pct: 3.2322 },
    ano_anterior_ytd: { volume: 1000000, desconto: 30000, n: 10 },
    por_conta: [{ conta: 'Blimboo', volume: 454516.68, desconto: 1, n: 4 }, { conta: 'Asaas', volume: 888906.83, desconto: 2, n: 10 }],
    ultima_data: '2026-10-05',
    dias_desde_ultima: 10,
    maior_intervalo_ano: { dias: 45, de: '2026-03-01', ate: '2026-04-15' },
    atualizado_em: '2026-10-15T10:00:00-03:00',
    ...over,
  })
}

describe('diasEntre / rotuloDias', () => {
  it('calendário puro, sem fuso nem horário de verão', () => {
    expect(diasEntre('2026-10-05', '2026-10-15')).toBe(10)
    expect(diasEntre('2026-02-27', '2026-03-01')).toBe(2)
    expect(diasEntre('2025-12-31', '2026-01-01')).toBe(1)
    expect(diasEntre('2026-10-15', '2026-10-15')).toBe(0)
  })
  it('pluraliza', () => {
    expect(rotuloDias(0)).toBe('hoje')
    expect(rotuloDias(1)).toBe('1 dia')
    expect(rotuloDias(12)).toBe('12 dias')
  })
})

describe('diasSemAntecipar — dias desde a última antecipação', () => {
  it('usa o número da RPC (hoje de SP calculado no banco)', () => {
    expect(diasSemAntecipar({ dias_desde_ultima: 10, ultima_data: '2026-10-05' }, '2026-12-31')).toBe(10)
  })
  it('sem o número, deriva da última data e do hoje do servidor', () => {
    expect(diasSemAntecipar({ dias_desde_ultima: null, ultima_data: '2026-10-05' }, '2026-10-15')).toBe(10)
  })
  it('nunca houve antecipação → null (não zero: zero seria "antecipou hoje")', () => {
    expect(diasSemAntecipar({ dias_desde_ultima: null, ultima_data: null }, '2026-10-15')).toBeNull()
  })
  it('nunca negativo', () => {
    expect(diasSemAntecipar({ dias_desde_ultima: -2, ultima_data: null }, '2026-10-15')).toBe(0)
    expect(diasSemAntecipar({ dias_desde_ultima: null, ultima_data: '2026-10-20' }, '2026-10-15')).toBe(0)
  })
})

describe('pausaAtualEhMaior', () => {
  const maior = { dias: 45, de: '2026-03-01', ate: '2026-04-15' }
  it('só quando a pausa em curso passa a maior do ano', () => {
    expect(pausaAtualEhMaior(46, maior)).toBe(true)
    expect(pausaAtualEhMaior(45, maior)).toBe(false)
    expect(pausaAtualEhMaior(10, maior)).toBe(false)
    expect(pausaAtualEhMaior(null, maior)).toBe(false)
    expect(pausaAtualEhMaior(100, null)).toBe(false)
  })
})

describe('indicadoresDoAno', () => {
  it('volume, desconto (contexto), desconto %, nº e Δ do volume sem juízo', () => {
    const i = indicadoresDoAno(leitura())
    expect(i).toMatchObject({ ano: 2026, volume: 1343423.51, desconto: 43423.51, n: 14 })
    expect(i.descontoPct).toBeCloseTo(3.2322, 4)
    expect(i.deltaVolume.pct).toBeCloseTo(34.342351, 5)
    expect(i.deltaVolume.sentido).toBeNull()
    expect(i.maiorIntervalo?.dias).toBe(45)
  })
  it('desconto % ausente na RPC → derivado do volume; sem volume → null', () => {
    const base = leitura()
    const a = indicadoresDoAno({ ...base, total: { ...base.total, desconto_pct: null } })
    expect(a.descontoPct).toBeCloseTo((43423.51 / 1343423.51) * 100, 6)
    const b = indicadoresDoAno({ ...base, total: { volume: 0, liquido: 0, desconto: 0, n: 0, desconto_pct: null } })
    expect(b.descontoPct).toBeNull()
  })
  it('sem ano anterior → sem Δ', () => {
    expect(indicadoresDoAno(leitura({ ano_anterior_ytd: null })).deltaVolume.pct).toBeNull()
    expect(indicadoresDoAno(leitura({ ano_anterior_ytd: undefined })).deltaVolume.pct).toBeNull()
    expect(indicadoresDoAno(leitura({ ano_anterior_ytd: { volume: 0, desconto: 0, n: 0 } })).deltaVolume.pct).toBeNull()
  })
})

describe('contasDosAnos', () => {
  it('união das contas dos anos, em ordem alfabética', () => {
    expect(contasDosAnos([leitura(), leitura({ por_conta: [{ conta: 'Zeta', volume: 1, desconto: 0, n: 1 }] })]))
      .toEqual(['Asaas', 'Blimboo', 'Zeta'])
    expect(contasDosAnos([])).toEqual([])
  })
})

describe('schema: ano sem antecipação (arrays NULL, datas NULL) passa', () => {
  it('estado vazio do ano', () => {
    const r = antecipacoesSchema.safeParse({
      ano: 2027, relacao: 'futuro', mes_corrente: null,
      meses: Array.from({ length: 12 }, () => mes()),
      total: { volume: 0, liquido: 0, desconto: 0, n: 0, desconto_pct: null },
      por_conta: null, ultima_data: null, dias_desde_ultima: null, maior_intervalo_ano: null, atualizado_em: null,
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.por_conta).toEqual([])
  })
  it('meses com menos de 12 posições reprova', () => {
    expect(antecipacoesSchema.safeParse({ ...leitura(), meses: [mes()] }).success).toBe(false)
  })
})
