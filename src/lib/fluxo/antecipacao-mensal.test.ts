import { describe, it, expect } from 'vitest'
import {
  antecipacoesMensalSchema,
  mesclarAntecipacoes,
  type AntecipacaoMensalRow,
} from './antecipacao-mensal'

const linha = (mes: string, entrada_efetivada: number) => ({
  mes,
  entrada_efetivada,
  entrada_prevista: 0,
  saida_efetivada: 0,
  saida_prevista: 0,
  resultado_mensal: 0,
})

const antec = (mes: string, liquido: number, n = 1): AntecipacaoMensalRow => ({
  mes, liquido, n,
})

describe('mesclarAntecipacoes', () => {
  it('mês sem registro: antecipação 0, barra toda verde, sem flag', () => {
    const [r] = mesclarAntecipacoes([linha('2026-03', 1000)], [antec('2026-04', 500)])
    expect(r.antecipacao).toBe(0)
    expect(r.entrada_efetivada_sem_antecipacao).toBe(1000)
    expect(r.antecipacaoLiquidaRegistrada).toBe(0)
    expect(r.antecipacaoExcedeu).toBe(false)
    expect(r.pctAntecipacao).toBe(0)
  })

  it('sem nenhuma antecipação (null/undefined/vazio) não altera nada', () => {
    for (const vazio of [null, undefined, []]) {
      const [r] = mesclarAntecipacoes([linha('2026-04', 7_210_000)], vazio)
      expect(r.antecipacao).toBe(0)
      expect(r.entrada_efetivada_sem_antecipacao).toBe(7_210_000)
      expect(r.antecipacaoExcedeu).toBe(false)
    }
  })

  it('antecipação parcial: divide a barra e calcula o percentual', () => {
    const [r] = mesclarAntecipacoes([linha('2026-04', 1000)], [antec('2026-04', 250)])
    expect(r.antecipacao).toBe(250)
    expect(r.entrada_efetivada_sem_antecipacao).toBe(750)
    expect(r.antecipacao + r.entrada_efetivada_sem_antecipacao).toBe(r.entrada_efetivada)
    expect(r.antecipacaoLiquidaRegistrada).toBe(250)
    expect(r.antecipacaoExcedeu).toBe(false)
    expect(r.pctAntecipacao).toBeCloseTo(0.25, 10)
  })

  it('registro igual às entradas: 100% âmbar, sem flag de excedente', () => {
    const [r] = mesclarAntecipacoes([linha('2026-04', 1000)], [antec('2026-04', 1000)])
    expect(r.antecipacao).toBe(1000)
    expect(r.entrada_efetivada_sem_antecipacao).toBe(0)
    expect(r.antecipacaoExcedeu).toBe(false)
    expect(r.pctAntecipacao).toBe(1)
  })

  it('registro maior que as entradas: clamp no total + flag, líquido registrado preservado', () => {
    const [r] = mesclarAntecipacoes([linha('2026-04', 1000)], [antec('2026-04', 1500)])
    expect(r.antecipacao).toBe(1000)
    expect(r.entrada_efetivada_sem_antecipacao).toBe(0)
    expect(r.antecipacaoLiquidaRegistrada).toBe(1500)
    expect(r.antecipacaoExcedeu).toBe(true)
    expect(r.pctAntecipacao).toBe(1)
  })

  it('mês só previsto (entrada efetivada 0): âmbar 0, flag liga, pct null', () => {
    const [r] = mesclarAntecipacoes([linha('2026-12', 0)], [antec('2026-12', 300)])
    expect(r.antecipacao).toBe(0)
    expect(r.entrada_efetivada_sem_antecipacao).toBe(0)
    expect(r.antecipacaoLiquidaRegistrada).toBe(300)
    expect(r.antecipacaoExcedeu).toBe(true)
    expect(r.pctAntecipacao).toBeNull()
  })

  it('entrada efetivada negativa: âmbar 0, barra preserva o negativo, flag liga, pct null', () => {
    const [r] = mesclarAntecipacoes([linha('2026-05', -200)], [antec('2026-05', 100)])
    expect(r.antecipacao).toBe(0)
    expect(r.entrada_efetivada_sem_antecipacao).toBe(-200)
    expect(r.antecipacaoExcedeu).toBe(true)
    expect(r.pctAntecipacao).toBeNull()
  })

  it('mês só previsto sem registro: tudo 0, sem flag, pct null', () => {
    const [r] = mesclarAntecipacoes([linha('2026-12', 0)], [])
    expect(r.antecipacao).toBe(0)
    expect(r.antecipacaoExcedeu).toBe(false)
    expect(r.pctAntecipacao).toBeNull()
  })

  it('mês do registro fora da janela da RPC mensal é ignorado (nem cria linha, nem muda as outras)', () => {
    const rows = [linha('2026-03', 1000), linha('2026-04', 2000)]
    const out = mesclarAntecipacoes(rows, [antec('2019-01', 999_999), antec('2026-04', 500)])
    expect(out).toHaveLength(2)
    expect(out.map(o => o.mes)).toEqual(['2026-03', '2026-04'])
    expect(out[0].antecipacao).toBe(0)
    expect(out[1].antecipacao).toBe(500)
  })

  it('registros repetidos do mesmo mês são somados', () => {
    const [r] = mesclarAntecipacoes([linha('2026-04', 1000)], [antec('2026-04', 100), antec('2026-04', 200)])
    expect(r.antecipacao).toBe(300)
    expect(r.antecipacaoLiquidaRegistrada).toBe(300)
  })

  it('líquido negativo nunca vira antecipação negativa', () => {
    const [r] = mesclarAntecipacoes([linha('2026-04', 1000)], [antec('2026-04', -50)])
    expect(r.antecipacao).toBe(0)
    expect(r.entrada_efetivada_sem_antecipacao).toBe(1000)
    expect(r.antecipacaoExcedeu).toBe(false)
  })

  it('preserva os demais campos da linha e não muta a entrada', () => {
    const original = { ...linha('2026-04', 1000), resultado_mensal: -42, saida_efetivada: 7 }
    const copia = { ...original }
    const [r] = mesclarAntecipacoes([original], [antec('2026-04', 100)])
    expect(r.resultado_mensal).toBe(-42)
    expect(r.saida_efetivada).toBe(7)
    expect(r.entrada_efetivada).toBe(1000)
    expect(original).toEqual(copia)
  })
})

describe('antecipacoesMensalSchema', () => {
  it('aceita o shape da RPC e tolera coluna extra', () => {
    const r = antecipacoesMensalSchema.safeParse([
      { mes: '2026-04', liquido: 700_300.5, n: 3, extra: 'x' },
    ])
    expect(r.success).toBe(true)
  })

  it('NULL (json_agg de conjunto vazio) normaliza para []', () => {
    const r = antecipacoesMensalSchema.safeParse(null)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual([])
  })

  it('rejeita mês fora de YYYY-MM e campo numérico ausente', () => {
    expect(antecipacoesMensalSchema.safeParse([{ mes: '04/2026', liquido: 1, n: 1 }]).success).toBe(false)
    expect(antecipacoesMensalSchema.safeParse([{ mes: '2026-04', n: 1 }]).success).toBe(false)
  })
})
