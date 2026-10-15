import { describe, expect, it } from 'vitest'
import { custosFinanceirosSchema, prejuizosSchema } from './schemas'

// Os schemas validam o retorno REAL das RPCs de leitura (0297). A prova contra a RPC viva é do
// `rpc-contrato.test.ts` (M7); aqui, o que dá para provar sem banco: o formato do contrato
// (spec-v6-4-0-contratos.md §3) passa, e os estados-limite que o Postgres de fato serializa também.

const meses = (t: number) => [t, ...Array.from({ length: 11 }, () => 0)]
const serie = (t: number) => ({ meses: meses(t), total: t })

const custos = {
  ano: 2026, relacao: 'corrente', mes_corrente: 10,
  grupos: [{
    grupo: 'cartao', tipo: 'custo', meses: meses(-1), total: -1,
    categorias: [{ categoria_id: 7, rotulo: 'Taxa do Cartão de Crédito/Débito', meses: meses(-1), total: -1 }],
  }],
  custos: serie(-1), fin: serie(-1), receita_bruta: serie(100),
  ano_anterior_ytd: { custos: -2, fin: -2, receita_bruta: 90 },
  atualizado_em: '2026-10-15T09:00:00.123456+00:00',
}

describe('custosFinanceirosSchema', () => {
  it('o formato do contrato passa; timestamptz com offset também', () => {
    expect(custosFinanceirosSchema.safeParse(custos).success).toBe(true)
  })
  it('grupos/categorias NULL (jsonb_agg de vazio) viram []; atualizado_em NULL passa', () => {
    const r = custosFinanceirosSchema.parse({
      ...custos, grupos: null, atualizado_em: null,
    })
    expect(r.grupos).toEqual([])
    const r2 = custosFinanceirosSchema.parse({ ...custos, grupos: [{ ...custos.grupos[0], categorias: null }] })
    expect(r2.grupos[0].categorias).toEqual([])
  })
  it('ano_anterior_ytd ausente NÃO derruba a seção (só tira o Δ)', () => {
    const sem: Record<string, unknown> = { ...custos }
    delete sem.ano_anterior_ytd
    expect(custosFinanceirosSchema.safeParse(sem).success).toBe(true)
  })
  it('chave do núcleo AUSENTE é drift e reprova; 12 meses exatos', () => {
    const sem: Record<string, unknown> = { ...custos }
    delete sem.fin
    expect(custosFinanceirosSchema.safeParse(sem).success).toBe(false)
    expect(custosFinanceirosSchema.safeParse({ ...custos, custos: { meses: [1, 2], total: 3 } }).success).toBe(false)
  })
  it('relação fora de fechado/corrente/futuro e tipo de grupo fora de custo/outros reprovam', () => {
    expect(custosFinanceirosSchema.safeParse({ ...custos, relacao: 'passado' }).success).toBe(false)
    expect(custosFinanceirosSchema.safeParse({ ...custos, grupos: [{ ...custos.grupos[0], tipo: 'x' }] }).success).toBe(false)
  })
  it('grupo desconhecido (string livre) passa — a UI o mostra com o nome cru', () => {
    expect(custosFinanceirosSchema.safeParse({ ...custos, grupos: [{ ...custos.grupos[0], grupo: 'novo' }] }).success).toBe(true)
  })
})

describe('prejuizosSchema', () => {
  const prej = {
    ano: 2025, relacao: 'fechado', mes_corrente: null,
    prejuizo: serie(-10), reversao: serie(4), liquido: serie(-6),
    ano_anterior_ytd: { prejuizo: -1, reversao: 0, liquido: -1 },
    bandeja: [{ categoria_id: 3, rotulo: 'Perdas diversas', total: -2 }],
    atualizado_em: '2026-10-15T09:00:00+00:00',
  }
  it('formato do contrato passa; bandeja NULL → []', () => {
    expect(prejuizosSchema.safeParse(prej).success).toBe(true)
    expect(prejuizosSchema.parse({ ...prej, bandeja: null }).bandeja).toEqual([])
  })
  it('sem a série do líquido reprova', () => {
    const sem: Record<string, unknown> = { ...prej }
    delete sem.liquido
    expect(prejuizosSchema.safeParse(sem).success).toBe(false)
  })
})
