import { describe, expect, it } from 'vitest'
import { pctDe } from './numeros'
import {
  evolucaoParaGrafico, faixasCompletas, marcacoesOrdenadas, rotuloConcentracao,
  rotuloHistoricoDesde, rotuloPosicao, semBase, topComPct,
} from './recebiveis'
import { recebiveisSchema } from './schemas'

describe('pctDe', () => {
  it('proporção em pontos percentuais; total zero → null (nunca Infinity/NaN)', () => {
    expect(pctDe(25, 100)).toBe(25)
    expect(pctDe(1, 0)).toBeNull()
    expect(pctDe(1, 0.001)).toBeNull()
    expect(pctDe(Number.NaN, 10)).toBeNull()
  })
})

describe('faixasCompletas — as 5 faixas dos MARCADOS, sempre na ordem do atraso', () => {
  it('preenche com zero a faixa que a RPC não trouxe e mantém a ordem', () => {
    const l = faixasCompletas({
      valor: 400,
      faixas: [{ faixa: '90+', n: 3, valor: 300 }, { faixa: '1-30', n: 1, valor: 100 }],
    })
    expect(l.map(f => f.faixa)).toEqual(['nao_vencido', '1-30', '31-60', '61-90', '90+'])
    expect(l.map(f => f.n)).toEqual([0, 1, 0, 0, 3])
    expect(l.map(f => f.pct)).toEqual([0, 25, 0, 0, 75])
    expect(l[0].rotulo).toBe('Ainda não vencido')
    expect(l[4].rotulo).toBe('Mais de 90 dias')
  })

  it('sem inadimplente: 5 faixas zeradas e % nulo (sem divisão por zero)', () => {
    const l = faixasCompletas({ valor: 0, faixas: [] })
    expect(l).toHaveLength(5)
    expect(l.every(f => f.n === 0 && f.valor === 0 && f.pct === null)).toBe(true)
  })

  it('as faixas somam o total marcado quando a RPC fecha', () => {
    const l = faixasCompletas({
      valor: 195708.79,
      faixas: [{ faixa: '1-30', n: 2, valor: 8708.79 }, { faixa: '90+', n: 18, valor: 187000 }],
    })
    expect(l.reduce((s, f) => s + f.valor, 0)).toBeCloseTo(195708.79, 2)
    expect(l.reduce((s, f) => s + (f.pct ?? 0), 0)).toBeCloseTo(100, 6)
  })
})

describe('marcacoesOrdenadas — contexto dos títulos em aberto', () => {
  it('ordem fixa, sem marcação por último; só as que existem; total = em aberto', () => {
    const { linhas, total } = marcacoesOrdenadas([
      { conferido: null, n: 21, valor: 101000 },
      { conferido: 'Sim', n: 1, valor: 500 },
      { conferido: 'Enviado para o banco', n: 3, valor: 3000 },
      { conferido: 'Pendente', n: 76, valor: 341000 },
      { conferido: 'Inadimplente', n: 20, valor: 195708.79 },
    ])
    // A ordem é a da RPC: Inadimplente, Pendente, Enviado para o banco, Sim, sem marcação.
    expect(linhas.map(l => l.rotulo)).toEqual([
      'Inadimplente', 'Pendente', 'Enviado para o banco', 'Conferido (Sim)', 'Sem marcação',
    ])
    expect(total.n).toBe(121)
    expect(total.valor).toBeCloseTo(641208.79, 2)
    expect(linhas.reduce((s, l) => s + (l.pct ?? 0), 0)).toBeCloseTo(100, 6)
  })

  it('lista vazia → sem linhas e total zero', () => {
    expect(marcacoesOrdenadas([])).toEqual({ linhas: [], total: { n: 0, valor: 0 } })
  })
})

