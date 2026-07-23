import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  fmtBRL, fmtBRL2, numBRL2, fmtMi, fmtAxisBRL, fmtMeses,
  fmtAxisPct, fmtAxisMes, fmtDate, fmtDateCompact, fmtDateLong, fmtDateMid, fmtDataHora,
  fmtDataSP, fmtDataHoraSP,
  parseLocalDate,
  mascaraMoeda, rotuloStaleness, diasDesde,
} from './fmt'

// Intl pt-BR usa NBSP (char 160) entre "R$" e o número; normalizamos para espaço comum.
const NBSP = String.fromCharCode(160)
const n = (s: string) => s.split(NBSP).join(' ')

describe('fmt — moeda', () => {
  it('fmtBRL: sem centavos, separador de milhar', () => {
    expect(n(fmtBRL(0))).toBe('R$ 0')
    expect(n(fmtBRL(1234567))).toBe('R$ 1.234.567')
  })

  it('fmtBRL2: 2 casas (operação individual)', () => {
    expect(n(fmtBRL2(1234.5))).toBe('R$ 1.234,50')
    expect(n(fmtBRL2(0))).toBe('R$ 0,00')
  })

  it('numBRL2: contábil, sem símbolo, 2 casas', () => {
    expect(numBRL2(344444.4)).toBe('344.444,40')
  })

  it('fmtMi: abreviação por faixa', () => {
    expect(n(fmtMi(1_800_000))).toBe('R$ 1,80 Mi')
    expect(n(fmtMi(600_000))).toBe('R$ 600,0 k')
    expect(n(fmtMi(1_500))).toBe('R$ 1,5 k')
    expect(n(fmtMi(999))).toBe(n(fmtBRL(999)))       // < 1k cai no fmtBRL
    expect(n(fmtMi(-2_000_000))).toBe('R$ -2,00 Mi')  // usa abs para escolher a faixa
  })

  it('fmtAxisBRL: tick curto (1 casa em Mi, arredondado em k)', () => {
    expect(fmtAxisBRL(0)).toBe('R$ 0')
    expect(n(fmtAxisBRL(1_800_000))).toBe('R$ 1,8 Mi')
    expect(n(fmtAxisBRL(600_000))).toBe('R$ 600 k')
    expect(n(fmtAxisBRL(500))).toBe('R$ 500')
  })
})

describe('fmt — números/percentual/duração', () => {
  it('fmtAxisPct', () => {
    expect(fmtAxisPct(14)).toBe('14%')
    expect(fmtAxisPct(-3.5, 1)).toBe('-3,5%')
  })

  it('fmtMeses: dias corridos → meses (30,44 d/mês)', () => {
    expect(fmtMeses(112)).toBe('3,7 meses') // 112/30,44 ≈ 3,68
    expect(fmtMeses(0)).toBe('0,0 meses')
  })
})

describe('fmt — datas (parsing por split, sem fuso)', () => {
  it('fmtAxisMes: yyyy-MM e yyyy-MM-dd', () => {
    expect(fmtAxisMes('2026-01')).toBe('jan/26')
    expect(fmtAxisMes('2026-12-31')).toBe('dez/26')
  })

  it('fmtDate / fmtDateCompact / fmtDateLong / fmtDateMid', () => {
    expect(fmtDate('2026-06-08')).toBe('08/06/2026')
    expect(fmtDateCompact('2026-05-21')).toBe('21 mai 2026')
    expect(fmtDateLong('2026-11-07')).toBe('07 de novembro de 2026')
    expect(fmtDateMid('2026-06-17')).toBe('17 de jun de 2026')
  })

  it('fmtDataHora: ingênuo (CHANGELOG local) exibe como está; timestamptz UTC converte p/ SP', () => {
    // ingênuo (sem fuso) = data local do CHANGELOG_DIRETORIA → como está, sem deslocar
    expect(fmtDataHora('2026-06-05T17:53')).toBe('05 de jun de 2026, às 17h53min')
    expect(fmtDataHora('2026-06-05')).toBe('05 de jun de 2026')
    // timestamptz UTC → fuso de São Paulo (UTC-3): 20:01Z → 17h01
    expect(fmtDataHora('2026-06-14T20:01:12Z')).toBe('14 de jun de 2026, às 17h01min')
  })

  it('fmtDataSP/fmtDataHoraSP: timestamptz UTC no fuso de São Paulo, dia correto perto da meia-noite', () => {
    // 02:30Z = 23:30 do DIA ANTERIOR em SP (UTC-3) — o split ingênuo erraria o dia
    expect(fmtDataSP('2026-06-15T02:30:00Z')).toBe('14/06/2026')
    expect(fmtDataHoraSP('2026-06-15T02:30:00Z')).toBe('14/06/2026 às 23:30')
    expect(fmtDataHoraSP('2026-06-14T20:01:12Z')).toBe('14/06/2026 às 17:01')
    expect(fmtDataHoraSP(null)).toBe('—')
  })

  it('parseLocalDate: parse LOCAL, sem deslocamento de fuso (F6)', () => {
    const d = parseLocalDate('2026-06-08')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)  // junho (0-based)
    expect(d.getDate()).toBe(8)   // NÃO 7 — o componente do dia é preservado
    expect(d.getHours()).toBe(0)
    // aceita 'yyyy-MM-ddT…' (ignora a hora)
    expect(parseLocalDate('2026-12-31T10:00').getDate()).toBe(31)
  })
})

