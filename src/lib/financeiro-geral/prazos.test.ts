import { describe, expect, it } from 'vitest'
import {
  fmtDias, fmtFolga, interpretarFolga, pontosDaSerie, prazoMedio, prazosConferem, rotuloJanela,
} from './prazos'
import { prazosSchema } from './schemas'

describe('prazoMedio — saldo ÷ fluxo dos 12 meses × 365', () => {
  it('conta o método e arredonda a 1 casa', () => {
    expect(prazoMedio(1000, 3650)).toBe(100)
    expect(prazoMedio(500, 3000)).toBe(60.8)
  })
  it('usa o módulo (repasse a pagar e pagamento vêm no sinal da DRE)', () => {
    expect(prazoMedio(-1000, -3650)).toBe(100)
  })
  it('fluxo zero → null, nunca Infinity', () => {
    expect(prazoMedio(1000, 0)).toBeNull()
    expect(prazoMedio(Number.NaN, 10)).toBeNull()
  })
})

describe('formatadores', () => {
  it('dias com vírgula e 1 casa; null → travessão; -0 não aparece', () => {
    expect(fmtDias(45.34)).toBe('45,3 dias')
    expect(fmtDias(null)).toBe('—')
    expect(fmtDias(-0.01)).toBe('0,0 dias')
  })
  it('folga com sinal explícito e o menos tipográfico', () => {
    expect(fmtFolga(12.46)).toBe('+12,5 dias')
    expect(fmtFolga(-3)).toBe('−3,0 dias')
    expect(fmtFolga(0)).toBe('0,0 dias')
    expect(fmtFolga(null)).toBe('—')
  })
  it('janela explícita', () => {
    expect(rotuloJanela({ janela_de: '2025-10-01', janela_ate: '2026-09-30' }))
      .toBe('12 meses fechados, de 01/10/2025 a 30/09/2026')
  })
})

describe('interpretarFolga', () => {
  it('positiva favorável, negativa desfavorável, zero neutra, null sem leitura', () => {
    expect(interpretarFolga(10)?.sentido).toBe('favoravel')
    expect(interpretarFolga(-10)?.sentido).toBe('desfavoravel')
    expect(interpretarFolga(0.04)?.sentido).toBe('neutro')
    expect(interpretarFolga(null)).toBeNull()
  })
})

describe('pontosDaSerie', () => {
  it('ordena pelas fotos e rotula dd/mm; vazia → []', () => {
    const p = pontosDaSerie([
      { data: '2026-10-15', pmr: 40, pmp: 60, folga: 20 },
      { data: '2026-09-25', pmr: 41, pmp: 59, folga: 18 },
    ])
    expect(p.map(x => x.rotulo)).toEqual(['25/09', '15/10'])
    expect(pontosDaSerie([])).toEqual([])
  })
})

describe('contrato: schema e conferência do método', () => {
  const atual = {
    data: '2026-10-15', saldo_receber: 1000, saldo_pagar: -2000, entrada_12m: 3650, pagamento_12m: -7300,
    janela_de: '2025-10-01', janela_ate: '2026-09-30', pmr: 100, pmp: 100, folga: 0,
  }
  it('foto que fecha com o método confere; PMR adulterado não', () => {
    const r = prazosSchema.parse({ atual, serie: [{ data: '2026-10-15', pmr: 100, pmp: 100, folga: 0 }], historico_desde: '2026-09-25' })
    expect(prazosConferem(r.atual!)).toBe(true)
    expect(prazosConferem({ ...r.atual!, pmr: 90 })).toBe(false)
  })
  it('sem foto (atual null) e série NULL do Postgres passam; série vira []', () => {
    const r = prazosSchema.parse({ atual: null, serie: null, historico_desde: null })
    expect(r.atual).toBeNull()
    expect(r.serie).toEqual([])
  })
  it('pmr/pmp nulos (fluxo zero) passam no schema', () => {
    expect(prazosSchema.safeParse({
      atual: { ...atual, entrada_12m: 0, pmr: null, folga: null }, serie: [], historico_desde: null,
    }).success).toBe(true)
  })
})