describe('rótulos', () => {
  it('posição "na carga de DD/MM" e histórico desde', () => {
    expect(rotuloPosicao('2026-10-15')).toBe('na carga de 15/10')
    expect(rotuloHistoricoDesde('2026-09-25')).toBe('histórico desde 25/09/2026')
    expect(rotuloHistoricoDesde(null)).toBeNull()
  })

  it('"10 maiores = X%" SEM nome; sem inadimplente → nada', () => {
    expect(rotuloConcentracao(62.34, 20)).toBe('10 maiores = 62,3%')
    expect(rotuloConcentracao(null, 0)).toBeNull()
    expect(rotuloConcentracao(100, 0)).toBeNull()
  })
})

describe('topComPct', () => {
  it('posição 1..N e % sobre o TOTAL marcado; pessoa nula é preservada para a tela rotular', () => {
    const t = topComPct(
      { top: [{ pessoa: 'Cliente A', n: 2, valor: 50 }, { pessoa: null, n: 1, valor: 25 }], valor_top: 75, pct_top: 75 },
      100,
    )
    expect(t.map(x => x.posicao)).toEqual([1, 2])
    expect(t.map(x => x.pct)).toEqual([50, 25])
    expect(t[1].pessoa).toBeNull()
  })
})

describe('evolucaoParaGrafico — só os meses COM foto, nunca zero fabricado', () => {
  it('ordena do mais antigo ao mais recente e rotula o mês', () => {
    const p = evolucaoParaGrafico([
      { mes: '2026-10', data_posicao: '2026-10-15', inadimplente_n: 20, inadimplente_valor: 195708.79, a_vencer_valor: 1 },
      { mes: '2026-09', data_posicao: '2026-09-25', inadimplente_n: 22, inadimplente_valor: 210000, a_vencer_valor: 1 },
    ])
    expect(p.map(x => x.rotulo)).toEqual(['set/26', 'out/26'])
    expect(p.map(x => x.valor)).toEqual([210000, 195708.79])
  })
  it('sem foto → lista vazia (a seção diz "histórico desde", não desenha zero)', () => {
    expect(evolucaoParaGrafico([])).toEqual([])
  })
})

describe('contrato: o retorno SEM BASE passa no schema e é lido como sem base', () => {
  const semCarga = {
    carga: null,
    a_vencer: { n: 0, valor: 0 },
    inadimplente: { n: 0, valor: 0, faixas: [] },
    marcacao_em_aberto: [],
    concentracao: { top: [], valor_top: 0, pct_top: null },
    recuperado_ano: { ano: 2026, n: 0, valor: 0 },
    comparativo: null,
    evolucao: [],
    historico_desde: null,
  }
  it('arrays vazios e arrays NULL (jsonb_agg de vazio) viram []', () => {
    const r = recebiveisSchema.parse(semCarga)
    expect(semBase(r)).toBe(true)
    const comNulls = recebiveisSchema.parse({
      ...semCarga,
      inadimplente: { n: 0, valor: 0, faixas: null },
      marcacao_em_aberto: null,
      concentracao: { top: null, valor_top: 0, pct_top: null },
      evolucao: null,
    })
    expect(comNulls.inadimplente.faixas).toEqual([])
    expect(comNulls.marcacao_em_aberto).toEqual([])
    expect(comNulls.concentracao.top).toEqual([])
    expect(comNulls.evolucao).toEqual([])
  })
  it('chave que SOME é drift e reprova', () => {
    const semChave: Record<string, unknown> = { ...semCarga }
    delete semChave.comparativo
    expect(recebiveisSchema.safeParse(semChave).success).toBe(false)
  })
  it('faixa ou marcação fora do domínio reprova', () => {
    expect(recebiveisSchema.safeParse({
      ...semCarga, inadimplente: { n: 1, valor: 1, faixas: [{ faixa: '5-10', n: 1, valor: 1 }] },
    }).success).toBe(false)
    expect(recebiveisSchema.safeParse({
      ...semCarga, marcacao_em_aberto: [{ conferido: 'Talvez', n: 1, valor: 1 }],
    }).success).toBe(false)
  })
})