describe('fmt — máscara de moeda em tempo real (v5.2.1/M1)', () => {
  it('interpreta os dígitos como CENTAVOS e formata pt-BR', () => {
    // "digitar 122829,13 exibe R$ 122.829,13" (a vírgula é só mais um não-dígito)
    expect(mascaraMoeda('122829,13')).toEqual({ display: 'R$ 122.829,13', valor: 122829.13 })
    expect(mascaraMoeda('100000')).toEqual({ display: 'R$ 1.000,00', valor: 1000 })
    expect(mascaraMoeda('5')).toEqual({ display: 'R$ 0,05', valor: 0.05 })
  })
  it('vazio → valor null; descarta não-dígitos (colar) e é idempotente sobre o já-formatado', () => {
    expect(mascaraMoeda('')).toEqual({ display: '', valor: null })
    expect(mascaraMoeda('abc')).toEqual({ display: '', valor: null })
    expect(mascaraMoeda('R$ 1.234,56')).toEqual({ display: 'R$ 1.234,56', valor: 1234.56 })
  })
  it('sinal negativo — saldos de conta podem ser negativos', () => {
    expect(mascaraMoeda('-10000')).toEqual({ display: '-R$ 100,00', valor: -100 })
    expect(mascaraMoeda('-')).toEqual({ display: '-', valor: null })
  })
})

describe('fmt — staleness de saldo (v5.2.1/M1, fonte única)', () => {
  it('sem data (null) → SEM staleness (decisão do Yan: "nulo = nada")', () => {
    expect(rotuloStaleness(null)).toEqual({ texto: '', cor: '', badge: null })
  })
  it('limiares: neutro ≤3 dias, atenção 4–7 (warning), alerta >7 (danger); futura/hoje neutros', () => {
    expect(rotuloStaleness(-2)).toEqual({ texto: 'data futura', cor: 'text-zinc-400', badge: null })
    expect(rotuloStaleness(0)).toEqual({ texto: 'hoje', cor: 'text-zinc-400', badge: null })
    expect(rotuloStaleness(1)).toEqual({ texto: 'há 1 dia', cor: 'text-zinc-400', badge: null })
    expect(rotuloStaleness(3)).toEqual({ texto: 'há 3 dias', cor: 'text-zinc-400', badge: null })
    expect(rotuloStaleness(5)).toEqual({ texto: 'há 5 dias', cor: 'text-warning', badge: 'warning' })
    expect(rotuloStaleness(10)).toEqual({ texto: 'há 10 dias', cor: 'text-danger', badge: 'danger' })
  })
})

describe('fmt — diasDesde (v5.2.1/M1)', () => {
  afterEach(() => vi.useRealTimers())
  it('dias corridos entre a data e HOJE (São Paulo); null sem data', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T12:00:00Z')) // ~09h em SP → dia 23
    expect(diasDesde(null)).toBeNull()
    expect(diasDesde('2026-07-23')).toBe(0)
    expect(diasDesde('2026-07-20')).toBe(3)
    expect(diasDesde('2026-07-24')).toBe(-1)
  })
})
